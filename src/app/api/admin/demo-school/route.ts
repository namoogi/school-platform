import { handlePlatform } from '@/lib/api';

export const maxDuration = 300;
import { buildDemoSchool, findDemoSchool } from '@/lib/demo-school';

/** 109차 ADR 0043: 시연용 가상 학교(합성 자료). 전체 관리자만. 이미 있으면 그대로 돌려준다. */
export async function GET(req: Request) {
  return handlePlatform(req, async ({ db }) => ({ school: await findDemoSchool(db) }));
}

export async function POST(req: Request) {
  return handlePlatform(req, ({ db }) => buildDemoSchool(db));
}
