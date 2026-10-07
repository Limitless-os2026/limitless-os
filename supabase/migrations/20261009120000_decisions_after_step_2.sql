-- Cleanup before Phase 1 step 3: the owner's answers to the questions in
-- pull request #3 (spec section 8, "Decisions from the step 2 cleanup").
--
--   Office details   Project managers can edit their own offices' phone and
--                    address (new permission edit_office_details). Adding,
--                    removing and renaming states and offices stays with
--                    manage_settings (Admins).
--   Audit by office  Project managers see audit entries for their own
--                    offices only. Company-scope roles see everything.
--   Offices required Every active person belongs to at least one office,
--                    when added and when edited.
--   Sign out         A password reset, or switching someone off, ends their
--                    sign-in sessions on every device.
--
-- Also here: the manage_partner_structure permission that step 3 uses for
-- changing an organization's type or parent, so the permission changes of
-- this cleanup are in one place.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_key)
select r.id, p.permission_key
  from (values
    ('admin', 'edit_office_details'),
    ('admin', 'manage_partner_structure'),
    ('project_manager', 'edit_office_details'),
    ('project_manager', 'manage_partner_structure')
  ) as p (role_key, permission_key)
  join public.roles r on r.key = p.role_key
on conflict (role_id, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Scope helpers. A role's scope (company, state, office, own) says how far a
-- person sees. These run as the table owner so the rules can read profiles.
-- ---------------------------------------------------------------------------

-- The signed-in person's scope, or null when they are not active staff.
create function public.my_scope()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.scope
    from public.profiles p
    join public.roles r on r.id = p.role_id
   where p.id = auth.uid()
     and p.is_active
     and not p.must_change_password;
$$;

-- True when the office is within the signed-in person's scope: every office
-- for company scope, the offices in their states for state scope, and their
-- own offices otherwise.
create function public.office_in_my_scope(office uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_scope()
    when 'company' then true
    when 'state' then exists (
      select 1
        from public.profile_offices po
        join public.offices mine on mine.id = po.office_id
        join public.offices theirs on theirs.state_id = mine.state_id
       where po.profile_id = auth.uid()
         and theirs.id = office
    )
    when 'office' then public.in_my_offices(office)
    when 'own' then public.in_my_offices(office)
    else false
  end;
$$;

revoke execute on function public.my_scope() from public, anon;
revoke execute on function public.office_in_my_scope(uuid) from public, anon;
grant execute on function public.my_scope() to authenticated;
grant execute on function public.office_in_my_scope(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Offices: Project managers edit the phone and address of their own offices.
-- Everything else about an office stays a company setting.
-- ---------------------------------------------------------------------------

drop policy "Settings managers can change offices" on public.offices;

create policy "Settings managers and office editors can change offices" on public.offices
  for update to authenticated
  using (
    (select public.has_permission('manage_settings'))
    or ((select public.has_permission('edit_office_details')) and public.in_my_offices(id))
  )
  with check (
    (select public.has_permission('manage_settings'))
    or ((select public.has_permission('edit_office_details')) and public.in_my_offices(id))
  );

-- Without manage_settings, only phone, address_line1, city and zip may change.
-- The database itself (migrations, server functions) is not limited.
create function public.guard_office_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_permission('manage_settings') then
    return new;
  end if;

  if new.state_id is distinct from old.state_id
     or new.name is distinct from old.name
     or new.time_zone is distinct from old.time_zone
     or new.is_active is distinct from old.is_active then
    raise exception 'Only an Admin can change an office''s name, state, time zone or whether it is open.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_office_details() from public, anon, authenticated;

create trigger guard_office_details before update on public.offices
  for each row execute function public.guard_office_details();

-- ---------------------------------------------------------------------------
-- Audit trail by office. Company-scope roles with view_audit_log see every
-- entry. Others see the entries about their own offices: people in those
-- offices, membership of those offices, and (from step 3) customers there.
-- Later steps add their tables to this function with create or replace.
-- ---------------------------------------------------------------------------

create function public.audit_entry_in_my_scope(table_name text, record_id uuid, changes jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  office uuid;
begin
  if table_name = 'profiles' then
    return exists (
      select 1 from public.profile_offices po
       where po.profile_id = record_id and public.office_in_my_scope(po.office_id)
    );
  elsif table_name = 'profile_offices' then
    office := coalesce(changes -> 'office_id' ->> 'new', changes -> 'office_id' ->> 'old')::uuid;
    if office is null then
      select po.office_id into office from public.profile_offices po where po.id = record_id;
    end if;
    return office is not null and public.office_in_my_scope(office);
  end if;
  return false;
end;
$$;

revoke execute on function public.audit_entry_in_my_scope(text, uuid, jsonb) from public, anon;
grant execute on function public.audit_entry_in_my_scope(text, uuid, jsonb) to authenticated;

drop policy "Audit readers can read the audit trail" on public.audit_log;

create policy "Audit readers can read the audit trail within their scope" on public.audit_log
  for select to authenticated
  using (
    (select public.has_permission('view_audit_log'))
    and (
      (select public.my_scope()) = 'company'
      or public.audit_entry_in_my_scope(table_name, record_id, changes)
    )
  );

-- ---------------------------------------------------------------------------
-- Every active person belongs to at least one office. A switched-off person
-- may be left with none.
-- ---------------------------------------------------------------------------

create or replace function public.update_person(
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

  if is_active and cardinality(offices) = 0 then
    raise exception 'Pick at least one office.' using errcode = 'check_violation';
  end if;

  if primary_office_id is not null and not (primary_office_id = any (offices)) then
    raise exception 'The main office must be one of the person''s offices.' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.profiles p where p.id = person_id) then
    raise exception 'That person was not found.' using errcode = 'no_data_found';
  end if;

  -- Offices first, then the profile: an Admin stepping down to another role
  -- must still be allowed to finish their own save.
  delete from public.profile_offices po
   where po.profile_id = person_id
     and not (po.office_id = any (offices));

  insert into public.profile_offices (profile_id, office_id)
  select person_id, office_id
    from unnest(offices) as office_id
  on conflict (profile_id, office_id) do nothing;

  update public.profiles p
     set first_name = nullif(btrim(update_person.first_name), ''),
         last_name = nullif(btrim(update_person.last_name), ''),
         role_id = update_person.role_id,
         primary_office_id = update_person.primary_office_id,
         is_active = update_person.is_active
   where p.id = person_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Records keep their id. Every link, and every audit entry, points at it.
-- ---------------------------------------------------------------------------

create or replace function public.set_standard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := new.created_at;
    new.created_by := auth.uid();
  else
    if new.id is distinct from old.id then
      raise exception 'A record''s id cannot be changed.' using errcode = 'check_violation';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign out everywhere. When a person is switched off, or given a temporary
-- password, their sign-in sessions end on every device. Their open screens
-- stop working at the next request and they are sent back to sign in.
--
-- Sessions live in the sign-in service's own table. If this database is
-- ever not allowed to touch it, the change to the person still goes through
-- and a warning is logged, because the access rules already shut them out.
-- ---------------------------------------------------------------------------

create function public.end_sessions(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = person;
exception
  when insufficient_privilege or undefined_table then
    raise warning 'Could not end the sign-in sessions of %: %', person, sqlerrm;
end;
$$;

revoke execute on function public.end_sessions(uuid) from public, anon, authenticated;

create function public.end_sessions_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.is_active and not new.is_active)
     or (not old.must_change_password and new.must_change_password) then
    perform public.end_sessions(new.id);
  end if;
  return null;
end;
$$;

revoke execute on function public.end_sessions_on_profile_change() from public, anon, authenticated;

create trigger end_sessions_on_profile_change after update of is_active, must_change_password on public.profiles
  for each row execute function public.end_sessions_on_profile_change();

-- A reset for someone already on a temporary password changes nothing on
-- the profile, so the reset ends their sessions itself as well.
create or replace function public.require_password_change(person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('manage_users') then
    raise exception 'Only people managers can reset passwords.' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set must_change_password = true where id = person_id;

  if not found then
    raise exception 'That person was not found.' using errcode = 'no_data_found';
  end if;

  perform public.end_sessions(person_id);
end;
$$;
