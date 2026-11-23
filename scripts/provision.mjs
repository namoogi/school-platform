// 29차: 실제 학교 준비 (운영 배포 전용, 한 번만). ops/schools.json 의 학교가 없으면 만든다. 있으면 아무것도 바꾸지 않는다.
// 학교 생성은 전체 관리자 권한으로 app.create_school 을 부른다(직접 표를 만지지 않음 → 라이선스 판·운영 기록이 평소처럼 남는다).
// 첫 학교 관리자는 PLATFORM_ADMIN_EMAILS 의 첫 계정(이메일은 저장소에 두지 않는다).
import fs from 'node:fs';
import pg from 'pg';
import { pgOptions } from './pg-options.mjs';

export async function provision(client, list, adminEmail, log = console.log) {
  const { rows: [admin] } = await client.query('select id from private.app_users where lower(email) = lower($1) and is_platform_admin', [adminEmail]);
  if (!admin) { log('[provision] 전체 관리자 계정을 찾지 못해 건너뜁니다.'); return []; }
  const made = [];
  for (const s of list) {
    const { rowCount } = await client.query('select 1 from public.schools where slug = $1', [s.slug]);
    if (rowCount) { log(`[provision] ${s.slug}: 이미 있음 — 바꾸지 않음`); continue; }
    await client.query('savepoint p');
    try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin.id, role: 'authenticated' })]);
    const { rows: [{ id }] } = await client.query('select app.create_school($1,$2,$3,$4,$5,$6) as id',
      [s.slug, s.name, s.locale, adminEmail, s.seats ?? 5, s.modules ?? []]);
    if (s.site) {
      await client.query(
        `insert into public.site_settings(school_id, public_slug, default_lang, langs, theme, site_title, is_open) values ($1,$2,$3,$4,$5,$6,$7)`,
        [id, s.site.public_slug, s.site.default_lang, s.site.langs, s.site.theme ?? 'campus', JSON.stringify(s.site.title ?? {}), !!s.site.is_open]);
    }
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claims', '', true)");
    await client.query('release savepoint p');
    log(`[provision] ${s.slug}: 학교를 만들었습니다 (시범 상태, 홈페이지 ${s.site?.is_open ? '열림' : '닫힘'})`);
    made.push(id);
    } catch (e) {
      // 학교 준비가 실패해도 배포는 막지 않는다(앱 동작과 무관). 원인만 남긴다.
      await client.query('rollback to savepoint p');
      await client.query('reset role').catch(() => {});
      log(`[provision] ${s.slug}: 만들지 못했습니다 — ${e.message}`);
    }
  }
  return made;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  const adminEmail = String(process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)[0];
  if (!url || !adminEmail) { console.log('[provision] DATABASE_URL 또는 PLATFORM_ADMIN_EMAILS 가 없어 건너뜁니다.'); process.exit(0); }
  const { schools } = JSON.parse(fs.readFileSync(new URL('../ops/schools.json', import.meta.url), 'utf8'));
  const client = new pg.Client(pgOptions(url));
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('school-platform:provision'))");
    await provision(client, schools, adminEmail);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    console.error('[provision] 실패:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
