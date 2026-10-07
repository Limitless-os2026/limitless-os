-- Cleanup between Phase 1 steps 2 and 3: adding people from the app.
--
-- An Admin adds a person, or resets their password, through the
-- manage-people server function (supabase/functions/manage-people). It gives
-- them a temporary password, shown once to the Admin. Until the person
-- chooses their own password they can sign in but do nothing else: the
-- database treats them like someone switched off.
--
-- Everyone can also change their own name and phone, and nothing else about
-- themselves.

alter table public.profiles
  add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True while the person still has a temporary password from an Admin. Cleared by the database when they choose their own.';

-- ---------------------------------------------------------------------------
-- Someone on a temporary password counts as not yet on staff, so every
-- access rule shuts them out until they choose their own password. They can
-- still read their own profile, so the app knows to ask for one.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active and not must_change_password
  );
$$;

create or replace function public.has_permission(permission text)
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
       and not p.must_change_password
       and rp.permission_key = permission
  );
$$;

-- ---------------------------------------------------------------------------
-- Choosing a password clears the flag. The sign-in service writes the new
-- password to auth.users, so the database notices it there, whoever made the
-- change. The server function sets the flag again straight after it issues a
-- temporary password.
-- ---------------------------------------------------------------------------

create function public.handle_auth_user_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set must_change_password = false
   where id = new.id
     and must_change_password;
  return new;
end;
$$;

revoke execute on function public.handle_auth_user_password_change() from public, anon, authenticated;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.handle_auth_user_password_change();

-- Called by the server function, as the Admin, right after it issues a
-- temporary password. Runs as the table owner because nobody can write this
-- column directly, and checks the caller itself. The audit trail records the
-- Admin who did it.
create function public.require_password_change(person_id uuid)
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
end;
$$;

revoke execute on function public.require_password_change(uuid) from public, anon;
grant execute on function public.require_password_change(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Your own details: name and phone, nothing else.
-- ---------------------------------------------------------------------------

create function public.update_my_details(first_name text, last_name text, phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Your account cannot change anything right now.' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles p
     set first_name = nullif(btrim(update_my_details.first_name), ''),
         last_name = nullif(btrim(update_my_details.last_name), ''),
         phone = nullif(btrim(update_my_details.phone), '')
   where p.id = auth.uid();
end;
$$;

revoke execute on function public.update_my_details(text, text, text) from public, anon;
grant execute on function public.update_my_details(text, text, text) to authenticated;
