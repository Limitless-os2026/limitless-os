-- Checks for the company structure migrations and access rules.
-- Run by run.sh after the migrations, as the database owner. Each check
-- raises an error, which stops the run, when it fails.

\set ON_ERROR_STOP 1

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Act as a signed-in person (or nobody, with null) for what follows.
create function tests.sign_in(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when user_id is null then '' else json_build_object('sub', user_id, 'role', 'authenticated')::text end,
    false)
$$;

create function tests.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then
    raise exception 'FAILED: %', what;
  end if;
  raise notice 'ok: %', what;
end;
$$;

create function tests.count_rows(query text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) as q', query) into n;
  return n;
end;
$$;

-- Runs a statement that must fail with the given error code.
create function tests.fails(statement text, expected_code text, what text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_code then
      raise notice 'ok: %', what;
      return;
    end if;
    raise exception 'FAILED: % (expected error %, got %: %)', what, expected_code, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % (it was allowed)', what;
end;
$$;

-- Runs a statement that must change no rows (row level security hides them).
create function tests.changes_nothing(statement text, what text) returns void language plpgsql as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  perform tests.check(n = 0, what);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference rows and the first Admin
-- ---------------------------------------------------------------------------

select tests.check((select count(*) from public.states) = 2, 'two states');
select tests.check(
  (select string_agg(o.name || ' ' || s.code || ' ' || o.time_zone, ', ' order by o.name)
     from public.offices o join public.states s on s.id = o.state_id)
  = 'American Fork UT America/Denver, Reading PA America/New_York',
  'two offices with their states and time zones');
select tests.check(
  (select string_agg(key || ':' || scope, ',' order by key) from public.roles)
  = 'accountant:company,admin:company,project_manager:office,sales:own',
  'four roles with their scopes');
select tests.check(
  not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
               where r.key = 'sales' and rp.permission_key = 'view_partner_reports'),
  'partner reports are off for Sales');
select tests.check(
  not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
               where r.key = 'project_manager' and rp.permission_key in ('manage_permissions', 'manage_users')),
  'project managers cannot change permissions or people');
select tests.check(
  (select r.key from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = '00000000-0000-0000-0000-00000000000a') = 'admin',
  'an account made before the migrations gets a profile and becomes Admin');
select tests.check(
  (select created_by is null and created_at is not null and updated_at is not null
     from public.states where code = 'PA'),
  'standard columns are filled in by the database');

-- New accounts after the first start as Sales with no office.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000b', 'sales@example.com', '{"first_name": "Sam", "last_name": "Seller"}'),
  ('00000000-0000-0000-0000-00000000000c', 'pm@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'leaver@example.com', '{}');

select tests.check(
  (select r.key = 'sales' and p.primary_office_id is null and p.is_active
          and p.first_name = 'Sam' and p.last_name = 'Seller' and p.email = 'sales@example.com'
     from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = '00000000-0000-0000-0000-00000000000b'),
  'a later account starts as active Sales with no office, named from sign-up details');
select tests.check(
  not exists (select 1 from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000b'),
  'a later account belongs to no office');
select tests.check(
  (select count(*) from public.profiles p join public.roles r on r.id = p.role_id where r.key = 'admin') = 1,
  'only the first account is Admin');
select tests.check(
  (select count(*) from public.audit_log where table_name = 'profiles' and action = 'insert') = 4,
  'new profiles are written to the audit trail');

update auth.users set email = 'sam@example.com' where id = '00000000-0000-0000-0000-00000000000b';
select tests.check(
  (select email from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'sam@example.com',
  'a changed sign-in email follows through to the profile');

-- ---------------------------------------------------------------------------
-- Signed out: nothing at all
-- ---------------------------------------------------------------------------

set role anon;
select tests.sign_in(null);
select tests.fails('select * from public.states', '42501', 'signed-out visitors cannot read states');
select tests.fails('select * from public.profiles', '42501', 'signed-out visitors cannot read profiles');
select tests.fails('select * from public.audit_log', '42501', 'signed-out visitors cannot read the audit trail');
select tests.fails(
  $$select public.update_person('00000000-0000-0000-0000-00000000000b', 'A', 'B', null, '{}', null, true)$$,
  '42501', 'signed-out visitors cannot change people');
reset role;

-- ---------------------------------------------------------------------------
-- The Admin
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000a');

select tests.check(public.has_permission('manage_users'), 'the Admin can manage people');
select tests.check(tests.count_rows('select * from public.profiles') = 4, 'the Admin sees everyone');

-- Make C a Project manager in both offices, Reading as the main office.
select public.update_person(
  '00000000-0000-0000-0000-00000000000c', ' Pat ', 'Manager',
  (select id from public.roles where key = 'project_manager'),
  array(select id from public.offices order by name),
  (select id from public.offices where name = 'Reading'),
  true);
select tests.check(
  (select r.key = 'project_manager' and p.first_name = 'Pat' and o.name = 'Reading'
     from public.profiles p join public.roles r on r.id = p.role_id join public.offices o on o.id = p.primary_office_id
    where p.id = '00000000-0000-0000-0000-00000000000c'),
  'the Admin can change a role, name and main office');
select tests.check(
  tests.count_rows($$select * from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000c'$$) = 2,
  'the Admin can put a person in two offices');

-- Take C out of American Fork.
select public.update_person(
  '00000000-0000-0000-0000-00000000000c', 'Pat', 'Manager',
  (select id from public.roles where key = 'project_manager'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'),
  true);
select tests.check(
  tests.count_rows($$select * from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'the Admin can take a person out of an office');

select tests.fails(
  $$select public.update_person('00000000-0000-0000-0000-00000000000c', 'Pat', 'Manager',
      (select id from public.roles where key = 'project_manager'),
      array(select id from public.offices where name = 'Reading'),
      (select id from public.offices where name = 'American Fork'), true)$$,
  '23514', 'the main office must be one of the person''s offices');

-- Switch D off.
select public.update_person(
  '00000000-0000-0000-0000-00000000000d', 'Lee', 'Leaver',
  (select id from public.roles where key = 'sales'), '{}', null, false);

select tests.fails(
  $$update public.profiles set email = 'x@example.com' where id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', 'email cannot be changed on the profile, only on the sign-in account');
select tests.fails(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000d'$$,
  '42501', 'profiles are never deleted, even by the Admin');
select tests.fails(
  $$insert into public.audit_log (table_name, record_id, action, changes) values ('x', gen_random_uuid(), 'insert', '{}')$$,
  '42501', 'nobody can write to the audit trail directly');
select tests.fails(
  $$update public.audit_log set changes = '{}'$$,
  '42501', 'nobody can change the audit trail, not even the Admin');
select tests.fails(
  $$update public.profiles set role_id = (select id from public.roles where key = 'sales') where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', 'the last Admin cannot demote themself');
select tests.fails(
  $$update public.profiles set is_active = false where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', 'the last Admin cannot switch themself off');
select tests.fails(
  $$delete from public.role_permissions where permission_key = 'manage_permissions'$$,
  '23514', 'the last person who can manage permissions cannot lose that permission');

-- Settings: the Admin can add an office and a team.
insert into public.offices (state_id, name, time_zone)
  values ((select id from public.states where code = 'PA'), 'Test office', 'America/New_York');
select tests.check(
  (select created_by = '00000000-0000-0000-0000-00000000000a' from public.offices where name = 'Test office'),
  'created_by is the signed-in person');
insert into public.teams (office_id, name, team_type)
  values ((select id from public.offices where name = 'Reading'), 'Reading sales', 'sales');

-- Two profile updates: C's role and name, and D switched off. Taking C out of
-- an office left the profile itself unchanged, so it adds no profile row.
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profiles' and action = 'update'
                       and changed_by = '00000000-0000-0000-0000-00000000000a'$$) = 2,
  'the Admin''s changes to people are in the audit trail, with who made them');
select tests.check(
  (select changes ? 'role_id' and not changes ? 'updated_at'
     from public.audit_log
    where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-00000000000c' and action = 'update'
    order by changed_at, id limit 1),
  'the audit trail records the old and new value of each changed field');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profile_offices' and action = 'delete'$$) = 1,
  'taking someone out of an office is in the audit trail');
reset role;

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');

select tests.check(tests.count_rows('select * from public.states') = 2, 'Sales can read states');
select tests.check(tests.count_rows('select * from public.offices') = 3, 'Sales can read offices');
select tests.check(tests.count_rows('select * from public.roles') = 4, 'Sales can read roles');
select tests.check(tests.count_rows('select * from public.profiles') = 3,
  'Sales can read the staff list of active colleagues, without the switched-off person');
select tests.check(
  tests.count_rows($$select * from public.profiles where id = '00000000-0000-0000-0000-00000000000d'$$) = 0,
  'Sales cannot see a switched-off person');
select tests.check(
  tests.count_rows($$select * from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'Sales can see which offices a colleague is in');
select tests.check(tests.count_rows('select * from public.audit_log') = 0, 'Sales cannot read the audit trail');
select tests.check(not public.has_permission('manage_users'), 'Sales cannot manage people');

select tests.fails(
  $$select public.update_person('00000000-0000-0000-0000-00000000000b', 'Sam', 'Seller',
      (select id from public.roles where key = 'admin'), '{}', null, true)$$,
  '42501', 'Sales cannot make themself Admin through the People screen');
select tests.changes_nothing(
  $$update public.profiles set role_id = (select id from public.roles where key = 'admin') where id = '00000000-0000-0000-0000-00000000000b'$$,
  'Sales cannot make themself Admin directly');
select tests.fails(
  $$insert into public.profile_offices (profile_id, office_id)
    values ('00000000-0000-0000-0000-00000000000b', (select id from public.offices where name = 'Reading'))$$,
  '42501', 'Sales cannot add themself to an office');
select tests.fails(
  $$insert into public.role_permissions (role_id, permission_key)
    values ((select id from public.roles where key = 'sales'), 'manage_users')$$,
  '42501', 'Sales cannot give their role a permission');
select tests.changes_nothing(
  $$update public.offices set name = 'Renamed'$$,
  'Sales cannot change offices');
select tests.fails(
  $$insert into public.states (code, name) values ('OH', 'Ohio')$$,
  '42501', 'Sales cannot add a state');
select tests.fails(
  $$insert into public.profiles (id, role_id) values ('00000000-0000-0000-0000-00000000000b', (select id from public.roles limit 1))$$,
  '42501', 'nobody can add a profile from the app');
reset role;

-- ---------------------------------------------------------------------------
-- Project manager
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');

select tests.check(not public.has_permission('manage_users'), 'a Project manager cannot manage people');
select tests.check(public.has_permission('view_margins'), 'a Project manager can see margins');
select tests.fails(
  $$select public.update_person('00000000-0000-0000-0000-00000000000b', 'Sam', 'Seller',
      (select id from public.roles where key = 'project_manager'), '{}', null, true)$$,
  '42501', 'a Project manager cannot change people');
select tests.changes_nothing(
  $$delete from public.role_permissions$$,
  'a Project manager cannot change permissions');
reset role;

-- ---------------------------------------------------------------------------
-- Switched off
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');

select tests.check(tests.count_rows('select * from public.profiles') = 1, 'a switched-off person sees only their own profile');
select tests.check(tests.count_rows('select * from public.states') = 0, 'a switched-off person sees no states');
select tests.check(tests.count_rows('select * from public.offices') = 0, 'a switched-off person sees no offices');
reset role;

-- ---------------------------------------------------------------------------
-- Several Admins: one may step down once another is in place
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000a');
select public.update_person(
  '00000000-0000-0000-0000-00000000000c', 'Pat', 'Manager',
  (select id from public.roles where key = 'admin'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
select public.update_person(
  '00000000-0000-0000-0000-00000000000a', 'Olive', 'Owner',
  (select id from public.roles where key = 'project_manager'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
select tests.check(not public.has_permission('manage_users'), 'an Admin can step down once there is another Admin');
reset role;

select tests.check(
  (select count(*) from public.profiles p join public.roles r on r.id = p.role_id where r.key = 'admin') = 1,
  'there is still exactly one Admin');

-- Accounts with profiles cannot be removed, so history is kept.
select tests.fails(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000000d'$$,
  '23503', 'a sign-in account with a profile cannot be deleted');

-- Every table has row level security switched on.
select tests.check(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  'row level security is on for every table');

-- ---------------------------------------------------------------------------
-- Decisions from step 2: starting permissions, auditing roles
-- ---------------------------------------------------------------------------

select tests.check(
  (select string_agg(rp.permission_key, ',' order by rp.permission_key)
     from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'admin')
  = 'edit_office_details,edit_sales_credits,manage_partner_structure,manage_permissions,manage_settings,manage_teams,manage_users,reassign_jobs,view_audit_log,view_commissions,view_margins,view_partner_reports',
  'Admin has every permission');
select tests.check(
  (select string_agg(rp.permission_key, ',' order by rp.permission_key)
     from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'project_manager')
  = 'edit_office_details,edit_sales_credits,manage_partner_structure,manage_teams,reassign_jobs,view_audit_log,view_commissions,view_margins,view_partner_reports',
  'Project manager has everything except managing people, roles, permissions and company settings');
select tests.check(
  (select string_agg(rp.permission_key, ',' order by rp.permission_key)
     from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'accountant')
  = 'view_commissions,view_margins,view_partner_reports',
  'Accountant has view_margins, view_commissions and view_partner_reports');
select tests.check(
  not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'sales'),
  'Sales has none of the special permissions');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'role_permissions' and action = 'delete'
             and changes -> 'permission_key' ->> 'old' = 'view_commissions'),
  'taking a permission away from a role is in the audit trail');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.roles set name = 'Salesperson' where key = 'sales';
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'roles' and action = 'update'
             and changed_by = '00000000-0000-0000-0000-00000000000c'
             and changes -> 'name' ->> 'new' = 'Salesperson'),
  'renaming a role is in the audit trail, with who did it');
update public.roles set name = 'Sales' where key = 'sales';
select tests.check(
  tests.count_rows($$select * from public.profiles where id = '00000000-0000-0000-0000-00000000000d'$$) = 1,
  'the Admin still sees people who are switched off');
reset role;

-- ---------------------------------------------------------------------------
-- Teams: Admins manage every team, Project managers the teams in their offices
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000e', 'office.pm@example.com'),
  ('00000000-0000-0000-0000-00000000000f', 'new.hire@example.com');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.update_person(
  '00000000-0000-0000-0000-00000000000e', 'Robin', 'Reading',
  (select id from public.roles where key = 'project_manager'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
insert into public.teams (office_id, name, team_type)
  values ((select id from public.offices where name = 'American Fork'), 'Utah crew', 'ems_crew');
select tests.check(true, 'an Admin can add a team in any office');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
insert into public.teams (office_id, name, team_type)
  values ((select id from public.offices where name = 'Reading'), 'Reading roofing crew', 'production');
select tests.check(true, 'a Project manager can add a team in their own office');
select tests.fails(
  $$insert into public.teams (office_id, name, team_type)
    values ((select id from public.offices where name = 'American Fork'), 'Not mine', 'sales')$$,
  '42501', 'a Project manager cannot add a team in another office');
select tests.changes_nothing(
  $$update public.teams set name = 'Renamed' where name = 'Utah crew'$$,
  'a Project manager cannot change a team in another office');
select tests.fails(
  $$update public.teams set office_id = (select id from public.offices where name = 'American Fork')
     where name = 'Reading roofing crew'$$,
  '42501', 'a Project manager cannot move a team into another office');
insert into public.team_members (team_id, profile_id, is_lead)
  values ((select id from public.teams where name = 'Reading roofing crew'), '00000000-0000-0000-0000-00000000000b', true);
select tests.check(true, 'a Project manager can add people to a team in their office');
select tests.fails(
  $$insert into public.team_members (team_id, profile_id)
    values ((select id from public.teams where name = 'Utah crew'), '00000000-0000-0000-0000-00000000000b')$$,
  '42501', 'a Project manager cannot add people to a team in another office');
select tests.fails(
  $$update public.offices set name = 'Renamed'$$,
  '42501', 'a Project manager cannot rename an office');
select tests.check(tests.count_rows('select * from public.audit_log') > 0, 'a Project manager can read the audit trail');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.fails(
  $$insert into public.teams (office_id, name, team_type)
    values ((select id from public.offices where name = 'Reading'), 'Mine', 'sales')$$,
  '42501', 'Sales cannot add a team');
reset role;

-- ---------------------------------------------------------------------------
-- Temporary passwords
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.fails(
  $$select public.require_password_change('00000000-0000-0000-0000-00000000000f')$$,
  '42501', 'Sales cannot force a password change');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.require_password_change('00000000-0000-0000-0000-00000000000f');
reset role;

select tests.check(
  (select must_change_password from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  'an Admin can mark a password as temporary');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-00000000000f'
             and changed_by = '00000000-0000-0000-0000-00000000000c' and changes ? 'must_change_password'),
  'issuing a temporary password is in the audit trail, with who did it');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000f');
select tests.check(tests.count_rows('select * from public.profiles') = 1, 'on a temporary password, a person sees only their own profile');
select tests.check(tests.count_rows('select * from public.states') = 0, 'on a temporary password, a person sees nothing else');
select tests.fails(
  $$select public.update_my_details('New', 'Hire', '555-0100')$$,
  '42501', 'on a temporary password, a person cannot change their details');
select tests.fails(
  $$update public.profiles set must_change_password = false where id = '00000000-0000-0000-0000-00000000000f'$$,
  '42501', 'nobody can clear the temporary password flag by hand');
reset role;

-- The sign-in service saves the person's own password.
update auth.users set encrypted_password = 'their-own' where id = '00000000-0000-0000-0000-00000000000f';
select tests.check(
  not (select must_change_password from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  'choosing a new password clears the temporary flag');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000f');
select tests.check(tests.count_rows('select * from public.states') = 2, 'after choosing a password, the person can use the app');
reset role;

-- ---------------------------------------------------------------------------
-- Your own name and phone
-- ---------------------------------------------------------------------------

set role anon;
select tests.sign_in(null);
select tests.fails(
  $$select public.update_my_details('A', 'B', 'C')$$,
  '42501', 'signed-out visitors cannot change details');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select public.update_my_details(' Samantha ', 'Seller', ' 555-0101 ');
reset role;

select tests.check(
  (select first_name = 'Samantha' and phone = '555-0101' and r.key = 'sales'
     from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = '00000000-0000-0000-0000-00000000000b'),
  'a person can change their own name and phone, and nothing else changes');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-00000000000b'
             and changed_by = '00000000-0000-0000-0000-00000000000b' and changes ? 'phone'),
  'changing your own details is in the audit trail');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');
select tests.fails(
  $$select public.update_my_details('Lee', 'Back', null)$$,
  '42501', 'a switched-off person cannot change their details');
reset role;

-- ---------------------------------------------------------------------------
-- Step 3 starts here. More helpers, and the seed data is intact.
-- ---------------------------------------------------------------------------

-- Counts rows as the database owner, so row level security does not apply:
-- the whole picture, to compare against what a signed-in person sees.
create function tests.count_all(query text) returns bigint language plpgsql security definer as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) as q', query) into n;
  return n;
end;
$$;

-- The id of the customer with this phone number, whoever is signed in, so a
-- check can point at a customer the signed-in person is not allowed to see.
create function tests.customer_id(customer_phone text) returns uuid language sql security definer as $$
  select id from public.customers where phone = customer_phone
$$;

-- Runs a statement that must fail with the given error code and message.
create function tests.fails_saying(statement text, expected_code text, expected_message text, what text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_code and sqlerrm = expected_message then
      raise notice 'ok: %', what;
      return;
    end if;
    raise exception 'FAILED: % (expected error % saying "%", got %: %)', what, expected_code, expected_message, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % (it was allowed)', what;
end;
$$;

grant execute on function tests.count_all(text), tests.customer_id(text), tests.fails_saying(text, text, text, text) to anon, authenticated;

select tests.check((select count(*) from public.customers) = 4, 'four seeded customers');
select tests.check((select count(*) from public.properties) = 5, 'five seeded properties');
select tests.check((select count(*) from public.organizations) = 7, 'seven seeded organizations');
select tests.check((select count(*) from public.contacts) = 6, 'six seeded contacts');
select tests.check(
  (select count(*) from public.organizations f join public.organizations g on g.id = f.parent_organization_id
    where f.org_type = 'servpro_franchise' and g.org_type = 'servpro_group') = 3,
  'each seeded franchise points to its ownership group');
select tests.check(
  (select phone_digits from public.customers where first_name = 'Dana') = '6105550101',
  'the seeded customers have their phone digits filled in');

-- ---------------------------------------------------------------------------
-- More people for step 3: an Accountant in Reading, a Sales rep and a Project
-- manager in American Fork, someone about to leave, and Sam joins Reading.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'accountant@example.com'),
  ('00000000-0000-0000-0000-000000000012', 'utah.sales@example.com'),
  ('00000000-0000-0000-0000-000000000013', 'utah.pm@example.com'),
  ('00000000-0000-0000-0000-000000000014', 'leaving@example.com');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.update_person(
  '00000000-0000-0000-0000-000000000011', 'Avery', 'Ledger',
  (select id from public.roles where key = 'accountant'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
select public.update_person(
  '00000000-0000-0000-0000-000000000012', 'Jesse', 'Alpine',
  (select id from public.roles where key = 'sales'),
  array(select id from public.offices where name = 'American Fork'),
  (select id from public.offices where name = 'American Fork'), true);
select public.update_person(
  '00000000-0000-0000-0000-000000000013', 'Morgan', 'Fairfield',
  (select id from public.roles where key = 'project_manager'),
  array(select id from public.offices where name = 'American Fork'),
  (select id from public.offices where name = 'American Fork'), true);
select public.update_person(
  '00000000-0000-0000-0000-000000000014', 'Harper', 'Leaving',
  (select id from public.roles where key = 'sales'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
select public.update_person(
  '00000000-0000-0000-0000-00000000000b', 'Samantha', 'Seller',
  (select id from public.roles where key = 'sales'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
select tests.check(
  (select o.name from public.profiles p join public.offices o on o.id = p.primary_office_id
    where p.id = '00000000-0000-0000-0000-00000000000b') = 'Reading',
  'Sam now works out of Reading');
select tests.check(
  (select string_agg(r.key || ':' || o.name, ',' order by p.id)
     from public.profiles p join public.roles r on r.id = p.role_id join public.offices o on o.id = p.primary_office_id
    where p.id in ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013'))
  = 'accountant:Reading,sales:American Fork,project_manager:American Fork',
  'an Accountant in Reading and a Sales rep and a Project manager in American Fork');
reset role;

-- ---------------------------------------------------------------------------
-- Office details: Project managers edit the phone and address of their own
-- offices. Everything else about an office stays with Admins.
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
update public.offices
   set phone = '610-555-0199', address_line1 = '400 Penn Street', city = 'Reading', zip = '19601'
 where name = 'Reading';
select tests.check(
  (select phone = '610-555-0199' and address_line1 = '400 Penn Street' and city = 'Reading' and zip = '19601'
     from public.offices where name = 'Reading'),
  'a Project manager can change the phone and address of their own office');
select tests.changes_nothing(
  $$update public.offices set phone = '801-555-0199' where name = 'American Fork'$$,
  'a Project manager cannot change the phone of an office they are not in');
select tests.fails(
  $$update public.offices set name = 'Reading West' where name = 'Reading'$$,
  '42501', 'a Project manager cannot rename their own office');
select tests.fails(
  $$update public.offices set state_id = (select id from public.states where code = 'UT') where name = 'Reading'$$,
  '42501', 'a Project manager cannot move their office to another state');
select tests.fails(
  $$update public.offices set time_zone = 'America/Chicago' where name = 'Reading'$$,
  '42501', 'a Project manager cannot change their office''s time zone');
select tests.fails(
  $$update public.offices set is_active = false where name = 'Reading'$$,
  '42501', 'a Project manager cannot close their office');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.offices set name = 'Reading HQ' where name = 'Reading';
select tests.check(exists (select 1 from public.offices where name = 'Reading HQ'), 'an Admin can rename an office');
update public.offices set name = 'Reading' where name = 'Reading HQ';
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.changes_nothing(
  $$update public.offices set phone = '610-555-0000' where name = 'Reading'$$,
  'Sales cannot change the phone of their own office');
reset role;

select tests.check(
  (select phone from public.offices where name = 'American Fork') is null
  and (select phone from public.offices where name = 'Reading') = '610-555-0199',
  'the refused office changes left the offices as they were');

-- ---------------------------------------------------------------------------
-- Every active person belongs to at least one office
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.fails_saying(
  $$select public.update_person('00000000-0000-0000-0000-00000000000b', 'Samantha', 'Seller',
      (select id from public.roles where key = 'sales'), '{}', null, true)$$,
  '23514', 'Pick at least one office.', 'an active person cannot be left with no office');
select tests.fails_saying(
  $$select public.update_person('00000000-0000-0000-0000-000000000011', 'Avery', 'Ledger',
      (select id from public.roles where key = 'accountant'), null, null, true)$$,
  '23514', 'Pick at least one office.', 'a company-wide role such as Accountant still needs an office');
select tests.check(
  tests.count_rows($$select * from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000b'$$) = 1,
  'a refused change leaves the person''s offices as they were');
select public.update_person(
  '00000000-0000-0000-0000-00000000000d', 'Lee', 'Leaver',
  (select id from public.roles where key = 'sales'), '{}', null, false);
select tests.check(
  (select not is_active from public.profiles where id = '00000000-0000-0000-0000-00000000000d')
  and tests.count_rows($$select * from public.profile_offices where profile_id = '00000000-0000-0000-0000-00000000000d'$$) = 0,
  'a switched-off person may be left with no office');
reset role;

-- ---------------------------------------------------------------------------
-- Sign out everywhere: a password reset, or switching someone off, ends their
-- sign-in sessions on every device
-- ---------------------------------------------------------------------------

-- Signed in on two devices each, and Lee has a session left from before.
insert into auth.sessions (user_id) values
  ('00000000-0000-0000-0000-00000000000f'), ('00000000-0000-0000-0000-00000000000f'),
  ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-000000000014'), ('00000000-0000-0000-0000-000000000014'),
  ('00000000-0000-0000-0000-00000000000d');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.require_password_change('00000000-0000-0000-0000-00000000000f');
reset role;
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000f') = 0,
  'a password reset signs the person out on every device');
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b') = 2,
  'a password reset leaves everyone else signed in');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.update_person(
  '00000000-0000-0000-0000-000000000014', 'Harper', 'Leaving-Soon',
  (select id from public.roles where key = 'sales'),
  array(select id from public.offices where name = 'Reading'),
  (select id from public.offices where name = 'Reading'), true);
reset role;
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-000000000014') = 2,
  'changing someone''s name does not sign them out');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select public.update_my_details('Samantha', 'Seller', '555-0109');
reset role;
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b') = 2,
  'changing your own phone does not sign you out');

-- Switched off directly rather than through the People screen, to show the
-- rule holds whichever way the change is made.
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000014';
reset role;
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-000000000014') = 0,
  'switching someone off signs them out on every device');
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b') = 2,
  'switching someone off leaves everyone else signed in');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select public.update_person(
  '00000000-0000-0000-0000-00000000000d', 'Lee', 'Leaver-Hart',
  (select id from public.roles where key = 'sales'), '{}', null, false);
reset role;
select tests.check(
  (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000d') = 1,
  'renaming someone who is already switched off does not touch their sessions');

-- ---------------------------------------------------------------------------
-- Customers: a name and a phone number, nothing else
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.fails(
  $$insert into public.customers (phone, office_id)
    values ('610-555-0100', (select id from public.offices where name = 'Reading'))$$,
  '23514', 'a customer needs a name');
select tests.fails(
  $$insert into public.customers (first_name, company_name, phone, office_id)
    values ('   ', '', '610-555-0100', (select id from public.offices where name = 'Reading'))$$,
  '23514', 'a blank name does not count as a name');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id)
    values ('Nadia', '555-01', (select id from public.offices where name = 'Reading'))$$,
  '23514', 'a customer needs a phone number with at least seven digits');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id)
    values ('Nadia', '', (select id from public.offices where name = 'Reading'))$$,
  '23514', 'a blank phone number does not count');
select tests.fails(
  $$insert into public.customers (first_name, office_id)
    values ('Nadia', (select id from public.offices where name = 'Reading'))$$,
  '23502', 'a customer with no phone number at all is refused');

insert into public.customers (first_name, last_name, phone, office_id)
  values ('Nadia', 'Ferreira', '(610) 555-0100', (select id from public.offices where name = 'Reading'));
select tests.check(
  (select phone_digits from public.customers where first_name = 'Nadia') = '6105550100',
  'the database keeps the digits of the phone number');
select tests.check(
  (select created_by = '00000000-0000-0000-0000-00000000000b' and customer_type = 'person' and archived_at is null
     from public.customers where first_name = 'Nadia'),
  'a new customer records who added them and starts as a person');

insert into public.customers (customer_type, company_name, phone, office_id)
  values ('company', 'Ridge Top Rentals LLC', '610-555-0203', (select id from public.offices where name = 'Reading'));
select tests.check(
  exists (select 1 from public.customers where company_name = 'Ridge Top Rentals LLC' and first_name is null),
  'a company name counts as a name');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id) values ('Nobody', '610-555-0999', gen_random_uuid())$$,
  '23503', 'a customer cannot be put in an office that does not exist');
reset role;

-- ---------------------------------------------------------------------------
-- Adding customers: in an office the person is in, or any office for
-- company-wide roles. The New customer form saves the first property too.
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id)
    values ('Nope', '801-555-0999', (select id from public.offices where name = 'American Fork'))$$,
  '42501', 'Sales cannot add a customer in an office they are not in');

do $$
declare
  new_customer uuid;
begin
  new_customer := public.add_customer(
    'person', '  Taylor ', ' Brooks ', null, '610-555-0201', ' Taylor.Brooks@Example.com ',
    (select id from public.offices where name = 'Reading'),
    ' 9 Elm Street ', null, 'Reading', 'pa', '19601', 'residential');
  perform tests.check(
    exists (select 1 from public.customers where id = new_customer and phone = '610-555-0201'),
    'the New customer form gives back the new customer');
end;
$$;
select tests.check(
  (select first_name = 'Taylor' and last_name = 'Brooks' and email = 'taylor.brooks@example.com'
     from public.customers where phone = '610-555-0201'),
  'the New customer form trims the name and lowercases the email');
select tests.check(
  (select count(*) = 1
     from public.properties p join public.customers c on c.id = p.customer_id
    where c.phone = '610-555-0201'),
  'the New customer form saves exactly one property with the customer');
select tests.check(
  (select p.address_line1 = '9 Elm Street' and p.city = 'Reading' and p.state = 'PA' and p.zip = '19601'
          and p.property_type = 'residential' and p.latitude is null and p.longitude is null
     from public.properties p join public.customers c on c.id = p.customer_id
    where c.phone = '610-555-0201'),
  'the first property is saved with its state in capitals and no map position yet');

select public.add_customer('person', 'Chris', 'Yuen', null, '610-555-0202', null,
  (select id from public.offices where name = 'Reading'));
select tests.check(
  exists (select 1 from public.customers where first_name = 'Chris' and last_name = 'Yuen' and email is null)
  and not exists (select 1 from public.properties p join public.customers c on c.id = p.customer_id where c.first_name = 'Chris'),
  'the New customer form without an address saves only the customer');

select tests.fails(
  $$select public.add_customer('person', 'Nope', 'Nobody', null, '801-555-0998', null,
      (select id from public.offices where name = 'American Fork'), '1 Nowhere Road', null, 'Lehi', 'UT', '84043', 'residential')$$,
  '42501', 'Sales cannot add a customer in another office through the New customer form');
select tests.check(
  tests.count_all($$select * from public.customers where phone = '801-555-0998'$$) = 0
  and tests.count_all($$select * from public.properties where address_line1 = '1 Nowhere Road'$$) = 0,
  'a refused New customer form saves nothing, not even the property');
select tests.check(
  tests.count_all('select * from public.customers') = 8 and tests.count_all('select * from public.properties') = 6,
  'eight customers and six properties so far');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000012');
select public.add_customer('person', 'Walter', 'Nguyen', null, '801-555-0200', null,
  (select id from public.offices where name = 'American Fork'),
  '300 Canyon View Drive', null, 'American Fork', 'UT', '84003', 'residential');
select tests.check(
  (select o.name from public.customers c join public.offices o on o.id = c.office_id where c.first_name = 'Walter') = 'American Fork',
  'a Sales rep in American Fork can add a customer there');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id)
    values ('Nope', '610-555-0998', (select id from public.offices where name = 'Reading'))$$,
  '42501', 'a Sales rep in American Fork cannot add a customer in Reading');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000011');
insert into public.customers (first_name, last_name, phone, office_id) values
  ('Hollis', 'Grant', '801-555-0300', (select id from public.offices where name = 'American Fork')),
  ('Imani', 'Okoro', '610-555-0300', (select id from public.offices where name = 'Reading'));
select tests.check(
  (select string_agg(o.name, ',' order by o.name) from public.customers c join public.offices o on o.id = c.office_id
    where c.created_by = '00000000-0000-0000-0000-000000000011') = 'American Fork,Reading',
  'an Accountant can add a customer in any office');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
insert into public.customers (first_name, last_name, phone, office_id)
  values ('Felix', 'Marsh', '610-555-0400', (select id from public.offices where name = 'Reading'));
select tests.check(
  exists (select 1 from public.customers where first_name = 'Felix' and created_by = '00000000-0000-0000-0000-00000000000e'),
  'a Project manager can add a customer in their office');
select tests.fails(
  $$insert into public.customers (first_name, phone, office_id)
    values ('Nope', '801-555-0997', (select id from public.offices where name = 'American Fork'))$$,
  '42501', 'a Project manager cannot add a customer in another office');
reset role;

-- ---------------------------------------------------------------------------
-- Seeing customers, by the role's scope. Twelve customers: nine in Reading
-- (Dana, Samuel, Oakridge, Nadia, Ridge Top, Taylor, Chris, Imani, Felix)
-- and three in American Fork (Luis, Walter, Hollis).
-- ---------------------------------------------------------------------------

select tests.check(tests.count_all('select * from public.customers') = 12, 'twelve customers in all');

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.check(tests.count_rows('select * from public.customers') = 4, 'Sales see only the customers they added');
select tests.check(
  tests.count_rows('select * from public.customers where created_by is null') = 0,
  'Sales do not see the seeded customers of their office');
select tests.check(
  tests.count_rows($$select * from public.customers where first_name = 'Imani'$$) = 0,
  'Sales do not see a customer in their office that someone else added');
select tests.check(
  tests.count_rows($$select * from public.customers where first_name = 'Walter'$$) = 0,
  'Sales do not see another rep''s customer');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000012');
select tests.check(
  tests.count_rows('select * from public.customers') = 1
  and tests.count_rows($$select * from public.customers where first_name = 'Walter'$$) = 1,
  'a Sales rep in another office sees only their own customer too');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(tests.count_rows('select * from public.customers') = 9, 'a Project manager sees every customer in their office');
select tests.check(
  tests.count_rows($$select * from public.customers where first_name = 'Dana'$$) = 1,
  'a Project manager sees the seeded customers of their office');
select tests.check(
  tests.count_rows($$select * from public.customers c join public.offices o on o.id = c.office_id where o.name = 'American Fork'$$) = 0,
  'a Project manager does not see customers in other offices');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000013');
select tests.check(tests.count_rows('select * from public.customers') = 3, 'the American Fork Project manager sees the three customers there');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.check(tests.count_rows('select * from public.customers') = 12, 'the Admin sees every customer');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000011');
select tests.check(tests.count_rows('select * from public.customers') = 12, 'an Accountant sees every customer');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');
select tests.check(tests.count_rows('select * from public.customers') = 0, 'a switched-off person sees no customers');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000f');
select tests.check(tests.count_rows('select * from public.customers') = 0, 'on a temporary password, a person sees no customers');
reset role;

-- Visibility goes by the role's scope, which is data, not by the role's name.
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.roles set scope = 'office' where key = 'sales';
reset role;
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.check(tests.count_rows('select * from public.customers') = 9,
  'visibility follows the role''s scope: Sales given office scope see their whole office');
reset role;
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.roles set scope = 'own' where key = 'sales';
reset role;

-- ---------------------------------------------------------------------------
-- Changing customers. Nothing is deleted.
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
update public.customers set notes = 'Prefers texts' where first_name = 'Nadia';
select tests.check(
  (select notes from public.customers where first_name = 'Nadia') = 'Prefers texts',
  'Sales can change their own customer');
update public.customers set phone = '610-555-0110' where first_name = 'Nadia';
select tests.check(
  (select phone_digits from public.customers where first_name = 'Nadia') = '6105550110',
  'the phone digits follow a changed phone number');
select tests.changes_nothing(
  $$update public.customers set notes = 'Not mine' where first_name = 'Dana'$$,
  'Sales cannot change a customer someone else added');
select tests.changes_nothing(
  $$update public.customers set notes = 'Not mine' where first_name = 'Walter'$$,
  'Sales cannot change another rep''s customer');
select tests.fails(
  $$update public.customers set office_id = (select id from public.offices where name = 'American Fork') where first_name = 'Nadia'$$,
  '42501', 'Sales cannot move their customer to an office they are not in');
select tests.fails(
  $$delete from public.customers where first_name = 'Nadia'$$,
  '42501', 'Sales cannot delete a customer');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
update public.customers set notes = 'Call after 5pm' where first_name = 'Dana';
select tests.check(
  (select notes from public.customers where first_name = 'Dana') = 'Call after 5pm',
  'a Project manager can change a customer in their office');
select tests.changes_nothing(
  $$update public.customers set notes = 'Not mine' where first_name = 'Luis'$$,
  'a Project manager cannot change a customer in another office');
select tests.fails(
  $$delete from public.customers where first_name = 'Dana'$$,
  '42501', 'a Project manager cannot delete a customer');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.fails(
  $$delete from public.customers$$,
  '42501', 'nobody can delete a customer, not even the Admin');
reset role;

select tests.check(
  (select notes is null from public.customers where first_name = 'Luis')
  and (select notes = 'Call after 5pm' from public.customers where first_name = 'Dana'),
  'the refused customer changes left the customers as they were');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'customers' and action = 'insert'
             and record_id = tests.customer_id('610-555-0110') and changed_by = '00000000-0000-0000-0000-00000000000b'),
  'adding a customer is in the audit trail, with who did it');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'customers' and action = 'update'
             and record_id = tests.customer_id('610-555-0110') and changed_by = '00000000-0000-0000-0000-00000000000b'
             and changes -> 'notes' ->> 'new' = 'Prefers texts' and not changes ? 'updated_at'),
  'changing a customer is in the audit trail, with who did it and what changed');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'customers' and action = 'update'
             and record_id = tests.customer_id('(610) 555-0101') and changed_by = '00000000-0000-0000-0000-00000000000e'
             and changes ? 'notes'),
  'a Project manager''s change to a customer is in the audit trail');
select tests.check(
  exists (select 1 from public.audit_log where table_name = 'customers' and action = 'insert'
             and record_id = tests.customer_id('610-555-0201') and changed_by = '00000000-0000-0000-0000-00000000000b'),
  'a customer added through the New customer form is in the audit trail');

-- ---------------------------------------------------------------------------
-- Properties follow their customer
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
insert into public.properties (customer_id, address_line1, city, state, zip)
  values ((select id from public.customers where first_name = 'Nadia'), '14 Harbor Way', 'Reading', 'PA', '19602');
select tests.check(
  (select created_by = '00000000-0000-0000-0000-00000000000b' from public.properties where address_line1 = '14 Harbor Way'),
  'Sales can add a property to their own customer');
select tests.check(tests.count_rows('select * from public.properties') = 2, 'Sales see the properties of their own customers only');
select tests.check(
  tests.count_rows($$select * from public.properties where address_line1 = '412 Birchwood Lane'$$) = 0,
  'Sales do not see the property of a customer they cannot see');
select tests.fails(
  $$insert into public.properties (customer_id, address_line1) values (tests.customer_id('(610) 555-0101'), '1 Nowhere Road')$$,
  '42501', 'Sales cannot add a property to a customer they cannot see');
select tests.fails(
  $$insert into public.properties (customer_id, address_line1, state)
    values ((select id from public.customers where first_name = 'Nadia'), '2 Nowhere Road', 'pa')$$,
  '23514', 'a property''s state is two capital letters');
select tests.fails(
  $$insert into public.properties (customer_id, address_line1, state)
    values ((select id from public.customers where first_name = 'Nadia'), '2 Nowhere Road', 'Penn')$$,
  '23514', 'a property''s state cannot be spelled out');
select tests.fails(
  $$insert into public.properties (customer_id, address_line1)
    values ((select id from public.customers where first_name = 'Nadia'), '   ')$$,
  '23514', 'a property needs an address');
select tests.fails(
  $$insert into public.properties (customer_id)
    values ((select id from public.customers where first_name = 'Nadia'))$$,
  '23502', 'a property with no address at all is refused');
update public.properties set notes = 'Detached garage' where address_line1 = '14 Harbor Way';
select tests.check(
  (select notes from public.properties where address_line1 = '14 Harbor Way') = 'Detached garage',
  'Sales can change a property of their own customer');
select tests.changes_nothing(
  $$update public.properties set notes = 'Not mine' where address_line1 = '412 Birchwood Lane'$$,
  'Sales cannot change the property of a customer they cannot see');
select tests.fails(
  $$delete from public.properties where address_line1 = '14 Harbor Way'$$,
  '42501', 'Sales cannot delete a property');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000012');
select tests.check(
  tests.count_rows('select * from public.properties') = 1
  and tests.count_rows($$select * from public.properties where address_line1 = '300 Canyon View Drive'$$) = 1,
  'a Sales rep in American Fork sees only their own customer''s property');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(tests.count_rows('select * from public.properties') = 6,
  'a Project manager sees the properties of every customer in their office');
select tests.check(
  tests.count_rows($$select * from public.properties where address_line1 = '27 Alpine Loop'$$) = 0,
  'a Project manager does not see properties in other offices');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.check(
  tests.count_rows('select * from public.properties') = tests.count_all('select * from public.properties')
  and tests.count_all('select * from public.properties') = 8,
  'the Admin sees every property');
select tests.fails(
  $$delete from public.properties$$,
  '42501', 'nobody can delete a property, not even the Admin');
reset role;

-- ---------------------------------------------------------------------------
-- Organizations and contacts: everyone on staff sees them and can add and
-- edit them. An organization's place in the chain is for Project managers
-- and Admins.
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.check(tests.count_rows('select * from public.organizations') = 7, 'Sales see every organization, including the seeded partners');
select tests.check(tests.count_rows('select * from public.contacts') = 6, 'Sales see every contact');
select tests.check(
  tests.count_rows($$select * from public.organizations f join public.organizations g on g.id = f.parent_organization_id
                      where g.name = 'Keystone Restoration Holdings'$$) = 2,
  'Sales see which franchises belong to an ownership group');

insert into public.organizations (name, org_type, phone, city, state)
  values ('Ridgeline Supply Co', 'supplier', '610-555-0500', 'Reading', 'PA');
select tests.check(
  (select created_by = '00000000-0000-0000-0000-00000000000b' and not is_referral_partner
     from public.organizations where name = 'Ridgeline Supply Co'),
  'Sales can add an organization');
insert into public.contacts (organization_id, first_name, last_name, contact_role, mobile)
  values ((select id from public.organizations where name = 'Ridgeline Supply Co'), 'Noor', 'Haddad', 'office_manager', '610-555-0501');
select tests.check(
  (select created_by = '00000000-0000-0000-0000-00000000000b' from public.contacts where last_name = 'Haddad'),
  'anyone can add a contact');
update public.organizations set phone = '610-555-0153' where name = 'SERVPRO of Birch Hollow';
select tests.check(
  (select phone from public.organizations where name = 'SERVPRO of Birch Hollow') = '610-555-0153',
  'Sales can change an organization''s phone');
update public.contacts set title = 'Lead dispatcher', mobile = '610-555-0196' where email = 'marcus@example.com';
select tests.check(
  (select title = 'Lead dispatcher' and mobile = '610-555-0196' from public.contacts where email = 'marcus@example.com'),
  'Sales can change a contact''s details');
select tests.fails(
  $$update public.organizations set org_type = 'vendor' where name = 'Ridgeline Supply Co'$$,
  '42501', 'Sales cannot change an organization''s type');
select tests.fails(
  $$update public.organizations
       set parent_organization_id = (select id from public.organizations where name = 'Keystone Restoration Holdings')
     where name = 'Ridgeline Supply Co'$$,
  '42501', 'Sales cannot change an organization''s parent');
select tests.fails(
  $$update public.organizations set parent_organization_id = null where name = 'SERVPRO of Birch Hollow'$$,
  '42501', 'Sales cannot take a franchise out of its ownership group');
select tests.fails(
  $$delete from public.organizations where name = 'Ridgeline Supply Co'$$,
  '42501', 'Sales cannot delete an organization');
select tests.fails(
  $$delete from public.contacts where last_name = 'Haddad'$$,
  '42501', 'Sales cannot delete a contact');
select tests.fails(
  $$insert into public.contacts (title, contact_role) values ('Nobody', 'other')$$,
  '23514', 'a contact needs a first or last name');
select tests.fails(
  $$insert into public.contacts (first_name, last_name, title) values ('  ', '', 'Nobody')$$,
  '23514', 'a blank contact name does not count');
select tests.fails(
  $$insert into public.organizations (name, org_type) values ('', 'vendor')$$,
  '23514', 'an organization needs a name');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
insert into public.organizations (name, org_type, is_referral_partner) values
  ('Alder Restoration Group', 'servpro_group', true),
  ('SERVPRO of Alder Creek', 'servpro_franchise', true),
  ('SERVPRO of Alder Creek East', 'servpro_franchise', true);
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
update public.organizations set org_type = 'vendor' where name = 'Ridgeline Supply Co';
select tests.check(
  (select org_type from public.organizations where name = 'Ridgeline Supply Co') = 'vendor',
  'a Project manager can change an organization''s type');
update public.organizations
   set parent_organization_id = (select id from public.organizations where name = 'Alder Restoration Group')
 where name = 'SERVPRO of Alder Creek';
select tests.check(
  (select g.name from public.organizations f join public.organizations g on g.id = f.parent_organization_id
    where f.name = 'SERVPRO of Alder Creek') = 'Alder Restoration Group',
  'a Project manager can put a franchise under its ownership group');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.organizations set org_type = 'supplier' where name = 'Ridgeline Supply Co';
select tests.check(
  (select org_type from public.organizations where name = 'Ridgeline Supply Co') = 'supplier',
  'an Admin can change an organization''s type');
update public.organizations
   set parent_organization_id = (select id from public.organizations where name = 'SERVPRO of Alder Creek')
 where name = 'SERVPRO of Alder Creek East';
select tests.check(
  (select g.name from public.organizations f join public.organizations g on g.id = f.parent_organization_id
    where f.name = 'SERVPRO of Alder Creek East') = 'SERVPRO of Alder Creek',
  'an Admin can change an organization''s parent');
select tests.fails(
  $$update public.organizations set parent_organization_id = id where name = 'Alder Restoration Group'$$,
  '23514', 'an organization cannot be its own parent');
select tests.fails(
  $$update public.organizations
       set parent_organization_id = (select id from public.organizations where name = 'SERVPRO of Alder Creek')
     where name = 'Alder Restoration Group'$$,
  '23514', 'an ownership group cannot be put under its own franchise');
select tests.fails(
  $$update public.organizations
       set parent_organization_id = (select id from public.organizations where name = 'SERVPRO of Alder Creek East')
     where name = 'Alder Restoration Group'$$,
  '23514', 'a loop through three organizations is refused too');
select tests.fails(
  $$insert into public.organizations (id, name, org_type, parent_organization_id)
    values ('11111111-1111-1111-1111-111111111111', 'Loop Co', 'other', '11111111-1111-1111-1111-111111111111')$$,
  '23514', 'a new organization cannot be its own parent either');
select tests.check(
  (select parent_organization_id is null from public.organizations where name = 'Alder Restoration Group'),
  'the refused loops left the ownership group at the top of its chain');
select tests.fails(
  $$delete from public.organizations$$,
  '42501', 'nobody can delete an organization, not even the Admin');
select tests.fails(
  $$delete from public.contacts$$,
  '42501', 'nobody can delete a contact, not even the Admin');
reset role;

set role anon;
select tests.sign_in(null);
select tests.fails('select * from public.organizations', '42501', 'signed-out visitors cannot read organizations');
select tests.fails('select * from public.contacts', '42501', 'signed-out visitors cannot read contacts');
select tests.fails('select * from public.customers', '42501', 'signed-out visitors cannot read customers');
select tests.fails('select * from public.properties', '42501', 'signed-out visitors cannot read properties');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');
select tests.check(tests.count_rows('select * from public.organizations') = 0, 'a switched-off person sees no organizations');
select tests.check(tests.count_rows('select * from public.contacts') = 0, 'a switched-off person sees no contacts');
select tests.fails(
  $$insert into public.contacts (first_name, last_name) values ('Lee', 'Sneaks')$$,
  '42501', 'a switched-off person cannot add a contact');
reset role;

select tests.check(
  tests.count_all('select * from public.organizations') = 11 and tests.count_all('select * from public.contacts') = 7,
  'eleven organizations and seven contacts in all');

-- ---------------------------------------------------------------------------
-- The duplicate warning on the New customer form: by phone digits only
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(
  (select display_name = 'Dana Whitfield' and office_name = 'Reading' and can_open
     from public.customers_with_phone('(610) 555-0101')),
  'the duplicate warning names the matching customer and their office');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('610.555.0101')$$) = 1,
  'the duplicate warning ignores punctuation in the phone number');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('1-610-555-0101')$$) = 1,
  'the duplicate warning ignores a leading 1');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('6105550101')$$) = 1,
  'the duplicate warning works on bare digits');
select tests.check(
  (select display_name from public.customers_with_phone('610-555-0103')) = 'Oakridge Property Group LLC',
  'a company customer is named by its company name in the warning');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('555-01')$$) = 0,
  'fewer than seven digits gives no duplicate warning');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('610-555-0777')$$) = 0,
  'a phone number nobody has gives no duplicate warning');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.check(
  (select display_name = 'Dana Whitfield' and office_name = 'Reading' and not can_open
     from public.customers_with_phone('(610) 555-0101')),
  'Sales are warned about a customer someone else added, but cannot open them');
select tests.check(
  (select display_name = 'Nadia Ferreira' and can_open from public.customers_with_phone('610-555-0110')),
  'Sales can open their own customer from the warning');
reset role;

set role anon;
select tests.sign_in(null);
select tests.fails(
  $$select * from public.customers_with_phone('(610) 555-0101')$$,
  '42501', 'signed-out visitors get no duplicate warning');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('(610) 555-0101')$$) = 0,
  'a switched-off person gets no duplicate warning');
reset role;

-- Archiving hides a customer from the warning and from search.
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.customers set archived_at = now() where first_name = 'Samuel';
reset role;
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('610-555-0102')$$) = 0,
  'an archived customer gives no duplicate warning');
select tests.check(
  tests.count_rows($$select * from public.search_records('Okafor')$$) = 0,
  'an archived customer is not found by search');
reset role;
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
update public.customers set archived_at = null where first_name = 'Samuel';
reset role;
set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(
  tests.count_rows($$select * from public.customers_with_phone('610-555-0102')$$) = 1,
  'bringing a customer back from the archive brings back the warning');
reset role;

-- ---------------------------------------------------------------------------
-- The one search box
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000b');
select tests.check(
  (select string_agg(title, ',') from public.search_records('Taylor') where kind = 'customer') = 'Taylor Brooks',
  'Sales find their own customer by name');
select tests.check(
  (select string_agg(title, ',') from public.search_records('(610) 555-0201') where kind = 'customer') = 'Taylor Brooks',
  'Sales find their own customer by phone, whatever the formatting');
select tests.check(
  (select string_agg(title, ',') from public.search_records('6105550201') where kind = 'customer') = 'Taylor Brooks',
  'Sales find their own customer by phone digits');
select tests.check(
  (select string_agg(title, ',') from public.search_records('taylor.brooks') where kind = 'customer') = 'Taylor Brooks',
  'Sales find their own customer by part of their email');
select tests.check(
  (select string_agg(title, ',') from public.search_records('Elm Street') where kind = 'customer') = 'Taylor Brooks',
  'Sales find their own customer by property address');
select tests.check(
  (select detail from public.search_records('Taylor') where kind = 'customer') = '610-555-0201 · 9 Elm Street, Reading',
  'a customer match shows the phone and first property');
select tests.check(
  tests.count_rows($$select * from public.search_records('Whitfield') where kind = 'customer'$$) = 0,
  'Sales do not find a customer someone else added');
select tests.check(
  tests.count_rows($$select * from public.search_records('Birchwood') where kind = 'customer'$$) = 0,
  'Sales do not find another customer''s property address');
select tests.check(
  tests.count_rows($$select * from public.search_records('dana.whitfield')$$) = 0,
  'Sales do not find another customer by email');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(
  exists (select 1 from public.search_records('Whitfield') where kind = 'customer' and title = 'Dana Whitfield'),
  'a Project manager finds a customer of their office by name');
select tests.check(
  exists (select 1 from public.search_records('Birchwood') where kind = 'customer' and title = 'Dana Whitfield'),
  'a Project manager finds a customer of their office by property address');
select tests.check(
  exists (select 1 from public.search_records('(610) 555-0101') where kind = 'customer' and title = 'Dana Whitfield'),
  'a phone search ignores formatting');
select tests.check(
  exists (select 1 from public.search_records('1-610-555-0101') where kind = 'customer' and title = 'Dana Whitfield'),
  'a phone search ignores a leading 1');
select tests.check(
  exists (select 1 from public.search_records('dana.whitfield') where kind = 'customer' and title = 'Dana Whitfield'),
  'part of an email finds the customer');
select tests.check(
  exists (select 1 from public.search_records('Oakridge') where kind = 'customer' and title = 'Oakridge Property Group LLC'),
  'a company customer is found by its company name');
select tests.check(
  tests.count_rows($$select * from public.search_records('Herrera') where kind = 'customer'$$) = 0,
  'a Project manager does not find customers of other offices');
select tests.check(
  tests.count_rows($$select * from public.search_records('Alpine Loop')$$) = 0,
  'a Project manager does not find property addresses in other offices');
select tests.check(
  exists (select 1 from public.search_records('Birch Hollow')
           where kind = 'organization' and title = 'SERVPRO of Birch Hollow' and detail = 'servpro_franchise'),
  'organizations are found by name, with their type');
select tests.check(
  exists (select 1 from public.search_records('Keystone')
           where kind = 'organization' and title = 'Keystone Restoration Holdings' and detail = 'servpro_group'),
  'an ownership group is found by name');
select tests.check(
  exists (select 1 from public.search_records('Nandakumar')
           where kind = 'contact' and title = 'Priya Nandakumar' and detail = 'SERVPRO of Birch Hollow'),
  'contacts are found by name, with their organization');
select tests.check(
  exists (select 1 from public.search_records('Delgado') where kind = 'contact' and title = 'Rosa Delgado' and detail is null),
  'a contact without an organization is found, with no organization shown');
select tests.check(
  (select string_agg(kind, ',' order by kind) from public.search_records('SERVPRO')) = 'organization,organization,organization,organization,organization',
  'a search for SERVPRO finds the five franchises and nothing else');
select tests.check(tests.count_rows($$select * from public.search_records('%')$$) = 0,
  'a search for just a percent sign finds nothing, rather than everything');
select tests.check(tests.count_rows($$select * from public.search_records('_')$$) = 0,
  'a search for just an underscore finds nothing, rather than everything');
select tests.check(tests.count_rows($$select * from public.search_records('')$$) = 0, 'an empty search finds nothing');
select tests.check(tests.count_rows($$select * from public.search_records('   ')$$) = 0, 'a blank search finds nothing');
select tests.check(tests.count_rows($$select * from public.search_records(null)$$) = 0, 'a missing search finds nothing');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000d');
select tests.check(tests.count_rows($$select * from public.search_records('SERVPRO')$$) = 0, 'a switched-off person finds nothing by search');
reset role;

set role anon;
select tests.sign_in(null);
select tests.fails($$select * from public.search_records('SERVPRO')$$, '42501', 'signed-out visitors cannot search');
reset role;

-- ---------------------------------------------------------------------------
-- Audit trail by office: Project managers see the entries about their own
-- offices. Company-wide entries, and everything else, are for Admins.
-- ---------------------------------------------------------------------------

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000e');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name in ('roles', 'role_permissions')$$) = 0,
  'a Project manager does not see audit entries about roles and permissions');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-00000000000c'$$) > 0,
  'a Project manager sees audit entries about people in their office');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-000000000012'$$) = 0,
  'a Project manager does not see audit entries about people who are only in another office');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profile_offices'
                       and changes -> 'office_id' ->> 'new' = (select id::text from public.offices where name = 'Reading')$$) > 0,
  'a Project manager sees who was added to their office');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profile_offices'
                       and coalesce(changes -> 'office_id' ->> 'new', changes -> 'office_id' ->> 'old')
                           = (select id::text from public.offices where name = 'American Fork')$$) = 0,
  'a Project manager does not see office membership changes for other offices');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'customers' and record_id = tests.customer_id('610-555-0201')$$) > 0,
  'a Project manager sees audit entries about customers in their office');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'customers' and record_id = tests.customer_id('801-555-0200')$$) = 0,
  'a Project manager does not see audit entries about customers in other offices');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name not in ('profiles', 'profile_offices', 'customers')$$) = 0,
  'a Project manager sees audit entries about people, office membership and customers only');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000013');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'customers' and record_id = tests.customer_id('801-555-0200')$$) > 0
  and tests.count_rows($$select * from public.audit_log where table_name = 'customers' and record_id = tests.customer_id('610-555-0201')$$) = 0,
  'the American Fork Project manager sees the audit entries about their own customers instead');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-000000000011');
select tests.check(tests.count_rows('select * from public.audit_log') = 0, 'an Accountant cannot read the audit trail');
reset role;

set role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000c');
select tests.check(
  tests.count_rows('select * from public.audit_log') = tests.count_all('select * from public.audit_log'),
  'the Admin sees every audit entry');
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name in ('roles', 'role_permissions')$$) > 0
  and tests.count_rows($$select * from public.audit_log where table_name = 'customers' and record_id = tests.customer_id('801-555-0200')$$) > 0,
  'the Admin sees the company-wide entries and every office''s customers');
-- The American Fork entries hidden from the Reading Project manager do exist.
select tests.check(
  tests.count_rows($$select * from public.audit_log where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-000000000012'$$) > 0
  and tests.count_rows($$select * from public.audit_log where table_name = 'profile_offices'
                           and coalesce(changes -> 'office_id' ->> 'new', changes -> 'office_id' ->> 'old')
                               = (select id::text from public.offices where name = 'American Fork')$$) > 0,
  'the Admin sees the entries about American Fork people and membership that Reading could not');
reset role;
