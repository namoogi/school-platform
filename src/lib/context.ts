import { cookies } from 'next/headers';

/** 전체 관리자(또는 여러 학교 소속)가 고른 작업 학교. 값은 RLS로 다시 검증한다. */
export const SCHOOL_COOKIE = 'sp_school';

export async function preferredSchoolId(): Promise<string | null> {
  return (await cookies()).get(SCHOOL_COOKIE)?.value ?? null;
}
