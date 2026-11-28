import { handle } from '@/lib/api';
import { calcRuleHistory, listCalcRules, previewCalc, saveCalcRule } from '@/lib/calc-rules';
import { PRESETS } from '@/lib/calc/expr';
import { requireWhy, ValidationError } from '@/lib/services';

/** ADR 0040: 계산식 판. GET 목록(+견본), GET ?code= 이력 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  return handle(req, async ({ db, school }) => (code
    ? { history: await calcRuleHistory(db, school.id, code) }
    : { rules: await listCalcRules(db, school.id), presets: PRESETS }), { module: 'records' });
}

/**
 * { action: 'save', code, title, spec, why(필수, 131차), base_version } | { action: 'preview', spec, samples }
 * title 은 { ko, en } 또는 글 하나(화면 칸: 지금 화면 언어 칸으로 저장, 없으면 이름 그대로)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, async ({ db, school }) => {
    if (body?.action === 'preview') return previewCalc(body.spec, body.samples);
    if (body?.action === 'save') {
      const title = typeof body.title === 'string' ? (body.title.trim() ? { [typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'ko']: body.title.trim().slice(0, 200) } : undefined) : body.title;
      return saveCalcRule(db, school.id, { ...body, title, why: requireWhy(body.why) });
    }
    throw new ValidationError('err.unknownRequest');
  }, { module: 'records' });
}
