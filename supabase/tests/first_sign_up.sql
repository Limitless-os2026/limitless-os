-- On a brand-new project with no sign-in accounts yet, the first account
-- made after the migrations becomes Admin and the next one Sales.

\set ON_ERROR_STOP 1

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'first@example.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000002', 'second@example.com');

do $$
begin
  if (select r.key from public.profiles p join public.roles r on r.id = p.role_id
       where p.id = '00000000-0000-0000-0000-000000000001') is distinct from 'admin' then
    raise exception 'FAILED: the first account to sign up becomes Admin';
  end if;
  raise notice 'ok: the first account to sign up becomes Admin';
  if (select r.key from public.profiles p join public.roles r on r.id = p.role_id
       where p.id = '00000000-0000-0000-0000-000000000002') is distinct from 'sales' then
    raise exception 'FAILED: the second account starts as Sales';
  end if;
  raise notice 'ok: the second account starts as Sales';
end;
$$;
