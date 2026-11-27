import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { setPackageState } from '@/lib/packages';

/** 61차 F5: 학사 꾸러미 켜기·끄기(학교 관리자). body: { code, state: enabled|disabled, version?, reason? } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    const state = b?.state === 'enabled' ? 'enabled' : b?.state === 'disabled' ? 'disabled' : null;
    if (!state || typeof b?.code !== 'string') throw new ValidationError('err.pkg.codeState');
    const version = Number.isInteger(b.version) ? b.version : undefined;
    return setPackageState(db, school.id, { code: b.code, state, version, reason: typeof b.reason === 'string' ? b.reason.slice(0, 500) : undefined });
  }, { module: 'records', admin: true });
}
