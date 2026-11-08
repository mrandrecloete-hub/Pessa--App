#!/usr/bin/env bash
# Spins up a throwaway Postgres, stubs Supabase's auth schema, applies migrations + seed, runs rls.sql.
set -euo pipefail
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
D=$(mktemp -d); chmod 777 "$D"
run() { su postgres -c "$*"; }
run "$PGBIN/initdb -D $D/data -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $D/data -o '-p 54399 -k $D' -l $D/log -w start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $D/data -m immediate stop >/dev/null" || true' EXIT
P="psql -h $D -p 54399 -v ON_ERROR_STOP=1 -q -d postgres"
HERE=$(cd "$(dirname "$0")/../.." && pwd)
run "$P <<'SQL'
create role authenticated nologin; create role anon nologin;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
SQL"
for f in "$HERE"/supabase/migrations/*.sql; do run "$P -f $f"; done
run "$P -f $HERE/supabase/seed.sql"
run "$P -c 'grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;'"
run "$P -f $HERE/tests/db/rls.sql"
