import { handle } from '@/lib/api';
import { licenseInfo, setLicense } from '@/lib/admin';
import { ValidationError } from '@/lib/services';

export async function GET(req: Request) {
  return handle(req, ({ db, school }) => licenseInfo(db, school.id), { admin: true });
}

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return setLicense(db, school.id, body ?? {});
  }, { admin: true });
}
