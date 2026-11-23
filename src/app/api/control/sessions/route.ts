import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

export async function GET(req: Request) {
  return handleControl(req, (db, t) => control.sessions(db, t));
}

/** 세션 등록·갱신: {id, name, role?, tags?, active?} */
export async function POST(req: Request) {
  return handleControl(req, (db, t, body) => control.register(db, t, body));
}
