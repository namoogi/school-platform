import { handlePlatform } from '@/lib/api';
import { setPlacement } from '@/lib/placement';

/** ADR 0038: 학교 격리 등급 판 더하기 { schoolId, tier, state, target_url, reason, monthly_cost_usd, base_version } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handlePlatform(req, async ({ db }) => setPlacement(db, body?.schoolId, body ?? {}));
}
