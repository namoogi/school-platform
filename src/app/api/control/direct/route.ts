import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/**
 * 133차(ADR 0050): 관제가 세션에 지시를 남긴다. 그 세션은 차례마다 /api/control/mine 으로 받아 간다.
 * {session, title, body, related?} → 새 지시 묶음 / {session, request, body} → 그 세션이 맡은 요청에 덧붙임
 */
export async function POST(req: Request) {
  return handleControl(req, (db, t, body) => control.direct(db, t, body));
}
