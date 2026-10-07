#!/usr/bin/env bash
# Tests the migrations and the access rules against a real Postgres.
#
# Makes a throwaway database, adds a stand-in for Supabase's sign-in schema,
# applies every migration in order (each in its own transaction, as Supabase
# does) and the local seed data, then runs the checks in access_rules.sql. Needs psql and a Postgres
# you can create databases on. Connection settings come from the usual
# PGHOST, PGUSER, PGPASSWORD and PGPORT variables.
#
#   npm run test:db

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
db="${TEST_DATABASE:-limitless_os_test}"
psql_run=(psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 --dbname "$db")

# A fresh database with the stand-in sign-in schema.
fresh_database() {
  dropdb --if-exists "$db"
  createdb "$db"
  # The stand-in roles are cluster-wide, so clear any left from an earlier run.
  psql --no-psqlrc --quiet --dbname "$db" -c "drop role if exists anon; drop role if exists authenticated; drop role if exists service_role;" >/dev/null
  "${psql_run[@]}" --single-transaction -f "$here/auth_stand_in.sql"
}

apply_migrations() {
  for migration in "$here"/../migrations/*.sql; do
    echo "Applying $(basename "$migration")"
    "${psql_run[@]}" --single-transaction -f "$migration"
  done
}

echo "== A brand-new project"
fresh_database
apply_migrations
"${psql_run[@]}" --output /dev/null -f "$here/first_sign_up.sql"

echo "== A project that already has a sign-in account"
fresh_database

# A sign-in account made before the migrations run, to check it gets a
# profile and becomes the first Admin.
"${psql_run[@]}" -c "insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com', now() - interval '1 day');"

apply_migrations

echo "Applying seed.sql"
"${psql_run[@]}" --single-transaction -f "$here/../seed.sql"

echo "Running access_rules.sql"
"${psql_run[@]}" --output /dev/null -f "$here/access_rules.sql"

dropdb "$db"
echo "All database checks passed."
