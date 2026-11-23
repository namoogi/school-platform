import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 요청 목록(기본: 끝남·접음 빼고) · ?status=done 처럼 고를 수 있다 */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status');
  return handleControl(req, (db, t) => control.requests(db, t, status));
}

/** 결정 요청 올리기: {title, detail, options:[{key,label,detail}], recommended, reversible, related, source_session} */
export async function POST(req: Request) {
  return handleControl(req, (db, t, body) => control.file(db, t, body));
}
