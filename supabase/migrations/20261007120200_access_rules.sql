-- Phase 1, step 2: who can see and change the company structure
-- (spec section 8). Visibility is enforced here, in the database, so it holds
-- on every screen, export and integration.
--
-- What a role may do comes from its rows in role_permissions, which an Admin
-- can edit. The rules below check permissions, never role names. Permission
-- keys used in this step:
--   manage_users        change people's roles, offices, names and active status
--   manage_permissions  change roles and what each role may do
--   manage_settings     change states, offices and teams
--   view_audit_log      read the audit trail
--
-- Scope (company, state, office, own) limits which jobs, customers and money a
-- person sees. Nothing in this step is limited by scope: the company
-- structure is the same for everyone. Scope rules arrive with jobs in step 4.

-- ---------------------------------------------------------------------------
-- Helpers. They run as the table owner so the rules below can read profiles
-- and permissions without tripping over their own row level security.
-- ---------------------------------------------------------------------------

-- True when the signed-in person has a profile and is switched on.
create function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active
  );
$$;

-- True when the signed-in person is switched on and their role has the permission.
create function public.has_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
     where p.id = auth.uid()
       and p.is_active
       and rp.permission_key = permission
  );
$$;

revoke execute on function public.is_active_staff() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- States, offices and teams: everyone on staff reads them. Changing them is a
-- setting. Nothing is deleted; switch a row off with is_active instead.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.states, public.offices, public.teams to authenticated;

create policy "Staff can read states" on public.states
  for select to authenticated using ((select public.is_active_staff()));
create policy "Settings managers can add states" on public.states
  for insert to authenticated with check ((select public.has_permission('manage_settings')));
create policy "Settings managers can change states" on public.states
  for update to authenticated
  using ((select public.has_permission('manage_settings')))
  with check ((select public.has_permission('manage_settings')));

create policy "Staff can read offices" on public.offices
  for select to authenticated using ((select public.is_active_staff()));
create policy "Settings managers can add offices" on public.offices
  for insert to authenticated with check ((select public.has_permission('manage_settings')));
create policy "Settings managers can change offices" on public.offices
  for update to authenticated
  using ((select public.has_permission('manage_settings')))
  with check ((select public.has_permission('manage_settings')));

create policy "Staff can read teams" on public.teams
  for select to authenticated using ((select public.is_active_staff()));
create policy "Settings managers can add teams" on public.teams
  for insert to authenticated with check ((select public.has_permission('manage_settings')));
create policy "Settings managers can change teams" on public.teams
  for update to authenticated
  using ((select public.has_permission('manage_settings')))
  with check ((select public.has_permission('manage_settings')));

-- Team members are a list, so a person can be taken off a team.
grant select, insert, update, delete on public.team_members to authenticated;

create policy "Staff can read team members" on public.team_members
  for select to authenticated using ((select public.is_active_staff()));
create policy "Settings managers can add team members" on public.team_members
  for insert to authenticated with check ((select public.has_permission('manage_settings')));
create policy "Settings managers can change team members" on public.team_members
  for update to authenticated
  using ((select public.has_permission('manage_settings')))
  with check ((select public.has_permission('manage_settings')));
create policy "Settings managers can remove team members" on public.team_members
  for delete to authenticated using ((select public.has_permission('manage_settings')));

-- ---------------------------------------------------------------------------
-- Roles and permissions: everyone on staff reads them (the app needs to know
-- what the signed-in person may do). Only permission managers change them.
-- A role is never deleted; a permission row can be taken away.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.roles to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;

create policy "Staff can read roles" on public.roles
  for select to authenticated using ((select public.is_active_staff()));
create policy "Permission managers can add roles" on public.roles
  for insert to authenticated with check ((select public.has_permission('manage_permissions')));
create policy "Permission managers can change roles" on public.roles
  for update to authenticated
  using ((select public.has_permission('manage_permissions')))
  with check ((select public.has_permission('manage_permissions')));

create policy "Staff can read role permissions" on public.role_permissions
  for select to authenticated using ((select public.is_active_staff()));
create policy "Permission managers can add role permissions" on public.role_permissions
  for insert to authenticated with check ((select public.has_permission('manage_permissions')));
create policy "Permission managers can change role permissions" on public.role_permissions
  for update to authenticated
  using ((select public.has_permission('manage_permissions')))
  with check ((select public.has_permission('manage_permissions')));
create policy "Permission managers can remove role permissions" on public.role_permissions
  for delete to authenticated using ((select public.has_permission('manage_permissions')));

-- ---------------------------------------------------------------------------
-- Profiles. Everyone on staff can read the staff list, so jobs and tasks can
-- show who is on them. A person who has been switched off can still read
-- their own profile, so the app can tell them why they see nothing.
-- Profiles are created by the database when a sign-in account is made, never
-- by the app, and are never deleted. Email follows the sign-in account and
-- cannot be changed here.
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, role_id, primary_office_id, is_active) on public.profiles to authenticated;

create policy "Staff can read profiles, and everyone their own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_staff()));
create policy "People managers can change profiles" on public.profiles
  for update to authenticated
  using ((select public.has_permission('manage_users')))
  with check ((select public.has_permission('manage_users')));

grant select, insert, delete on public.profile_offices to authenticated;

create policy "Staff can read office membership, and everyone their own" on public.profile_offices
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_active_staff()));
create policy "People managers can add office membership" on public.profile_offices
  for insert to authenticated with check ((select public.has_permission('manage_users')));
create policy "People managers can remove office membership" on public.profile_offices
  for delete to authenticated using ((select public.has_permission('manage_users')));

-- ---------------------------------------------------------------------------
-- Audit trail: read only, and only with permission.
-- ---------------------------------------------------------------------------

grant select on public.audit_log to authenticated;

create policy "Audit readers can read the audit trail" on public.audit_log
  for select to authenticated using ((select public.has_permission('view_audit_log')));

-- ---------------------------------------------------------------------------
-- Never lock everyone out. There must always be at least one switched-on
-- person who can manage people, and one who can manage permissions.
-- ---------------------------------------------------------------------------

create function public.keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  needed text;
begin
  -- Before anyone has signed up there is nobody to keep.
  if not exists (select 1 from public.profiles) then
    return null;
  end if;

  foreach needed in array array['manage_users', 'manage_permissions'] loop
    if not exists (
      select 1
        from public.profiles p
        join public.role_permissions rp on rp.role_id = p.role_id
       where p.is_active and rp.permission_key = needed
    ) then
      raise exception 'At least one active person must keep the % permission.', needed
        using errcode = 'check_violation',
              hint = 'Give someone else that permission first.';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.keep_an_admin() from public, anon, authenticated;

create trigger keep_an_admin after update on public.profiles
  for each statement execute function public.keep_an_admin();
create trigger keep_an_admin after update or delete on public.role_permissions
  for each statement execute function public.keep_an_admin();

-- ---------------------------------------------------------------------------
-- Changing a person in one go, for the People screen: name, role, offices,
-- main office and whether they are switched on. Runs as the person calling
-- it, so the rules above still apply. Either everything saves or nothing does.
-- ---------------------------------------------------------------------------

create function public.update_person(
  person_id uuid,
  first_name text,
  last_name text,
  role_id uuid,
  office_ids uuid[],
  primary_office_id uuid,
  is_active boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  offices uuid[] := coalesce(office_ids, '{}');
begin
  if not public.has_permission('manage_users') then
    raise exception 'Only people managers can change people.' using errcode = 'insufficient_privilege';
  end if;

  if primary_office_id is not null and not (primary_office_id = any (offices)) then
    raise exception 'The main office must be one of the person''s offices.' using errcode = 'check_violation';
  end if;

  update public.profiles p
     set first_name = nullif(btrim(update_person.first_name), ''),
         last_name = nullif(btrim(update_person.last_name), ''),
         role_id = update_person.role_id,
         primary_office_id = update_person.primary_office_id,
         is_active = update_person.is_active
   where p.id = person_id;

  if not found then
    raise exception 'That person was not found.' using errcode = 'no_data_found';
  end if;

  delete from public.profile_offices po
   where po.profile_id = person_id
     and not (po.office_id = any (offices));

  insert into public.profile_offices (profile_id, office_id)
  select person_id, office_id
    from unnest(offices) as office_id
  on conflict (profile_id, office_id) do nothing;
end;
$$;

revoke execute on function public.update_person(uuid, text, text, uuid, uuid[], uuid, boolean) from public, anon;
grant execute on function public.update_person(uuid, text, text, uuid, uuid[], uuid, boolean) to authenticated;
