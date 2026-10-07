-- Phase 1, step 2: company structure (spec section 7, "Company structure").
-- States, offices, teams, roles, role permissions, profiles, the offices each
-- person belongs to, and team members.
--
-- Every table has the standard columns: id, created_at, updated_at and
-- created_by. The database fills them in through set_standard_columns(), so
-- the app never sends them. Row level security is switched on here for every
-- table; the rules themselves are in the access rules migration.

-- ---------------------------------------------------------------------------
-- Standard columns
-- ---------------------------------------------------------------------------

-- Fills in created_at, updated_at and created_by on insert, keeps created_at
-- and created_by from being changed later, and moves updated_at on every
-- update. created_by is the signed-in person, or empty when the database
-- itself writes the row (migrations, sign-up).
create function public.set_standard_columns()
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
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.states (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  code text not null unique check (code ~ '^[A-Z]{2}$'),
  name text not null,
  is_active boolean not null default true
);

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  state_id uuid not null references public.states (id),
  name text not null,
  time_zone text not null,
  phone text,
  address_line1 text,
  city text,
  zip text,
  is_active boolean not null default true
);

create index offices_state_id_idx on public.offices (state_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  office_id uuid not null references public.offices (id),
  name text not null,
  team_type text not null check (team_type in ('sales', 'production', 'ems_crew', 'office')),
  is_active boolean not null default true
);

create index teams_office_id_idx on public.teams (office_id);

-- A role is a scope (how far it sees) plus a list of permissions (what it may do).
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  scope text not null check (scope in ('company', 'state', 'office', 'own'))
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  role_id uuid not null references public.roles (id),
  permission_key text not null check (permission_key ~ '^[a-z][a-z0-9_]*$'),
  unique (role_id, permission_key)
);

-- One row per person who signs in. The id is the Supabase sign-in account id.
-- Accounts cannot be removed while a profile points at them: switch the
-- person off instead, so their history stays.
create table public.profiles (
  id uuid primary key references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  first_name text,
  last_name text,
  email text unique,
  phone text,
  role_id uuid not null references public.roles (id),
  primary_office_id uuid references public.offices (id),
  is_active boolean not null default true
);

create index profiles_role_id_idx on public.profiles (role_id);
create index profiles_primary_office_id_idx on public.profiles (primary_office_id);

create table public.profile_offices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  profile_id uuid not null references public.profiles (id),
  office_id uuid not null references public.offices (id),
  unique (profile_id, office_id)
);

create index profile_offices_office_id_idx on public.profile_offices (office_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  team_id uuid not null references public.teams (id),
  profile_id uuid not null references public.profiles (id),
  is_lead boolean not null default false,
  unique (team_id, profile_id)
);

create index team_members_profile_id_idx on public.team_members (profile_id);

-- created_by points at profiles, which had to come after the tables above.
alter table public.states add foreign key (created_by) references public.profiles (id);
alter table public.offices add foreign key (created_by) references public.profiles (id);
alter table public.teams add foreign key (created_by) references public.profiles (id);
alter table public.roles add foreign key (created_by) references public.profiles (id);
alter table public.role_permissions add foreign key (created_by) references public.profiles (id);

-- ---------------------------------------------------------------------------
-- Standard column triggers and row level security, on every table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'states', 'offices', 'teams', 'roles', 'role_permissions',
    'profiles', 'profile_offices', 'team_members'
  ] loop
    execute format(
      'create trigger set_standard_columns before insert or update on public.%I
         for each row execute function public.set_standard_columns()', t);
    execute format('alter table public.%I enable row level security', t);
    -- Nobody signed out can touch these tables. Signed-in access is granted
    -- table by table in the access rules migration.
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
