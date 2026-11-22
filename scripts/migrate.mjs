// 마이그레이션 적용기. supabase/migrations/*.sql 을 이름순으로 한 번씩 적용한다.
// 사용: DATABASE_URL=... node scripts/migrate.mjs [--reset]
// --reset 은 로컬 DB(localhost/127.0.0.1)에서만 허용한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 필요합니다. .env.example 을 참고하세요.');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
const host = new URL(url).hostname;
if (reset && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`--reset 은 로컬 DB에서만 실행합니다. (대상: ${host})`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (reset) {
    // 로컬 개발 DB의 스키마만 비운다. (파일 삭제 없음)
    await client.query(`
      drop schema if exists _migrations cascade;
      drop schema if exists app cascade;
      drop schema if exists private cascade;
      drop schema if exists public cascade;
      create schema public;
      grant usage on schema public to public;
    `);
    console.log('로컬 DB 초기화');
  }
  await client.query(`create schema if not exists _migrations;
    create table if not exists _migrations.applied (name text primary key, applied_at timestamptz not null default now());`);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await client.query('select name from _migrations.applied');
  const done = new Set(rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into _migrations.applied(name) values ($1)', [f]);
      await client.query('commit');
      console.log('적용:', f);
    } catch (e) {
      await client.query('rollback');
      throw new Error(`${f}: ${e.message}`);
    }
  }
  console.log('마이그레이션 완료');
} finally {
  await client.end();
}
