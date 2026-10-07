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
