import { asUser, type Db } from './db';
import { requireUser } from './auth';
import { currentSchool, type School } from './services';

/** 서버 페이지용: 로그인 확인 후 RLS가 걸린 트랜잭션에서 데이터를 읽는다. */
export async function loadForPage<T>(fn: (ctx: { db: Db; school: School; userId: string }) => Promise<T>) {
  const userId = await requireUser();
  return asUser(userId, async (db) => {
    const school = await currentSchool(db);
    return { school, ...(await fn({ db, school, userId })) };
  });
}
