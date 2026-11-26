import { handleAgent } from '@/lib/agent-api';
import { agentWhoami } from '@/lib/agent';
import { SITE_TEMPLATES } from '@/lib/site-templates';

/**
 * 66차(ADR 0031): 학교 AI용 템플릿 빈 칸 안내 — 쪽(page)을 다루는 토큰이면 읽을 수 있다.
 * 쪽의 meta.template(예: "story@1")로 어느 템플릿인지 알고, 빈 칸 경로·안내·단서대로 새 판을 저장한다(쪽 고치기 권한).
 */
export async function GET(req: Request) {
  return handleAgent(req, async (db, token) => {
    const me = await agentWhoami(db, token) as { kinds?: string[] };
    if (!me.kinds?.includes('page')) throw Object.assign(new Error('쪽(page)을 다루는 토큰만 템플릿 안내를 읽습니다.'), { code: '42501' });
    return SITE_TEMPLATES.map((t) => ({ key: t.key, version: t.version, name: t.name, pages: t.pages.map((p) => p.key), mustHave: t.mustHave,
      slots: t.slots.map((s) => ({ id: s.id, page: s.page, path: s.path, kind: s.kind, label: s.label, hint: s.hint })) }));
  });
}
