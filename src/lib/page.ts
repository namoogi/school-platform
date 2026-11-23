import { notFound, redirect } from 'next/navigation';
import { asUser, type Db } from './db';
import { requireUser } from './auth';
import { preferredSchoolId } from './context';
import { currentSchool, hasModule, me, NoSchoolError, type Me, type ModuleKey, type School } from './services';

type Opts = { module?: ModuleKey; admin?: boolean };

/** 서버 페이지용: 로그인 확인 → 작업 학교 → 기능·권한 확인 → RLS가 걸린 트랜잭션에서 읽기 */
export async function loadForPage<T>(fn: (ctx: { db: Db; school: School; userId: string }) => Promise<T>, opts: Opts = {}) {
  const userId = await requireUser();
  const preferred = await preferredSchoolId();
  try {
    return await asUser(userId, async (db) => {
      const school = await currentSchool(db, preferred);
      if (opts.module && !hasModule(school, opts.module)) redirect(`/locked?module=${opts.module}`);
      if (opts.admin && !school.isAdmin) redirect('/locked?reason=admin');
      return { school, ...(await fn({ db, school, userId })) };
    });
  } catch (e) {
    if (e instanceof NoSchoolError) redirect('/admin');
    throw e;
  }
}

/** 전체 관리자 페이지용 (작업 학교 없이) */
export async function loadForPlatform<T>(fn: (ctx: { db: Db; account: Me; userId: string }) => Promise<T>) {
  const userId = await requireUser();
  return asUser(userId, async (db) => {
    const account = await me(db);
    if (!account.is_platform_admin) notFound();
    return { account, ...(await fn({ db, account, userId })) };
  });
}
