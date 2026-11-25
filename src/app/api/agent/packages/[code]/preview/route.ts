import { handleAgent } from '@/lib/agent-api';
import { agentPreview } from '@/lib/packages';

/** 61차 F5: 꾸러미 최신 판의 합성 자료 미리보기(양식·목록·출력). ?lang=ko|en */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'ko';
  return handleAgent(req, (db, token) => agentPreview(db, token, code, lang));
}
