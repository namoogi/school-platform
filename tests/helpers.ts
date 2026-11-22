import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres';
export const TEST_DB = 'school_platform_test';
export const TEST_URL = process.env.TEST_DATABASE_URL ?? ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`);

/** 테스트 전용 DB를 만들고 마이그레이션·시드를 새로 적용한다. (로컬 전용) */
export async function resetTestDb() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [TEST_DB]);
  if (!rowCount) await admin.query(`create database ${TEST_DB}`);
  await admin.end();
  const env = { ...process.env, DATABASE_URL: TEST_URL };
  execFileSync('node', ['scripts/migrate.mjs', '--reset'], { env, stdio: 'pipe' });
  execFileSync('node', ['scripts/seed.mjs'], { env, stdio: 'pipe' });
}

export async function lookupIds() {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  const { rows } = await c.query(
    `select s.slug, s.id as school_id, u.id as user_id from public.schools s
     join public.memberships m on m.school_id = s.id join private.app_users u on u.id = m.user_id`);
  await c.end();
  const by = Object.fromEntries(rows.map((r) => [r.slug, r]));
  return {
    A: { schoolId: by['school-a'].school_id as string, userId: by['school-a'].user_id as string },
    B: { schoolId: by['school-b'].school_id as string, userId: by['school-b'].user_id as string },
  };
}

const FIXTURES = path.join(import.meta.dirname, '..', 'school-platform-handoff', 'fixtures');
export function fixture(name: string) {
  return { name, type: 'text/csv', bytes: fs.readFileSync(path.join(FIXTURES, name)) };
}
export function csv(name: string, text: string) {
  return { name, type: 'text/csv', bytes: Buffer.from(text, 'utf8') };
}
