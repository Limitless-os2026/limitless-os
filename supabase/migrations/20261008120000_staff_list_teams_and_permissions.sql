-- Cleanup between Phase 1 steps 2 and 3: the owner's answers to the
-- questions in pull request #2 (spec section 8, "Decisions from step 2").
--
--   Staff list   Every signed-in person sees the name, role, offices, phone
--                and email of active colleagues. Only people managers
--                (Admins) see people who have been switched off.
--   Teams        Admins manage every team. Project managers manage the
--                teams in their own offices, with the new manage_teams
--                permission.
--   Permissions  The starting set changes as the owner set it out.
--   Auditing     Changes to roles and role permissions go in audit_log.

-- ---------------------------------------------------------------------------
-- Audit roles and role permissions. Attached first, so the permission
-- changes below are on record too.
-- ---------------------------------------------------------------------------

create trigger audit_row_change after insert or update or delete on public.roles
  for each row execute function public.audit_row_change();

create trigger audit_row_change after insert or update or delete on public.role_permissions
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Starting permissions
--   Admin            everything
--   Project manager  everything except managing people, roles and permissions
--   Accountant       view_margins, view_commissions, view_partner_reports
--   Sales            none of the special permissions
--
-- manage_settings (adding and changing states and offices) is company-wide,
-- so it stays with Admins for now. That is listed as a question in the pull
-- request. Project managers get manage_teams, which reaches only the teams
-- in their own offices.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_key)
select r.id, p.permission_key
  from (values
    ('admin', 'manage_teams'),
    ('project_manager', 'manage_teams'),
    ('project_manager', 'view_audit_log')
  ) as p (role_key, permission_key)
  join public.roles r on r.key = p.role_key
on conflict (role_id, permission_key) do nothing;

-- Sales had view_commissions. Their own commission will come from their
-- "own" scope in Phase 3, not from this permission.
delete from public.role_permissions rp
 using public.roles r
 where r.id = rp.role_id
   and r.key = 'sales';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the signed-in person belongs to the office.
create function public.in_my_offices(office uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile_offices
     where profile_id = auth.uid() and office_id = office
  );
$$;

-- True when the signed-in person may change the team: settings managers for
-- every team, team managers for the teams in their own offices.
create function public.can_manage_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('manage_settings')
      or (
        public.has_permission('manage_teams')
        and exists (
          select 1 from public.teams t
           where t.id = team and public.in_my_offices(t.office_id)
        )
      );
$$;

revoke execute on function public.in_my_offices(uuid) from public, anon;
revoke execute on function public.can_manage_team(uuid) from public, anon;
grant execute on function public.in_my_offices(uuid) to authenticated;
grant execute on function public.can_manage_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

drop policy "Settings managers can add teams" on public.teams;
drop policy "Settings managers can change teams" on public.teams;

create policy "Team managers can add teams in their offices" on public.teams
  for insert to authenticated
  with check (
    (select public.has_permission('manage_settings'))
    or ((select public.has_permission('manage_teams')) and public.in_my_offices(office_id))
  );
-- The check runs on the row as it will be after the change, so a Project
-- manager cannot move a team into an office that is not theirs.
create policy "Team managers can change teams in their offices" on public.teams
  for update to authenticated
  using (
    (select public.has_permission('manage_settings'))
    or ((select public.has_permission('manage_teams')) and public.in_my_offices(office_id))
  )
  with check (
    (select public.has_permission('manage_settings'))
    or ((select public.has_permission('manage_teams')) and public.in_my_offices(office_id))
  );

drop policy "Settings managers can add team members" on public.team_members;
drop policy "Settings managers can change team members" on public.team_members;
drop policy "Settings managers can remove team members" on public.team_members;

create policy "Team managers can add team members" on public.team_members
  for insert to authenticated with check (public.can_manage_team(team_id));
create policy "Team managers can change team members" on public.team_members
  for update to authenticated
  using (public.can_manage_team(team_id))
  with check (public.can_manage_team(team_id));
create policy "Team managers can remove team members" on public.team_members
  for delete to authenticated using (public.can_manage_team(team_id));

-- ---------------------------------------------------------------------------
-- The staff list: active colleagues for everyone, everyone for people
-- managers, and always your own profile.
-- ---------------------------------------------------------------------------

drop policy "Staff can read profiles, and everyone their own" on public.profiles;

create policy "Staff can read active colleagues, and everyone their own" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (is_active and (select public.is_active_staff()))
    or (select public.has_permission('manage_users'))
  );

drop policy "Staff can read office membership, and everyone their own" on public.profile_offices;

-- Profiles are read through their own rule above, so a switched-off person's
-- offices are hidden along with the person.
create policy "Staff can read colleagues' offices, and everyone their own" on public.profile_offices
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.has_permission('manage_users'))
    or (
      (select public.is_active_staff())
      and exists (select 1 from public.profiles p where p.id = profile_id and p.is_active)
    )
  );
