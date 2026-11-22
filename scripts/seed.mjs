// 예시 학교 두 곳, 학교별 관리자, 1판 양식을 만든다. 여러 번 실행해도 같은 결과가 된다.
// 실제 학생·교직원 정보는 넣지 않는다.
import crypto from 'node:crypto';
import pg from 'pg';

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

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
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
    console.log(`${s.name}: ${s.email}`);
  }
  await client.query('commit');
  console.log('예시 데이터 준비 완료');
} catch (e) {
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
