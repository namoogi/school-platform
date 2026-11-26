/**
 * 80차 — RLS 문(門): 정책 없는 표·'모두 허용' 정책·학교 칸 없는 새 표가 생기면 CI가 실패해 운영 배포가 서지 않는다.
 * 운영 배포는 main CI 통과 뒤에만 일어나므로(79차) 이 시험이 곧 배포를 세우는 문이다.
 * 드리미포털 교류(2026-11-26): "규칙은 글로 두면 안 든다. 정책 없는 표가 생기면 배포를 세우는 문을 처음부터 두라."
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
});
afterAll(async () => { await su.end(); });

/** school_id 가 없어도 되는 public 표(관제·플랫폼 영역). 더할 때는 이유를 적는다 */
const NO_SCHOOL_ID: Record<string, string> = {
  baselines: '관제 기본판(ADR 0027) — 전체 관리자만 읽음',
  module_catalog: '기능 목록(이름·가격) — 비밀 아님, 누구나 읽음',
  platform_item_history: '관제 연구소 이력 — 전체 관리자',
  platform_items: '관제 연구소·결정 요청 — 전체 관리자',
  schools: '학교 자체 — 소속·전체 관리자만',
  user_preferences: '사용자 본인 화면 설정 — 본인 행만',
};
/** USING/WITH CHECK 가 그냥 true 여도 되는 정책(사람이 쓰는 역할 대상). 더할 때는 이유를 적는다 */
const TRUE_POLICY_OK: Record<string, string> = {
  'module_catalog.module_catalog_read': '기능 목록은 공개 정보',
};
/** 앱 내부 소유 역할(사용자 요청이 직접 쓰지 않음). 이 역할에만 열린 true 정책은 허용 */
const INTERNAL_ROLES = new Set(['app_writer', 'agent_writer', 'control_writer']);

describe('RLS 문', () => {
  it('public·agent·control·app 스키마의 모든 표에 RLS가 켜져 있다', async () => {
    const { rows } = await su.query(
      `select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname in ('public', 'agent', 'control', 'app') and not c.relrowsecurity order by 1`);
    expect(rows.map((r) => r.t), 'RLS가 꺼진 표').toEqual([]);
  });

  it('school_id 가 있는 표는 정책이 있고, 사람 역할에 그냥 true 로 열린 정책이 없다', async () => {
    const { rows: noPolicy } = await su.query(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname = 'public'
          and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'school_id')
          and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) order by 1`);
    expect(noPolicy.map((r) => r.t), '정책 없는 학교 표').toEqual([]);
    const { rows: open } = await su.query(
      `select tablename || '.' || policyname as p, roles::text[] as roles from pg_policies
        where schemaname = 'public' and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')`);
    const bad = open.filter((r) => !TRUE_POLICY_OK[r.p] && !(r.roles as string[]).every((x) => INTERNAL_ROLES.has(x)));
    expect(bad.map((r) => `${r.p} → ${(r.roles as string[]).join(',')}`), '사람 역할에 모두 허용으로 열린 정책').toEqual([]);
  });

  it('school_id 가 없는 public 표는 목록에 있는 관제·플랫폼 표뿐이다', async () => {
    const { rows } = await su.query(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname = 'public'
          and not exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'school_id') order by 1`);
    expect(rows.map((r) => r.t).filter((t) => !NO_SCHOOL_ID[t]), '학교 칸 없는 새 표(목록에 이유와 함께 더하거나 school_id 를 두세요)').toEqual([]);
  });

  it('비공개 스키마(private·_migrations)는 사람·에이전트 역할에 권한이 없다', async () => {
    const { rows } = await su.query(
      `select table_schema || '.' || table_name || ' ' || grantee || ' ' || privilege_type as g from information_schema.role_table_grants
        where table_schema in ('private', '_migrations') and grantee in ('authenticated', 'anon', 'PUBLIC', 'agent_request') order by 1`);
    expect(rows.map((r) => r.g), '비공개 스키마에 열린 권한').toEqual([]);
  });

  it('문이 실제로 막는다: 정책 없는 학교 표를 만들면 걸린다', async () => {
    await su.query('begin');
    try {
      await su.query(`create table public.gate_probe (id int primary key, school_id uuid)`);
      const { rows } = await su.query(
        `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = 'gate_probe') as pols
           from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'gate_probe'`);
      expect(rows[0]).toEqual({ rls: false, pols: 0 }); // 위 첫 두 시험이 이 상태를 실패로 잡는다
    } finally { await su.query('rollback'); }
  });
});
