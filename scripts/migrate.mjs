// 마이그레이션 적용기. supabase/migrations/*.sql 을 이름순으로 한 번씩 적용한다.
// 사용: DATABASE_URL=... node scripts/migrate.mjs [--reset | --check]
// --reset 은 로컬 DB(localhost/127.0.0.1)에서만 허용한다.
// --check 는 아무것도 적용하지 않고 적용 대기 중인 파일만 알린다(Vercel 미리보기 빌드용).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseDbUrl, pgOptions } from './pg-options.mjs';
import { connectOrExplain } from './db-errors.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 필요합니다. .env.example 을 참고하세요.');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
const check = process.argv.includes('--check');
if (reset && check) {
  console.error('--reset 과 --check 는 함께 쓸 수 없습니다.');
  process.exit(1);
}
let host;
try { host = parseDbUrl(url).hostname; } catch (e) { console.error(e.message); process.exit(1); }
if (reset && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`--reset 은 로컬 DB에서만 실행합니다. (대상: ${host})`);
  process.exit(1);
}

const client = new pg.Client(pgOptions(url));
await connectOrExplain(client);
try {
  if (reset) {
    // 로컬 개발 DB의 스키마만 비운다. (파일 삭제 없음)
    await client.query(`
      drop schema if exists _migrations cascade;
      drop schema if exists app cascade;
      drop schema if exists private cascade;
      drop schema if exists agent cascade;
      drop schema if exists control cascade;
      drop schema if exists public cascade;
      create schema public;
      grant usage on schema public to public;
    `);
    console.log('로컬 DB 초기화');
  }
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (check) {
    // 읽기만 한다. _migrations 스키마도 만들지 않는다.
    const { rows: [{ t }] } = await client.query("select to_regclass('_migrations.applied') as t");
    const done = new Set(t ? (await client.query('select name from _migrations.applied')).rows.map((r) => r.name) : []);
    const pending = files.filter((f) => !done.has(f));
    if (pending.length) {
      console.log(`적용 대기 중인 마이그레이션 ${pending.length}개 (이 빌드에서는 적용하지 않음):`);
      for (const f of pending) console.log('  대기:', f);
    } else console.log('적용 대기 중인 마이그레이션 없음');
  } else {
  // Preview·Production 빌드가 동시에 돌 수 있으므로 파일마다 트랜잭션 잠금 안에서 적용 여부를 확인한다.
  // (Supabase transaction pooler에서는 세션 잠금이 안전하지 않아 xact 잠금을 쓴다)
  let applied = 0;
  for (const f of files) {
    await client.query('begin');
    try {
      await client.query("select pg_advisory_xact_lock(hashtext('school-platform:migrate'))");
      await client.query(`create schema if not exists _migrations;
        create table if not exists _migrations.applied (name text primary key, applied_at timestamptz not null default now());`);
      const { rowCount } = await client.query('select 1 from _migrations.applied where name = $1', [f]);
      if (rowCount) { await client.query('commit'); continue; }
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('insert into _migrations.applied(name) values ($1)', [f]);
      await client.query('commit');
      applied++;
      console.log('적용:', f);
    } catch (e) {
      await client.query('rollback');
      throw new Error(`${f}: ${e.message}`);
    }
  }
  if (!applied) console.log('새로 적용할 마이그레이션 없음');
  console.log('마이그레이션 완료');
  }
} finally {
  await client.end();
}
