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
select tests.check(tests.count_rows('select * from public.profiles') = 4, 'Sales can read the staff list');
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
  (select id from public.roles where key = 'project_manager'), '{}', null, true);
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
