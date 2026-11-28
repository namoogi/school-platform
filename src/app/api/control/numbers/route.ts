import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/**
 * 134차 ADR 0051: 차시·결정 기록·마이그레이션 번호를 관제 센터가 나눠 준다(점검 토큰).
 * GET ?kind=round|adr|migration → 최근에 나간 번호. POST {kind, session, title, floor?} → {kind, value, label}
 */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind');
  return handleControl(req, (db, t) => control.numbers(db, t, kind && ['round', 'adr', 'migration'].includes(kind) ? kind : null));
}

export async function POST(req: Request) {
  return handleControl(req, (db, t, body) => control.reserve(db, t, body));
}
