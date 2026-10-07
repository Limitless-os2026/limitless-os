-- Phase 1, step 2: the rows production needs from day one (spec section 7).
-- These are in a migration, not seed.sql, because production deploys skip
-- seed files. An Admin can change them later.

insert into public.states (code, name) values
  ('PA', 'Pennsylvania'),
  ('UT', 'Utah');

-- Phone and street address are left empty for an Admin to fill in.
insert into public.offices (state_id, name, time_zone, city)
select s.id, o.name, o.time_zone, o.city
  from (values
    ('PA', 'Reading', 'America/New_York', 'Reading'),
    ('UT', 'American Fork', 'America/Denver', 'American Fork')
  ) as o (state_code, name, time_zone, city)
  join public.states s on s.code = o.state_code;

-- A field_tech role (own) is added in Phase 2.
insert into public.roles (key, name, scope) values
  ('admin', 'Admin', 'company'),
  ('project_manager', 'Project manager', 'office'),
  ('sales', 'Sales', 'own'),
  ('accountant', 'Accountant', 'company');

-- A starting set of permissions, from spec section 8. Scope still limits
-- what each permission reaches: Sales with view_commissions sees only their
-- own commission, a Project manager only their offices' margins.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.permission_key
  from (values
    -- Admin: everything, including settings and permissions.
    ('admin', 'manage_users'),
    ('admin', 'manage_permissions'),
    ('admin', 'manage_settings'),
    ('admin', 'view_audit_log'),
    ('admin', 'view_margins'),
    ('admin', 'view_commissions'),
    ('admin', 'edit_sales_credits'),
    ('admin', 'reassign_jobs'),
    ('admin', 'view_partner_reports'),
    -- Project manager: everything in their offices, money included.
    -- Cannot change permissions, people or settings.
    ('project_manager', 'view_margins'),
    ('project_manager', 'view_commissions'),
    ('project_manager', 'edit_sales_credits'),
    ('project_manager', 'reassign_jobs'),
    ('project_manager', 'view_partner_reports'),
    -- Sales: their own commission. Partner reports are off for Sales.
    ('sales', 'view_commissions'),
    -- Accountant: the financials of every job.
    ('accountant', 'view_margins'),
    ('accountant', 'view_commissions'),
    ('accountant', 'view_partner_reports')
  ) as p (role_key, permission_key)
  join public.roles r on r.key = p.role_key;
