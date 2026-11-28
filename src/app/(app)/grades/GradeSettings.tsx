import Link from 'next/link';
import { ActionForm, type FieldSpec, type PreviewSpec } from '@/components/ActionForm';
import { SCALE_KINDS, SCALE_PRESETS, type Band } from '@/lib/grading';
import { PRESETS } from '@/lib/calc/expr';
import { BOUNDARY_SCORES, boundarySamples, type CalcRule } from '@/lib/calc-rules';
import type { ScaleRow } from '@/lib/gradebook';
import type { MsgKey } from '@/lib/i18n/catalog';
import { jsonText } from '@/lib/json-text';

type T = (key: MsgKey, vars?: Record<string, string | number>) => string;


const samples = (t: T) => boundarySamples((score) => t('gset.sample', { score }));

/**
 * 131차: 학교 관리자가 학사 설정을 화면에서 새 판으로 저장한다(AI 초안 붙여 넣기 포함).
 * 맞춤 척도 · 성적 정책 전체 · 계산식 판. 모든 저장은 보고 고친 판(base_version)을 보내 그 사이 새 판이 있으면 409, '왜' 칸 필수.
 */
export function GradeSettings({ t, lang, scales, policy, calcRules, calcFrom, offering }: {
  t: T; lang: string; scales: ScaleRow[]; policy: { version: number; policy: Record<string, unknown>; why: string | null } | null;
  calcRules: CalcRule[]; calcFrom: string | null; offering: string | null;
}) {
  const why: FieldSpec = { name: 'why', label: t('academics.reason'), required: true, placeholder: t('gset.whyPlaceholder'), width: 'lg' as const };
  const KIND = SCALE_KINDS.map((value) => ({ value, label: t(`gset.kind.${value}` as MsgKey) }));
  const calcPreview: PreviewSpec = {
    action: 'preview', label: t('gset.preview'), required: true, issuesLabel: t('gset.issues'),
    columns: [{ key: 'label', label: t('gset.col.input') }, { key: 'score', label: t('gset.col.score') }, { key: 'passed', label: t('gset.col.passed') }, { key: 'level', label: t('gset.col.level') }],
  };
  const from = calcFrom && Object.hasOwn(PRESETS, calcFrom) ? calcFrom : 'weighted_average';
  const href = (p: string) => `/grades?${new URLSearchParams({ ...(offering ? { o: offering } : {}), calcFrom: p })}#calc-rules`;
  const sampleBands: Band[] = SCALE_PRESETS.kr_achievement.bands;
  return (
    <>
      <div className="settings-grid">
        <section className="card stack" data-testid="scales">
          <h2>{t('grades.scales')}</h2>
          {scales.length === 0 ? <p className="muted">{t('grades.noScales')}</p> : (
            <ul className="record-list">{scales.map((s) => (
              <li key={s.id}>
                <span><strong>{s.code}</strong> <small className="muted">{t('common.version', { v: s.version })} · {s.bands.map((b) => `${b.code}${b.min != null ? `≥${b.min}` : ''}${b.points != null ? `/${b.points}` : ''}${b.earns_credit === false ? '✕' : ''}`).join(' ')}{s.why ? ` · ${s.why}` : ''}</small></span>
                <details data-testid={`scale-edit-${s.code}`}><summary>{t('gset.editBands')}</summary>
                  <ActionForm url="/api/grades" action="scale" extra={{ code: s.code, kind: s.kind, base_version: s.version }} keep
                    submitLabel={t('gset.saveVersion', { v: s.version + 1 })} successText={t('gset.saved')}
                    fields={[{ name: 'bands', label: t('gset.bands'), type: 'json', required: true, defaultValue: jsonText(s.bands) }, why]} />
                </details>
              </li>))}</ul>)}
          <p className="fine">{t('gset.bandsHelp')}</p>
          {Object.keys(SCALE_PRESETS).some((k) => !scales.some((s) => s.code === k)) && (
            <ActionForm url="/api/grades" action="scale-preset" inline submitLabel={t('grades.addScale')} successText={t('grades.scaleAdded')} testId="scale-preset"
              fields={[{ name: 'preset', label: t('grades.preset'), type: 'select', options: Object.keys(SCALE_PRESETS).filter((k) => !scales.some((s) => s.code === k)).map((k) => ({ value: k, label: t(`grade.preset.${k}` as MsgKey) })) }]} />)}
          <details data-testid="scale-new"><summary>{t('gset.newScale')}</summary>
            <ActionForm url="/api/grades" action="scale" extra={{ base_version: 0 }} submitLabel={t('gset.createScale')} successText={t('gset.saved')}
              fields={[{ name: 'code', label: t('common.code'), required: true, placeholder: 'school_letter', width: 'sm' }, { name: 'kind', label: t('gset.kind'), type: 'select', options: KIND },
                { name: 'bands', label: t('gset.bands'), type: 'json', required: true, defaultValue: jsonText(sampleBands) }, why]} />
          </details>
        </section>
        <section className="card stack" data-testid="policy">
          <h2>{t('grades.policy')}</h2>
          <p className="fine">{policy ? `${t('common.version', { v: policy.version })}${policy.why ? ` · ${policy.why}` : ''}` : t('grades.noPolicy')}</p>
          <ActionForm url="/api/grades" action="policy" extra={{ base_version: policy?.version ?? 0 }} inline submitLabel={t('grades.newPolicy')} successText={t('grades.policySaved')}
            fields={[{ name: 'score_digits', label: t('grades.scoreDigits'), type: 'number', defaultValue: String(policy?.policy.score_digits ?? 2) },
              { name: 'final_digits', label: t('grades.finalDigits'), type: 'number', defaultValue: String(policy?.policy.final_digits ?? 0) },
              { name: 'sd', label: t('grades.sd'), type: 'select', defaultValue: (policy?.policy.stats as { sd?: string } | undefined)?.sd === 'sample' ? 'sample' : 'population', options: [{ value: 'population', label: t('grades.sdPopulation') }, { value: 'sample', label: t('grades.sdSample') }] },
              { name: 'why', label: t('academics.reason'), required: true, placeholder: t('grades.policyPlaceholder') }]} />
          <details data-testid="policy-full"><summary>{t('gset.policyFull')}</summary>
            <p className="fine">{t('gset.policyHelp')}</p>
            <ActionForm url="/api/grades" action="policy-full" extra={{ base_version: policy?.version ?? 0 }} keep
              submitLabel={t('gset.saveVersion', { v: (policy?.version ?? 0) + 1 })} successText={t('grades.policySaved')}
              fields={[{ name: 'policy', label: t('gset.policyJson'), type: 'json', required: true, defaultValue: jsonText(policy?.policy ?? {}) }, why]} />
          </details>
        </section>
      </div>
      <section className="card stack" id="calc-rules" data-testid="calc-rules">
        <h2>{t('gset.calcTitle')}</h2>
        <p className="fine">{t('gset.calcLead', { a: BOUNDARY_SCORES[0], b: BOUNDARY_SCORES[1], c: BOUNDARY_SCORES[2] })}</p>
        {calcRules.length === 0 ? <p className="muted">{t('gset.noCalc')}</p> : (
          <ul className="record-list">{calcRules.map((r) => (
            <li key={r.code}>
              <span><strong>{[r.title?.[lang], r.title?.ko].find((x) => typeof x === 'string') ?? r.code}</strong> <small className="muted">{r.code} · {t('common.version', { v: r.version })}{r.why ? ` · ${r.why}` : ''}</small></span>
              <details data-testid={`calc-edit-${r.code}`}><summary>{t('gset.editCalc')}</summary>
                <ActionForm url="/api/calc-rules" action="save" extra={{ code: r.code, title: r.title, base_version: r.version, samples: samples(t) }} keep preview={calcPreview}
                  submitLabel={t('gset.saveVersion', { v: r.version + 1 })} successText={t('gset.saved')}
                  fields={[{ name: 'spec', label: t('gset.spec'), type: 'json', required: true, defaultValue: jsonText(r.spec) }, why]} />
              </details>
            </li>))}</ul>)}
        <div className="detail-section" data-testid="calc-new">
          <h3>{t('gset.newCalc')}</h3>
          <p className="fine">{t('gset.startFrom')} {Object.keys(PRESETS).map((p, i) => <span key={p}>{i ? ' · ' : ''}{p === from ? <strong>{p}</strong> : <Link href={href(p)}>{p}</Link>}</span>)}</p>
          <p className="fine">{t(`calc.preset.${from}` as MsgKey)}</p>
          <ActionForm url="/api/calc-rules" action="save" extra={{ base_version: 0, lang, samples: samples(t) }} preview={calcPreview}
            submitLabel={t('gset.createCalc')} successText={t('gset.saved')}
            fields={[{ name: 'code', label: t('common.code'), required: true, placeholder: 'school_score', width: 'sm' }, { name: 'title', label: t('common.name'), required: true },
              { name: 'spec', label: t('gset.spec'), type: 'json', required: true, defaultValue: jsonText(PRESETS[from].spec) }, why]} />
        </div>
      </section>
    </>
  );
}
