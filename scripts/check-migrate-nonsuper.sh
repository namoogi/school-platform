#!/usr/bin/env bash
# 108차 교훈: 운영(Supabase)의 마이그레이션 역할은 슈퍼유저가 아니다. 로컬·CI 의 슈퍼유저로는 '남의 함수를 다시 정의' 같은 실패를 못 잡는다.
# 이 점검은 새 클러스터에서 슈퍼유저 아닌 역할(CREATEROLE)로 모든 마이그레이션을 처음부터 적용해 본다.
# 확장(pgcrypto·btree_gist)만 Supabase 처럼 미리 만들어 둔다.
# 사용: ADMIN_URL=postgres://postgres@127.0.0.1:54322 scripts/check-migrate-nonsuper.sh
# 주의: 역할(authenticated·app_writer 등)은 클러스터 전체에 하나다. 이미 슈퍼유저가 만든 역할이 있는 클러스터(로컬 개발 DB)에서는
#       운영과 조건이 달라 실패할 수 있으니, 새 클러스터(CI 첫 단계)에서 돌린다.
set -euo pipefail
ADMIN_URL="${ADMIN_URL:-postgres://postgres@127.0.0.1:54322}"
DB=migcheck_nonsuper
ROLE=migcheck_owner
psql "$ADMIN_URL/postgres" -v ON_ERROR_STOP=1 -q <<SQL
drop database if exists $DB;
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = '$ROLE') then
    create role $ROLE login nosuperuser createrole nobypassrls;
  end if;
end \$\$;
create database $DB owner $ROLE;
SQL
psql "$ADMIN_URL/$DB" -v ON_ERROR_STOP=1 -q -c "create extension if not exists pgcrypto" -c "create extension if not exists btree_gist"
host_part="${ADMIN_URL#postgres://}"; host_part="${host_part#*@}"
DATABASE_URL="postgres://$ROLE@$host_part/$DB" node scripts/migrate.mjs
echo "슈퍼유저 아닌 역할로 마이그레이션 적용 점검 통과"
