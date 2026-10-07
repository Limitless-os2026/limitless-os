-- Phase 1, step 3: people and places (spec section 7, "People and places").
-- Customers, their properties, partner organizations and professional
-- contacts.
--
-- Every table has the standard columns, filled in by set_standard_columns(),
-- and archived_at: nothing is deleted. Row level security is switched on
-- here; the rules themselves are in the next migration.

-- ---------------------------------------------------------------------------
-- Customers. A customer needs a name (first name or company name) and a
-- phone number, nothing else. phone_digits is kept by the database for
-- search and duplicate warnings.
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  customer_type text not null default 'person' check (customer_type in ('person', 'company')),
  first_name text,
  last_name text,
  company_name text,
  phone text not null,
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  phone_alt text,
  email text,
  preferred_contact text check (preferred_contact in ('call', 'text', 'email')),
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_state text check (billing_state ~ '^[A-Z]{2}$'),
  billing_zip text,
  office_id uuid not null references public.offices (id),
  notes text,
  external_source text,
  external_id text,
  archived_at timestamptz,
  constraint customers_need_a_name check (
    nullif(btrim(first_name), '') is not null or nullif(btrim(company_name), '') is not null
  ),
  -- A phone number has at least seven digits, however it is written.
  constraint customers_need_a_phone check (length(regexp_replace(phone, '\D', '', 'g')) >= 7)
);

create index customers_office_id_idx on public.customers (office_id);
create index customers_created_by_idx on public.customers (created_by);
create index customers_phone_digits_idx on public.customers (phone_digits);
create index customers_external_idx on public.customers (external_source, external_id);

-- ---------------------------------------------------------------------------
-- Properties. One customer can have many. Latitude and longitude stay empty
-- until mapping arrives in Phase 5.
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  customer_id uuid not null references public.customers (id),
  address_line1 text not null check (btrim(address_line1) <> ''),
  address_line2 text,
  city text,
  state text check (state ~ '^[A-Z]{2}$'),
  zip text,
  county text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  property_type text check (property_type in ('residential', 'commercial', 'multi_family')),
  notes text,
  external_source text,
  external_id text,
  archived_at timestamptz
);

create index properties_customer_id_idx on public.properties (customer_id);
create index properties_external_idx on public.properties (external_source, external_id);

-- ---------------------------------------------------------------------------
-- Organizations. SERVPRO ownership groups own franchises: a franchise points
-- to its group through parent_organization_id. Other partners (carriers,
-- property managers, suppliers) are organizations too.
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  name text not null check (btrim(name) <> ''),
  org_type text not null check (org_type in (
    'servpro_group', 'servpro_franchise', 'restoration_company', 'insurance_carrier',
    'mortgage_company', 'property_manager', 'supplier', 'subcontractor', 'vendor', 'other'
  )),
  parent_organization_id uuid references public.organizations (id) check (parent_organization_id <> id),
  is_referral_partner boolean not null default false,
  relationship_owner_id uuid references public.profiles (id),
  phone text,
  email text,
  address_line1 text,
  city text,
  state text check (state ~ '^[A-Z]{2}$'),
  zip text,
  notes text,
  external_source text,
  external_id text,
  archived_at timestamptz
);

create index organizations_parent_idx on public.organizations (parent_organization_id);
create index organizations_external_idx on public.organizations (external_source, external_id);

-- An organization cannot be its own parent through a loop either. Runs as
-- the table owner so it walks the whole chain, including any organization
-- the person making the change cannot see (an archived one, for instance).
-- The walk uses "union", not "union all", so it stops by itself when it
-- meets an organization twice: no cap on the length of a chain.
create function public.keep_organizations_a_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  loops boolean;
begin
  if new.parent_organization_id is null then
    return new;
  end if;

  with recursive chain as (
    select o.id, o.parent_organization_id
      from public.organizations o
     where o.id = new.parent_organization_id
    union
    select o.id, o.parent_organization_id
      from public.organizations o
      join chain on o.id = chain.parent_organization_id
  )
  select exists (select 1 from chain where chain.id = new.id) into loops;

  if loops then
    raise exception 'That would make the organization part of its own chain.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_organizations_a_tree() from public, anon, authenticated;

create trigger keep_organizations_a_tree before insert or update of parent_organization_id on public.organizations
  for each row execute function public.keep_organizations_a_tree();

-- ---------------------------------------------------------------------------
-- Contacts: professional contacts, kept apart from customers. A contact may
-- belong to an organization, and needs a first or last name.
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  organization_id uuid references public.organizations (id),
  first_name text,
  last_name text,
  title text,
  contact_role text check (contact_role in (
    'owner', 'general_manager', 'mitigation_manager', 'project_manager', 'dispatcher',
    'estimator', 'office_manager', 'adjuster', 'agent', 'other'
  )),
  phone text,
  mobile text,
  email text,
  notes text,
  external_source text,
  external_id text,
  archived_at timestamptz,
  constraint contacts_need_a_name check (
    nullif(btrim(first_name), '') is not null or nullif(btrim(last_name), '') is not null
  )
);

create index contacts_organization_id_idx on public.contacts (organization_id);
create index contacts_external_idx on public.contacts (external_source, external_id);

-- ---------------------------------------------------------------------------
-- Standard column triggers and row level security, on every table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'properties', 'organizations', 'contacts'] loop
    execute format(
      'create trigger set_standard_columns before insert or update on public.%I
         for each row execute function public.set_standard_columns()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Customers are audited in Phase 1 (spec section 7, audit_log).
create trigger audit_row_change after insert or update or delete on public.customers
  for each row execute function public.audit_row_change();
