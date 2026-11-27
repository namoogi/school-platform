import pg from 'pg';
import { pgOptions } from '../../scripts/pg-options.mjs';

// 앱 전체에서 하나의 커넥션 풀을 쓴다. (Next 개발 서버의 핫리로드에서도 재사용)
const globalForPool = globalThis as unknown as { __schoolPlatformPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPool.__schoolPlatformPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL 이 설정되지 않았습니다.');
    globalForPool.__schoolPlatformPool = new pg.Pool({ ...pgOptions(connectionString), max: 5 });
  }
  return globalForPool.__schoolPlatformPool;
}

export type Db = pg.PoolClient;

/**
 * 로그인한 사용자 권한으로 트랜잭션을 실행한다.
 * authenticated 역할과 JWT 클레임을 설정하므로 모든 쿼리에 RLS가 적용된다.
 * (Supabase PostgREST가 요청마다 하는 일과 같다.)
 */
/** 관제 세션 계정 (마이그레이션 20261123000300). 점검 토큰으로만 들어오는 전체 관리자(ADR 0024) */
export const INSPECTOR_ID = '0c1a0de0-0000-4000-8000-000000000001';

export async function asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 27차: 공개 홈페이지 방문자(로그인 없음). anon 역할로 바꾸고 사용자 클레임은 비운다.
 * anon 은 표를 직접 읽지 못하고 app.public_* 함수(지금 공개된 판만 반환)만 실행할 수 있다.
 */
/**
 * 91차(ADR 0036): 방문자 쓰기 — anon 역할, 쓰기 가능한 트랜잭션. 방문자가 직접 표에 쓸 권한은 없으므로
 * 이 안에서는 검사하는 공개 제출 함수(app.submit_site_inquiry)만 부른다.
 */
export async function asVisitor<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    await client.query("select set_config('request.jwt.claims', '{}', true)");
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function asPublic<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin read only');
    await client.query('set local role anon');
    await client.query("select set_config('request.jwt.claims', '{}', true)");
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 34차: 외부 작업 토큰 요청 (ADR 0012). 표 권한이 없는 agent_request 역할로 바꾸고 사용자 클레임은 비운다.
 * 이 역할은 agent 스키마의 명령 함수만 부를 수 있고, 함수가 토큰(해시)을 확인해 학교·동화 범위를 정한다.
 * 로그인 쿠키·asSystem 은 쓰지 않는다.
 */
/** 83차: ctx(세션 이름·작업자)는 에이전트가 스스로 알린 값. 트랜잭션 안에서만 쓰이고 토큰 사용 기록에 붙는다 */
export async function asAgent<T>(fn: (db: Db) => Promise<T>, ctx: { session?: string | null; operator?: string | null } = {}): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role agent_request');
    await client.query("select set_config('request.jwt.claims', '{}', true)");
    await client.query("select set_config('app.agent_session', $1, true), set_config('app.agent_operator', $2, true)", [ctx.session ?? '', ctx.operator ?? '']);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** 로그인 확인처럼 사용자 맥락이 생기기 전 단계에서만 쓴다. */
export async function asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
