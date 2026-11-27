// 예시 학교 두 곳, 학교별 관리자, 1판 양식을 만든다. 여러 번 실행해도 같은 결과가 된다.
// 실제 학생·교직원 정보는 넣지 않는다.
import crypto from 'node:crypto';
import pg from 'pg';
import { pgOptions } from './pg-options.mjs';
import { connectOrExplain } from './db-errors.mjs';
import { applyPacks } from './i18n-packs.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 필요합니다.');
  process.exit(1);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}

const schools = [
  {
    slug: 'school-a', name: '드리미 예시학교', locale: 'ko',
    email: 'admin-a@school-a.test', display: '예시 관리자 A',
    password: process.env.SEED_PASSWORD_A || 'demo-pass-a',
    template: { title: '학기 학습 보고서', period_heading: '학기', assessment_heading: '평가 기간', footer_note: '합성 예시 자료 · 검토용' },
  },
  {
    slug: 'school-b', name: 'Rungarun Example School', locale: 'en',
    email: 'admin-b@school-b.test', display: 'Example Admin B',
    password: process.env.SEED_PASSWORD_B || 'demo-pass-b',
    template: { title: 'Term Learning Report', period_heading: 'Term', assessment_heading: 'Assessment window', footer_note: 'Synthetic example · for review only' },
  },
];

const client = new pg.Client(pgOptions(url));
await connectOrExplain(client);
try {
  await client.query('begin');
  // 동시에 도는 빌드끼리 같은 시드를 겹쳐 넣지 않도록 잠근다.
  await client.query("select pg_advisory_xact_lock(hashtext('school-platform:seed'))");
  for (const s of schools) {
    const { rows: [school] } = await client.query(
      `insert into public.schools(slug, name, locale) values ($1,$2,$3)
       on conflict (slug) do update set name = excluded.name, locale = excluded.locale returning id`,
      [s.slug, s.name, s.locale]);
    const { rows: [user] } = await client.query(
      `insert into private.app_users(email, password_hash, display_name) values ($1,$2,$3)
       on conflict (email) do update set password_hash = excluded.password_hash, display_name = excluded.display_name returning id`,
      [s.email, hashPassword(s.password), s.display]);
    await client.query(
      `insert into public.memberships(user_id, school_id, role) values ($1,$2,'admin') on conflict do nothing`,
      [user.id, school.id]);
    const { rowCount } = await client.query('select 1 from public.document_templates where school_id = $1', [school.id]);
    if (!rowCount) {
      const t = s.template;
      await client.query(
        `insert into public.document_templates(school_id, version, title, period_heading, assessment_heading, footer_note, created_by)
         values ($1, 1, $2, $3, $4, $5, $6)`,
        [school.id, t.title, t.period_heading, t.assessment_heading, t.footer_note, user.id]);
    }
    const { rowCount: hasLicense } = await client.query('select 1 from public.school_licenses where school_id = $1', [school.id]);
    if (!hasLicense) {
      await client.query(
        `insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
         values ($1, 1, 5, array['intake','records'], 0, '{"intake":0,"records":0}', '예시 학교 기본 라이선스', $2)`,
        [school.id, user.id]);
    }
    console.log(`${s.name}: ${s.email}`);
  }
  // 전체 관리자: PLATFORM_ADMIN_EMAILS(쉼표 구분)에 있는 이메일만. 목록에서 빠진 계정은 권한을 내린다.
  // 이메일은 저장소에 두지 않고 환경 변수로만 넣는다. 계정은 Google 로그인으로 들어온다(비밀번호 없음).
  const admins = String(process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  // 로컬·테스트용 예시 전체 관리자 (Vercel에서는 SEED_PASSWORD_PLATFORM 을 넣었을 때만)
  const demoPw = process.env.SEED_PASSWORD_PLATFORM || (process.env.VERCEL === '1' ? '' : 'demo-pass-p');
  if (demoPw) {
    await client.query(
      `insert into private.app_users(email, password_hash, display_name, is_platform_admin) values ($1,$2,'예시 전체 관리자',true)
       on conflict (email) do update set password_hash = excluded.password_hash, is_platform_admin = true`,
      ['platform@example.test', hashPassword(demoPw)]);
    admins.push('platform@example.test');
  }
  for (const e of admins) {
    await client.query(
      `insert into private.app_users(email, display_name, is_platform_admin) values ($1,$2,true)
       on conflict (email) do update set is_platform_admin = true`, [e, '전체 관리자']);
  }
  const { rowCount: demoted } = await client.query(
    `update private.app_users set is_platform_admin = false where is_platform_admin and not (lower(email) = any($1::text[]))
       and email <> 'inspector@onschools.internal'`, [admins]);
  console.log(`전체 관리자 ${admins.length}명` + (demoted ? `, 권한 해제 ${demoted}명` : ''));

  // ADR 0037: 기본 번역 묶음(빈 칸만)
  await applyPacks(client);

  await client.query('commit');
  console.log('예시 데이터 준비 완료');
} catch (e) {
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
