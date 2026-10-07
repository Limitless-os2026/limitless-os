-- Phase 1, step 3: who can see and change customers, properties,
-- organizations and contacts (spec section 8, and "Decisions from step 3").
--
--   Customers    Until jobs exist: Sales sees the customers they created,
--                Project managers the customers in their offices, and
--                company-scope roles (Admin, Accountant) all of them. This
--                goes by the role's scope, not its name. Step 4 adds "anyone
--                who can see one of the customer's jobs" to can_see_customer().
--   Properties   Follow their customer.
--   Partners     Organizations and contacts are visible to all staff, and
--                anyone can add or edit them. Changing an organization's
--                type or parent needs manage_partner_structure.
--
-- Also here: the duplicate warning by phone number, the search behind the
-- one search box, and adding a customer with a first property in one go.

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

-- True when the signed-in person may see the customer. The customer id is
-- here for step 4, which adds the job-based rule with create or replace.
create function public.can_see_customer(customer uuid, office uuid, creator uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_scope()
    when 'company' then true
    when 'state' then public.office_in_my_scope(office)
    when 'office' then public.office_in_my_scope(office)
    when 'own' then creator is not distinct from auth.uid()
    else false
  end;
$$;

revoke execute on function public.can_see_customer(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_see_customer(uuid, uuid, uuid) to authenticated;

grant select, insert, update on public.customers to authenticated;

create policy "Staff can see customers within their scope" on public.customers
  for select to authenticated
  using (public.can_see_customer(id, office_id, created_by));

-- A new customer goes in an office within the person's scope: their own
-- offices, or any office for company-scope roles.
create policy "Staff can add customers in their offices" on public.customers
  for insert to authenticated
  with check ((select public.is_active_staff()) and public.office_in_my_scope(office_id));

-- Anyone who can see a customer can change them, and must still be able to
-- see them afterwards. A Sales rep who moves to another office keeps the
-- customers they created.
create policy "Staff can change the customers they can see" on public.customers
  for update to authenticated
  using (public.can_see_customer(id, office_id, created_by))
  with check (public.can_see_customer(id, office_id, created_by));

-- A customer can only be moved to an office within the person's scope.
-- The database itself (migrations, server functions) is not limited.
create function public.keep_customers_in_my_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.office_id is not distinct from old.office_id then
    return new;
  end if;
  if not public.office_in_my_scope(new.office_id) then
    raise exception 'You can only move a customer to one of your own offices.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_customers_in_my_scope() from public, anon, authenticated;

create trigger keep_customers_in_my_scope before update of office_id on public.customers
  for each row execute function public.keep_customers_in_my_scope();

-- ---------------------------------------------------------------------------
-- Properties follow their customer. The checks below read customers through
-- its own rules, so a hidden customer hides its properties.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.properties to authenticated;

create policy "Staff can see the properties of customers they can see" on public.properties
  for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id));

create policy "Staff can add properties to customers they can see" on public.properties
  for insert to authenticated
  with check ((select public.is_active_staff()) and exists (select 1 from public.customers c where c.id = customer_id));

create policy "Staff can change the properties of customers they can see" on public.properties
  for update to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id))
  with check (exists (select 1 from public.customers c where c.id = customer_id));

-- ---------------------------------------------------------------------------
-- Organizations and contacts: visible to all staff, and anyone can add or
-- edit them. An organization's place in the chain (type and parent) is
-- changed only with manage_partner_structure.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.organizations, public.contacts to authenticated;

create policy "Staff can see organizations" on public.organizations
  for select to authenticated using ((select public.is_active_staff()));
create policy "Staff can add organizations" on public.organizations
  for insert to authenticated with check ((select public.is_active_staff()));
create policy "Staff can change organizations" on public.organizations
  for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

create policy "Staff can see contacts" on public.contacts
  for select to authenticated using ((select public.is_active_staff()));
create policy "Staff can add contacts" on public.contacts
  for insert to authenticated with check ((select public.is_active_staff()));
create policy "Staff can change contacts" on public.contacts
  for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- The database itself (migrations, server functions) is not limited.
create function public.guard_organization_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_permission('manage_partner_structure') then
    return new;
  end if;

  if new.org_type is distinct from old.org_type
     or new.parent_organization_id is distinct from old.parent_organization_id then
    raise exception 'Only a Project manager or Admin can change an organization''s type or parent.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_organization_structure() from public, anon, authenticated;

create trigger guard_organization_structure before update on public.organizations
  for each row execute function public.guard_organization_structure();

-- ---------------------------------------------------------------------------
-- Audit trail by office, continued: customers belong to an office.
-- ---------------------------------------------------------------------------

create or replace function public.audit_entry_in_my_scope(table_name text, record_id uuid, changes jsonb)
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
  elsif table_name = 'customers' then
    return exists (
      select 1 from public.customers c
       where c.id = record_id and public.office_in_my_scope(c.office_id)
    );
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phone numbers. Only the digits matter, and a leading 1 (the US country
-- code) is ignored, so "(610) 555-0100" and "1-610-555-0100" are the same
-- number.
-- ---------------------------------------------------------------------------

create function public.phone_key(phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(phone, ''), '\D', '', 'g') as d) as digits;
$$;

grant execute on function public.phone_key(text) to authenticated;

create index customers_phone_key_idx on public.customers (public.phone_key(phone_digits)) where archived_at is null;

-- How a customer is named in lists, search results and the duplicate
-- warning: the company name for a company, otherwise the person's name, and
-- the company name again for a person recorded with only a company name. A
-- customer always has one or the other.
create function public.customer_display_name(customer_type text, first_name text, last_name text, company_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when customer_type = 'company' and nullif(btrim(company_name), '') is not null then btrim(company_name)
    else coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), btrim(company_name), '')
  end;
$$;

grant execute on function public.customer_display_name(text, text, text, text) to authenticated;

-- The duplicate warning on the New customer form. Runs as the table owner so
-- it finds the customer whoever created them, and says whether the caller
-- may open that customer. It gives back only the name and office, never the
-- customer's own details.
create function public.customers_with_phone(phone text)
returns table (customer_id uuid, display_name text, office_name text, can_open boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key text := public.phone_key(phone);
begin
  if not public.is_active_staff() or length(key) < 7 then
    return;
  end if;

  return query
    select c.id,
           public.customer_display_name(c.customer_type, c.first_name, c.last_name, c.company_name),
           o.name,
           public.can_see_customer(c.id, c.office_id, c.created_by)
      from public.customers c
      join public.offices o on o.id = c.office_id
     where c.archived_at is null
       and public.phone_key(c.phone_digits) = key
     order by c.created_at;
end;
$$;

revoke execute on function public.customers_with_phone(text) from public, anon;
grant execute on function public.customers_with_phone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Adding a customer, with a first property in the same go. Runs as the
-- caller, so the rules above apply. Either both save or neither does.
-- ---------------------------------------------------------------------------

create function public.add_customer(
  customer_type text,
  first_name text,
  last_name text,
  company_name text,
  phone text,
  email text,
  office_id uuid,
  property_address_line1 text default null,
  property_address_line2 text default null,
  property_city text default null,
  property_state text default null,
  property_zip text default null,
  property_type text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_customer uuid;
begin
  insert into public.customers (customer_type, first_name, last_name, company_name, phone, email, office_id)
  values (
    coalesce(nullif(btrim(add_customer.customer_type), ''), 'person'),
    nullif(btrim(add_customer.first_name), ''),
    nullif(btrim(add_customer.last_name), ''),
    nullif(btrim(add_customer.company_name), ''),
    btrim(add_customer.phone),
    nullif(lower(btrim(add_customer.email)), ''),
    add_customer.office_id
  )
  returning id into new_customer;

  if nullif(btrim(add_customer.property_address_line1), '') is not null then
    insert into public.properties (customer_id, address_line1, address_line2, city, state, zip, property_type)
    values (
      new_customer,
      btrim(add_customer.property_address_line1),
      nullif(btrim(add_customer.property_address_line2), ''),
      nullif(btrim(add_customer.property_city), ''),
      nullif(upper(btrim(add_customer.property_state)), ''),
      nullif(btrim(add_customer.property_zip), ''),
      nullif(btrim(add_customer.property_type), '')
    );
  end if;

  return new_customer;
end;
$$;

revoke execute on function public.add_customer(text, text, text, text, text, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.add_customer(text, text, text, text, text, text, uuid, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The one search box: customer name, phone, email and property address, and
-- organization and contact names. Runs as the caller, so each person finds
-- only what they may see. Up to 20 matches of each kind.
-- ---------------------------------------------------------------------------

create function public.search_records(query text)
returns table (kind text, id uuid, title text, detail text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  q text := btrim(coalesce(query, ''));
  pattern text;
  digits text;
begin
  if q = '' then
    return;
  end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  digits := regexp_replace(q, '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '1' then
    digits := substr(digits, 2);
  end if;

  return query
    select 'customer'::text,
           c.id,
           public.customer_display_name(c.customer_type, c.first_name, c.last_name, c.company_name),
           concat_ws(' · ', c.phone, (
             select concat_ws(', ', p.address_line1, p.city)
               from public.properties p
              where p.customer_id = c.id and p.archived_at is null
              order by p.created_at limit 1
           ))
      from public.customers c
     where c.archived_at is null
       and (
         concat_ws(' ', c.first_name, c.last_name) ilike pattern
         or c.company_name ilike pattern
         or c.email ilike pattern
         or (length(digits) >= 3 and c.phone_digits like '%' || digits || '%')
         or exists (
           select 1 from public.properties p
            where p.customer_id = c.id and p.archived_at is null
              and concat_ws(' ', p.address_line1, p.address_line2, p.city, p.state, p.zip) ilike pattern
         )
       )
     order by 3
     limit 20;

  return query
    select 'organization'::text, o.id, o.name, o.org_type
      from public.organizations o
     where o.archived_at is null and o.name ilike pattern
     order by o.name
     limit 20;

  return query
    select 'contact'::text,
           ct.id,
           btrim(concat_ws(' ', ct.first_name, ct.last_name)),
           (select o.name from public.organizations o where o.id = ct.organization_id)
      from public.contacts ct
     where ct.archived_at is null
       and concat_ws(' ', ct.first_name, ct.last_name) ilike pattern
     order by 3
     limit 20;
end;
$$;

revoke execute on function public.search_records(text) from public, anon;
grant execute on function public.search_records(text) to authenticated;
