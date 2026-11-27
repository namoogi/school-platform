/**
 * ADR 0035 — 이전 가능성 문(門). 공용 DB에서 쓰던 학교를 언제든 전용·독립 DB로 옮길 수 있게 지킨다.
 * 1) 연습 이전(드라이런): 예시학교 A를 꺼내 같은 마이그레이션만 적용한 빈 DB에 넣고, 표마다 행 수·내용 지문이 같은지,
 *    가리키는 행이 없는 연결(고아)이 없는지, B학교 행이 따라오지 않았는지 본다. 새 표가 생겨도 이 시험이 계속 돈다.
 * 2) 구조 문: 새 학교 표는 UUID 번호, 학교 표끼리의 연결에는 school_id 를 함께 묶는다(복합 외래키).
 *    지금 있는 예외는 아래 목록에 이유와 함께 두고 줄이기만 한다. 목록에 없는 새 예외가 생기면 CI가 실패한다.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ADMIN_URL, lookupIds, resetTestDb, TEST_URL } from './helpers';
import { compareSchool, exportSchool, importSchool, orphanForeignKeys, schoolTables } from '../scripts/school-move.mjs';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const g = await import('@/lib/grading');

const MOVE_DB = 'school_platform_move';
const MOVE_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${MOVE_DB}`);

/** 순번(bigint·text) 번호를 쓰는 학교 표. 빈 DB로 옮길 때는 괜찮지만 여러 학교가 있는 DB(셀)로 합치면 번호가 겹칠 수 있다. 줄이기만 한다 */
const NON_UUID_PK: Record<string, string> = {
  source_rows: '원본 행 — 추가 전용 대량 행, 셀 합치기 전 UUID 전환 후보',
  access_log: '접근 기록(로그)',
  site_publications: '홈페이지 공개 기록(로그)',
  person_account_events: '계정 연결 사건(로그)',
  agent_token_uses: '작업 토큰 사용 기록(로그)',
  control_sessions: '관제 세션 id(문자열, 세션 이름 그대로)',
  control_messages: '관제 대화 메시지(로그)',
  usage_events: '사용량 기록(로그)',
  school_reports: '보고 스냅샷(관제가 모음)',
};
/** 학교 표끼리 연결하면서 school_id 를 함께 묶지 않은 것. 다른 학교 행을 가리킬 수 없게 트리거·명령 함수가 막는지 확인 뒤 복합 외래키로 바꾼다. 줄이기만 한다 */
const FK_WITHOUT_SCHOOL: Record<string, string> = {
  'assessment_results->assessment_results': '정정 사슬(이전 결과) — 명령 함수가 같은 학교만 허용',
  'attendance_events->attendance_events': '정정 사슬(이전 사건)',
  'billing_statements->school_licenses': '청구 기록 → 라이선스(관제가 씀)',
  'code_lists->code_lists': '코드 목록 판 사슬',
  'control_messages->control_requests': '관제 대화(관제 영역)',
  'control_messages->control_sessions': '관제 대화(관제 영역)',
  'control_requests->control_sessions': '관제 요청(관제 영역)',
  'evidence_items->evidence_items': '증거물 정정 사슬',
  'narratives->narratives': '서술 정정 사슬',
  'site_entries->agent_tokens': '홈페이지 항목 → 만든 작업 토큰',
};

let su: pg.Client;
let dst: pg.Client;
let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };

async function nonUuidPk(db: pg.Client) {
  const { rows } = await db.query(
    `select c.relname as t from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
      where k.contype = 'p' and n.nspname = 'public' and array_length(k.conkey, 1) = 1 and format_type(a.atttypid, a.atttypmod) <> 'uuid'
        and exists (select 1 from pg_attribute s where s.attrelid = c.oid and s.attname = 'school_id' and not s.attisdropped) order by 1`);
  return rows.map((r) => r.t as string).filter((t) => !NON_UUID_PK[t]);
}
async function fkWithoutSchool(db: pg.Client) {
  const { rows } = await db.query(
    `select distinct c.relname || '->' || r.relname as f from pg_constraint k
       join pg_class c on c.oid = k.conrelid join pg_class r on r.oid = k.confrelid join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = 'public' and r.relname <> 'schools'
        and exists (select 1 from pg_attribute s where s.attrelid = c.oid and s.attname = 'school_id' and not s.attisdropped)
        and exists (select 1 from pg_attribute s where s.attrelid = r.oid and s.attname = 'school_id' and not s.attisdropped)
        and not exists (select 1 from unnest(k.conkey) x join pg_attribute a on a.attrelid = c.oid and a.attnum = x where a.attname = 'school_id')
      order by 1`);
  return rows.map((r) => r.f as string).filter((f) => !FK_WITHOUT_SCHOOL[f]);
}

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  // 합성 학사 자료: 사람·학년도·학기·과목·개설·수강·마감 판까지(옮길 표를 넓게 채운다)
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, '{"periods":[{"id":"s1","label":"1학기","assessments":[]}]}', 'accepted', '[]', $2) returning id`,
    [A.schoolId, A.userId]);
  const off = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'high', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
    const term = (await pp.listTerms(db, A.schoolId, y))[0].id;
    const type = await cs.addCourseType(db, A.schoolId, { code: 'project', name: '프로젝트' });
    await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: true });
    const subj = await cs.addSubject(db, A.schoolId, { code: 'FARM', name: '농사' });
    const o = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: subj, typeId: type, levelId: level, credits: 2 });
    for (let i = 1; i <= 3; i++) await pp.addPerson(db, A.schoolId, { name: `이전 시험 학생 ${i}` });
    return o;
  });
  const { rows: [scale] } = await su.query(`select id from public.scales where school_id = $1 and code = 'kr_achievement'`, [A.schoolId]);
  await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, off, { base_version: 0, requestKey: 'move-close-aaaa', scaleId: scale.id }));

  // 대상: 같은 마이그레이션만 적용한 빈 DB(시드 없음)
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [MOVE_DB]);
  if (!rowCount) await admin.query(`create database ${MOVE_DB}`);
  await admin.end();
  execFileSync('node', ['scripts/migrate.mjs', '--reset'], { env: { ...process.env, DATABASE_URL: MOVE_URL }, stdio: 'pipe' });
  dst = new pg.Client({ connectionString: MOVE_URL });
  await dst.connect();
}, 120_000);
afterAll(async () => { await su?.end(); await dst?.end(); await getPool().end(); });

describe('연습 이전: 공용 DB의 학교 A → 빈 DB', () => {
  it('꺼내서 넣으면 모든 학교 표의 행 수·내용 지문이 같고, 고아 연결이 없고, B는 따라오지 않는다', async () => {
    const bundle = await exportSchool(su, 'school-a');
    expect(bundle.school_id).toBe(A.schoolId);
    expect(Object.keys(bundle.tables).length).toBeGreaterThan(10);
    expect(JSON.stringify(bundle)).not.toContain(B.schoolId);
    await importSchool(dst, JSON.parse(JSON.stringify(bundle)));
    expect(await compareSchool(su, dst, A.schoolId)).toEqual([]);
    expect(await orphanForeignKeys(dst)).toEqual([]);
    for (const t of await schoolTables(dst)) {
      const { rows: [{ n }] } = await dst.query(`select count(*)::int as n from public."${t}" where school_id <> $1`, [A.schoolId]);
      expect(n, t).toBe(0);
    }
  }, 120_000);

  it('옮긴 DB에서도 A 관리자는 자기 학교 기록을 읽고(RLS 그대로), 마감 판은 고칠 수 없다', async () => {
    await dst.query('begin');
    try {
      await dst.query('set local role authenticated');
      await dst.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: A.userId, role: 'authenticated' })]);
      const { rows } = await dst.query('select count(*)::int as n from public.offering_closures');
      expect(rows[0].n).toBe(1);
    } finally { await dst.query('rollback'); }
    await expect(dst.query('update public.offering_closures set reason = $1', ['몰래 고침'])).rejects.toThrow();
  });

  it('같은 학교를 두 번 넣지 않는다', async () => {
    const bundle = await exportSchool(su, A.schoolId);
    await expect(importSchool(dst, bundle)).rejects.toThrow(/이미 그 학교/);
  });
});

describe('이전 가능성 문: 구조 규칙', () => {
  it('새 학교 표는 UUID 번호를 쓴다(목록 밖 예외 없음)', async () => {
    expect(await nonUuidPk(su)).toEqual([]);
  });
  it('학교 표끼리의 연결은 school_id 를 함께 묶는다(목록 밖 예외 없음)', async () => {
    expect(await fkWithoutSchool(su)).toEqual([]);
  });
  it('문이 실제로 막는다: 순번 번호 표·학교 칸 없는 연결을 일부러 만들면 잡힌다', async () => {
    await su.query('begin');
    try {
      await su.query(`create table public.zz_move_probe (id bigserial primary key, school_id uuid not null references public.schools(id),
                        offering_id uuid references public.course_offerings(id))`);
      expect(await nonUuidPk(su)).toEqual(['zz_move_probe']);
      expect(await fkWithoutSchool(su)).toEqual(['zz_move_probe->course_offerings']);
    } finally { await su.query('rollback'); }
  });
});
