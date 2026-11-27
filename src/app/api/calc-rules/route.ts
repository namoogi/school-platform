import { handle } from '@/lib/api';
import { calcRuleHistory, listCalcRules, previewCalc, saveCalcRule } from '@/lib/calc-rules';
import { PRESETS } from '@/lib/calc/expr';
import { ValidationError } from '@/lib/services';

/** ADR 0040: 계산식 판. GET 목록(+견본), GET ?code= 이력 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  return handle(req, async ({ db, school }) => (code
    ? { history: await calcRuleHistory(db, school.id, code) }
    : { rules: await listCalcRules(db, school.id), presets: PRESETS }), { module: 'records' });
}

/** { action: 'save', code, title, spec, why, base_version } | { action: 'preview', spec, samples } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, async ({ db, school }) => {
    if (body?.action === 'preview') return previewCalc(body.spec, body.samples);
    if (body?.action === 'save') return saveCalcRule(db, school.id, body);
    throw new ValidationError('err.unknownRequest');
  }, { module: 'records' });
}
