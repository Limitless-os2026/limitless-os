-- Phase 1, step 2: the audit trail (spec section 7, audit_log).
-- Written only by triggers. No role can add, change or remove a row.
-- Phase 1 audits jobs, job_sales_credits, customers and profiles. This step
-- adds profiles, and the offices each person belongs to, since those decide
-- what a person can see. Later steps attach the same trigger to their tables.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- One entry per changed field: {"field": {"old": ..., "new": ...}}
  changes jsonb not null,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

-- Records what changed on a row. Runs as the table owner so it can write to
-- audit_log, which nobody else can. updated_at is left out: it changes on
-- every update and says nothing the audit row does not.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  diff jsonb;
begin
  select coalesce(jsonb_object_agg(field, jsonb_build_object('old', old_row -> field, 'new', new_row -> field)), '{}'::jsonb)
    into diff
    from (select jsonb_object_keys(old_row || new_row) as field) as fields
   where field <> 'updated_at'
     and (old_row -> field) is distinct from (new_row -> field);

  if diff = '{}'::jsonb then
    return null;
  end if;

  insert into public.audit_log (table_name, record_id, action, changes, changed_by, created_by)
  values (
    tg_table_name,
    coalesce((new_row ->> 'id'), (old_row ->> 'id'))::uuid,
    lower(tg_op),
    diff,
    auth.uid(),
    auth.uid()
  );
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger audit_row_change after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger audit_row_change after insert or update or delete on public.profile_offices
  for each row execute function public.audit_row_change();
