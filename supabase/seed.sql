-- Seed data for local development and preview branches. Made-up names only.
-- Production never runs this file. The rows production needs (states,
-- offices, roles and permissions) are in supabase/migrations/.
--
-- People are not seeded: create a sign-in account in the local Supabase
-- dashboard and it gets a profile automatically. The first one is Admin.

insert into public.teams (office_id, name, team_type)
select o.id, t.name, t.team_type
  from (values
    ('Reading', 'Reading sales', 'sales'),
    ('Reading', 'Reading production', 'production'),
    ('Reading', 'Reading emergency crew', 'ems_crew'),
    ('American Fork', 'American Fork sales', 'sales')
  ) as t (office_name, name, team_type)
  join public.offices o on o.name = t.office_name;

-- Partners: two SERVPRO ownership groups with their franchises, a carrier
-- and a property manager. Made-up names and places.
insert into public.organizations (name, org_type, is_referral_partner, phone, city, state) values
  ('Keystone Restoration Holdings', 'servpro_group', true, '610-555-0150', 'Reading', 'PA'),
  ('Wasatch Mitigation Partners', 'servpro_group', true, '801-555-0160', 'Lehi', 'UT'),
  ('Blue Mountain Mutual Insurance', 'insurance_carrier', false, '800-555-0170', 'Harrisburg', 'PA'),
  ('Maple Court Property Management', 'property_manager', true, '610-555-0180', 'Wyomissing', 'PA');

insert into public.organizations (name, org_type, parent_organization_id, is_referral_partner, phone, city, state)
select f.name, 'servpro_franchise', g.id, true, f.phone, f.city, f.state
  from (values
    ('SERVPRO of Birch Hollow', 'Keystone Restoration Holdings', '610-555-0151', 'Reading', 'PA'),
    ('SERVPRO of Pine Ridge', 'Keystone Restoration Holdings', '610-555-0152', 'Shillington', 'PA'),
    ('SERVPRO of Timpview', 'Wasatch Mitigation Partners', '801-555-0161', 'American Fork', 'UT')
  ) as f (name, group_name, phone, city, state)
  join public.organizations g on g.name = f.group_name;

insert into public.contacts (organization_id, first_name, last_name, title, contact_role, phone, mobile, email)
select o.id, c.first_name, c.last_name, c.title, c.contact_role, c.phone, c.mobile, c.email
  from (values
    ('SERVPRO of Birch Hollow', 'Priya', 'Nandakumar', 'Mitigation manager', 'mitigation_manager', '610-555-0151', '610-555-0191', 'priya@example.com'),
    ('SERVPRO of Birch Hollow', 'Marcus', 'Bell', 'Dispatcher', 'dispatcher', '610-555-0151', null, 'marcus@example.com'),
    ('SERVPRO of Pine Ridge', 'Elena', 'Vasquez', 'General manager', 'general_manager', '610-555-0152', '610-555-0192', 'elena@example.com'),
    ('SERVPRO of Timpview', 'Owen', 'Hatch', 'Owner', 'owner', '801-555-0161', '801-555-0193', 'owen@example.com'),
    ('Blue Mountain Mutual Insurance', 'Theo', 'Lindqvist', 'Field adjuster', 'adjuster', '800-555-0170', '717-555-0194', 'theo@example.com')
  ) as c (organization_name, first_name, last_name, title, contact_role, phone, mobile, email)
  join public.organizations o on o.name = c.organization_name;

insert into public.contacts (first_name, last_name, title, contact_role, mobile, email) values
  ('Rosa', 'Delgado', 'Independent agent', 'agent', '610-555-0195', 'rosa@example.com');

-- Customers and their properties. Made-up people and addresses.
insert into public.customers (customer_type, first_name, last_name, company_name, phone, email, office_id)
select c.customer_type, c.first_name, c.last_name, c.company_name, c.phone, c.email, o.id
  from (values
    ('person', 'Dana', 'Whitfield', null, '(610) 555-0101', 'dana.whitfield@example.com', 'Reading'),
    ('person', 'Samuel', 'Okafor', null, '610-555-0102', null, 'Reading'),
    ('company', 'Grace', 'Tran', 'Oakridge Property Group LLC', '610-555-0103', 'grace@example.com', 'Reading'),
    ('person', 'Luis', 'Herrera', null, '801-555-0104', 'luis.herrera@example.com', 'American Fork')
  ) as c (customer_type, first_name, last_name, company_name, phone, email, office_name)
  join public.offices o on o.name = c.office_name;

insert into public.properties (customer_id, address_line1, city, state, zip, property_type)
select c.id, p.address_line1, p.city, p.state, p.zip, p.property_type
  from (values
    ('(610) 555-0101', '412 Birchwood Lane', 'Reading', 'PA', '19601', 'residential'),
    ('610-555-0102', '88 Quarry Road', 'Shillington', 'PA', '19607', 'residential'),
    ('610-555-0103', '1500 Commerce Drive', 'Wyomissing', 'PA', '19610', 'commercial'),
    ('610-555-0103', '1510 Commerce Drive', 'Wyomissing', 'PA', '19610', 'commercial'),
    ('801-555-0104', '27 Alpine Loop', 'American Fork', 'UT', '84003', 'residential')
  ) as p (customer_phone, address_line1, city, state, zip, property_type)
  join public.customers c on c.phone = p.customer_phone;
