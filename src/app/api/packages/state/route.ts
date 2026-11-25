import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { setPackageState } from '@/lib/packages';

/** 61차 F5: 학사 꾸러미 켜기·끄기(학교 관리자). body: { code, state: enabled|disabled, version?, reason? } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    const state = b?.state === 'enabled' ? 'enabled' : b?.state === 'disabled' ? 'disabled' : null;
    if (!state || typeof b?.code !== 'string') throw new ValidationError('꾸러미 코드와 상태가 필요합니다.');
    const version = Number.isInteger(b.version) ? b.version : undefined;
    return setPackageState(db, school.id, { code: b.code, state, version, reason: typeof b.reason === 'string' ? b.reason.slice(0, 500) : undefined });
  }, { module: 'records', admin: true });
}
