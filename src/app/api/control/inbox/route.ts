import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 전달할 지시(사람이 남긴 답·지시 가운데 아직 전달하지 않은 것) */
export async function GET(req: Request) {
  return handleControl(req, (db, t) => control.inbox(db, t));
}
