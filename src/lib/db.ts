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

/** 로그인 확인처럼 사용자 맥락이 생기기 전 단계에서만 쓴다. */
export async function asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
