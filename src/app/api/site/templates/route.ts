import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { applyTemplate, SITE_TEMPLATES } from '@/lib/site-templates';

/** 65차(ADR 0031): 템플릿 목록(구성원) */
export async function GET(req: Request) {
  return handle(req, async () => SITE_TEMPLATES.map((t) => ({ key: t.key, version: t.version, name: t.name, summary: t.summary, fits: t.fits, theme: t.theme, langs: t.langs,
    pages: t.pages.map((p) => p.key), slots: t.slots.map((s) => ({ id: s.id, page: s.page, kind: s.kind, label: s.label, hint: s.hint })), mustHave: t.mustHave })), { module: 'homepage' });
}

/** 템플릿 적용(학교 관리자): 없는 쪽만 시안으로 만든다. body: { key } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    if (typeof b?.key !== 'string') throw new ValidationError('템플릿을 고르세요.');
    return applyTemplate(db, school.id, b.key);
  }, { module: 'homepage', admin: true });
}
