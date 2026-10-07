-- Phase 1, step 2: every sign-in account gets a profile automatically.
-- The very first profile becomes Admin. Everyone after starts as Sales with
-- no office until an Admin changes them on the People screen.

create function public.create_profile_for_user(user_id uuid, user_email text, user_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  starting_role text;
  role uuid;
begin
  -- One sign-up at a time, so two people signing up together cannot both
  -- become the first Admin.
  perform pg_advisory_xact_lock(hashtext('public.create_profile_for_user'));

  if exists (select 1 from public.profiles where id = user_id) then
    return;
  end if;

  starting_role := case when exists (select 1 from public.profiles) then 'sales' else 'admin' end;

  select id into role from public.roles where key = starting_role;
  if role is null then
    raise exception 'The % role is missing, so no profile can be made.', starting_role;
  end if;

  insert into public.profiles (id, email, first_name, last_name, role_id)
  values (
    user_id,
    user_email,
    nullif(btrim(user_meta ->> 'first_name'), ''),
    nullif(btrim(user_meta ->> 'last_name'), ''),
    role
  );
end;
$$;

revoke execute on function public.create_profile_for_user(uuid, text, jsonb) from public, anon, authenticated;

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_profile_for_user(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

-- Keeps the profile's email in step with the sign-in account.
create function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_change();

-- Sign-in accounts made before this migration get their profiles now, oldest
-- first, so the first account ever made becomes the Admin.
do $$
declare
  u record;
begin
  for u in select id, email, raw_user_meta_data from auth.users order by created_at, id loop
    perform public.create_profile_for_user(u.id, u.email, u.raw_user_meta_data);
  end loop;
end;
$$;
