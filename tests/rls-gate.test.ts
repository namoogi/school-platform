/**
 * 80차 — RLS 문(門): 정책 없는 표·'모두 허용' 정책·학교 칸 없는 새 표가 생기면 CI가 실패해 운영 배포가 서지 않는다.
 * 운영 배포는 main CI 통과 뒤에만 일어나므로(79차) 이 시험이 곧 배포를 세우는 문이다.
 * 드리미포털 교류(2026-11-26): "규칙은 글로 두면 안 든다. 정책 없는 표가 생기면 배포를 세우는 문을 처음부터 두라."
 * 그리고 "통과는 깨끗해서일 수도, 검사가 못 봐서일 수도 있다 — 세운 날 일부러 깨 보라" → 아래 '문이 실제로 막는다'가 네 가지를 깨 본다.
 * 표를 더하다 여기서 걸리면: 학교 소속 표는 school_id + RLS(app.is_member 등)로 만든다(AGENTS.md 데이터 경계 1).
 * 학교 소속이 아닌 관제·플랫폼 표만 아래 목록에 이유와 함께 더한다(검토 대상).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { resetTestDb, TEST_URL } from './helpers';

let su: pg.Client;
beforeAll(async () => {
  await resetTestDb();
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
}, 60_000);
afterAll(async () => { await su.end(); });

/** school_id 가 없어도 되는 public 표(관제·플랫폼 영역). 더할 때는 이유를 적는다 */
const NO_SCHOOL_ID: Record<string, string> = {
  baselines: '관제 기본판(ADR 0027) — 전체 관리자만 읽음',
  languages: '언어 목록(ADR 0037) — 비밀 아님, 누구나 읽음, 전체 관리자만 명령 함수로 씀',
  module_catalog: '기능 목록(이름·가격) — 비밀 아님, 누구나 읽음',
  platform_item_history: '관제 연구소 이력 — 전체 관리자',
  platform_items: '관제 연구소·결정 요청 — 전체 관리자',
  schools: '학교 자체 — 소속·전체 관리자만',
  ui_messages: '화면 문구 번역 사전(ADR 0037) — 비밀 아님, 누구나 읽음(로그인 화면 포함), 전체 관리자만 명령 함수로 씀',
  user_preferences: '사용자 본인 화면 설정 — 본인 행만',
};
/** USING/WITH CHECK 가 그냥 true 여도 되는 정책(사람이 쓰는 역할 대상). 더할 때는 이유를 적는다 */
const TRUE_POLICY_OK: Record<string, string> = {
  'module_catalog.module_catalog_read': '기능 목록은 공개 정보',
  'languages.languages_read': '언어 목록은 공개 정보(ADR 0037)',
  'ui_messages.ui_messages_read': '화면 문구는 공개 정보(ADR 0037)',
};
/** 앱 내부 소유 역할(사용자 요청이 직접 쓰지 않음). 이 역할에만 열린 true 정책은 허용 */
const INTERNAL_ROLES = new Set(['app_writer', 'agent_writer', 'control_writer']);

// ── 문(검사) 네 개: 각각 위반 목록을 돌려준다. 빈 목록이면 통과 ──
async function rlsOff(db: pg.Client) {
  const { rows } = await db.query(
    `select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname in ('public', 'agent', 'control', 'app') and not c.relrowsecurity order by 1`);
  return rows.map((r) => r.t as string);
}
async function schoolTablesWithoutPolicy(db: pg.Client) {
  const { rows } = await db.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname = 'public'
        and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'school_id')
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) order by 1`);
  return rows.map((r) => r.t as string);
}
async function openPolicies(db: pg.Client) {
  const { rows } = await db.query(
    `select tablename || '.' || policyname as p, roles::text[] as roles from pg_policies
      where schemaname = 'public' and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')`);
  return rows.filter((r) => !TRUE_POLICY_OK[r.p] && !(r.roles as string[]).every((x) => INTERNAL_ROLES.has(x)))
    .map((r) => `${r.p} → ${(r.roles as string[]).join(',')}`);
}
async function unlistedNoSchoolTables(db: pg.Client) {
  const { rows } = await db.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname = 'public'
        and not exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'school_id') order by 1`);
  return rows.map((r) => r.t as string).filter((t) => !NO_SCHOOL_ID[t]);
}
async function privateGrants(db: pg.Client) {
  const { rows } = await db.query(
    `select table_schema || '.' || table_name || ' ' || grantee || ' ' || privilege_type as g from information_schema.role_table_grants
      where table_schema in ('private', '_migrations') and grantee in ('authenticated', 'anon', 'PUBLIC', 'agent_request') order by 1`);
  return rows.map((r) => r.g as string);
}

describe('RLS 문', () => {
  it('public·agent·control·app 스키마의 모든 표에 RLS가 켜져 있다', async () => {
    expect(await rlsOff(su), 'RLS가 꺼진 표').toEqual([]);
  });
  it('school_id 가 있는 표는 정책이 있다', async () => {
    expect(await schoolTablesWithoutPolicy(su), '정책 없는 학교 표').toEqual([]);
  });
  it('사람 역할에 그냥 true 로 열린 정책이 없다', async () => {
    expect(await openPolicies(su), '사람 역할에 모두 허용으로 열린 정책').toEqual([]);
  });
  it('school_id 가 없는 public 표는 목록에 있는 관제·플랫폼 표뿐이다', async () => {
    expect(await unlistedNoSchoolTables(su), '학교 칸 없는 새 표(목록에 이유와 함께 더하거나 school_id 를 두세요)').toEqual([]);
  });
  it('비공개 스키마(private·_migrations)는 사람·에이전트 역할에 권한이 없다', async () => {
    expect(await privateGrants(su), '비공개 스키마에 열린 권한').toEqual([]);
  });

  // 세운 날 깨 보기: 위반을 하나씩 만들고(트랜잭션 안, 끝나면 되돌림) 해당 문이 그것을 잡는지 본다.
  // 하나라도 안 잡으면 위의 '통과'는 검사가 못 봐서일 수 있다.
  describe('문이 실제로 막는다(일부러 깨 보기)', () => {
    async function probe(setup: string[], gate: (db: pg.Client) => Promise<string[]>) {
      await su.query('begin');
      try {
        for (const sql of setup) await su.query(sql);
        return await gate(su);
      } finally { await su.query('rollback'); }
    }
    it('RLS를 끈 표 → 잡는다', async () => {
      expect(await probe(['create table public.gate_probe (id int primary key, school_id uuid)'], rlsOff)).toContain('public.gate_probe');
    });
    it('RLS는 켰지만 정책 없는 school_id 표 → 잡는다', async () => {
      expect(await probe(['create table public.gate_probe (id int primary key, school_id uuid)', 'alter table public.gate_probe enable row level security'],
        schoolTablesWithoutPolicy)).toContain('gate_probe');
    });
    it('사람 역할에 using (true) 정책 → 잡는다', async () => {
      const found = await probe(['create table public.gate_probe (id int primary key, school_id uuid)', 'alter table public.gate_probe enable row level security',
        'create policy gate_probe_open on public.gate_probe for select to authenticated using (true)'], openPolicies);
      expect(found.some((x) => x.startsWith('gate_probe.gate_probe_open'))).toBe(true);
    });
    it('목록에 없는 school_id 없는 public 표 → 잡는다', async () => {
      expect(await probe(['create table public.gate_probe (id int primary key)', 'alter table public.gate_probe enable row level security'],
        unlistedNoSchoolTables)).toContain('gate_probe');
    });
    it('비공개 스키마에 사람 역할 권한 → 잡는다', async () => {
      const found = await probe(['create table private.gate_probe (id int primary key)', 'grant select on private.gate_probe to authenticated'], privateGrants);
      expect(found.some((x) => x.startsWith('private.gate_probe authenticated'))).toBe(true);
    });
  });
});
