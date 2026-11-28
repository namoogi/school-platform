import { Fragment } from 'react';
import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { gradePreview, listTemplates, schoolTemplate, setupChecklist, type AcademicTemplate } from '@/lib/academic-templates';
import { schoolProfile } from '@/lib/foundation';
import { PageHeader, StatusBadge } from '@/components/ui';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';
import { ApplyTemplate } from './ApplyTemplate';
import { HiddenSectionsForm } from './HiddenSectionsForm';
import { hiddenSections } from '@/lib/sections';
import { AcademicsTabs } from '../AcademicsTabs';

/** 113차 ADR 0043 2단계: 학사 관리 템플릿 — 고르기(카드) · 나란히 비교 · 학교 사본 만들기 · 남은 설정 점검표 */
export default async function TemplatesPage() {
  const { templates, current, steps, profileVersion, hidden, school, uiLang } = await loadForPage(async ({ db, school }) => ({
    templates: await listTemplates(db),
    current: await schoolTemplate(db, school.id),
    steps: await setupChecklist(db, school.id),
    profileVersion: (await schoolProfile(db, school.id))?.version ?? 0,
    hidden: [...(await hiddenSections(db, school.id))],
    uiLang: await userLang(db),
  }), { module: 'records' });
  const { t, lang } = await getI18n(uiLang, school.locale);
  const admin = school.isAdmin;
  const pick = (l: Record<string, string>) => l[lang] ?? l.ko ?? Object.values(l)[0];
  const lv = (k: string) => t(`scheme.level.${k}` as MsgKey);
  const grades = (tp: AcademicTemplate) => gradePreview(tp.manifest, lang).map((g) => `${lv(g.level)} ${g.first}~${g.last}`).join(' · ');
  const list = (keys: string[], prefix: string) => (keys.length ? keys.map((k) => t(`${prefix}.${k}` as MsgKey)).join(' · ') : t('atpl.none'));
  const rows: { label: string; value: (tp: AcademicTemplate) => string }[] = [
    { label: t('atpl.row.grades'), value: grades },
    { label: t('atpl.row.terms'), value: (tp) => tp.manifest.periods.map((p) => p.label).join(' · ') },
    { label: t('atpl.row.scales'), value: (tp) => tp.manifest.scales.map((s) => s.code).join(' · ') },
    { label: t('atpl.row.calc'), value: (tp) => tp.manifest.calc_samples.join(' · ') || t('atpl.none') },
    { label: t('atpl.row.attendance'), value: (tp) => t(`atpl.att.${tp.manifest.attendance}` as MsgKey) },
    { label: t('atpl.row.outputs'), value: (tp) => list(tp.manifest.outputs, 'atpl.out') },
    { label: t('atpl.row.hide'), value: (tp) => list(tp.manifest.hide, 'atpl.hide') },
  ];
  const next = steps.find((s) => !s.done)?.key;
  return (
    <>
      <PageHeader title={t('atpl.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.academics.title'), href: '/academics' }, { label: t('atpl.title') }]}
        description={t('atpl.lead')}
        meta={<>{current ? <span>{t('atpl.metaCurrent', { name: pick(current.latest?.title ?? { ko: current.key }), v: current.version })}</span> : <span>{t('atpl.metaNone')}</span>}
          <span>{t('atpl.metaCount', { n: templates.length })}</span></>} />
      <AcademicsTabs current="templates" t={t} />

      <section className="card stack" data-testid="setup-checklist">
        <h2>{t('atpl.checklist')}</h2>
        <ol className="setup-list">
          {steps.map((s, i) => (
            <li key={s.key} className={s.done ? 'done' : undefined} aria-current={s.key === next ? 'step' : undefined}>
              <span className="dot" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
              <Link href={s.href}>{t(`atpl.step.${s.key}` as MsgKey)}</Link>
              <StatusBadge tone={s.done ? 'success' : s.key === next ? 'info' : 'neutral'}>{s.done ? t('atpl.stepDone') : s.key === next ? t('atpl.stepNext') : t('atpl.stepTodo')}</StatusBadge>
            </li>))}
        </ol>
      </section>

      <section className="card stack" data-testid="hidden-sections">
        <h2>{t('atpl.ourHidden')}</h2>
        <p className="fine">{hidden.length ? hidden.map((k) => t(`atpl.hide.${k}` as MsgKey)).join(' · ') : t('atpl.none')}</p>
        {/* 판이 바뀌면(템플릿 적용·다른 사람 저장) 양식을 새로 그려 체크 상태를 서버 값에 맞춘다(Codex 191번 PR 검토) */}
        {admin && <HiddenSectionsForm key={profileVersion} current={hidden} baseVersion={profileVersion} />}
      </section>

      <div className="template-grid" data-testid="template-cards">
        {templates.map((tp) => {
          // 학교가 고른 판과 최신 판이 다르면 '새 판'으로 따로 보인다(같은 키라도 지금 판이 아님, Codex #180)
          const mode = current?.key !== tp.key ? 'choose' : current.version === tp.version ? 'reapply' : 'update';
          return (
            <section key={tp.key} className="card stack" data-testid={`tpl-${tp.key}`}>
              <h2>{pick(tp.title)} {mode === 'reapply' && <StatusBadge tone="success">{t('atpl.current')}</StatusBadge>}
                {mode === 'update' && <StatusBadge tone="info">{t('atpl.newVersion', { from: current!.version, to: tp.version })}</StatusBadge>}</h2>
              <p className="fine">{pick(tp.summary)}</p>
              <h3>{t('atpl.youGet')}</h3>
              <dl className="facts">
                {rows.map((r) => <Fragment key={r.label}><dt>{r.label}</dt><dd>{r.value(tp)}</dd></Fragment>)}
              </dl>
              {admin && <ApplyTemplate templateKey={tp.key} templateVersion={tp.version} title={pick(tp.title)} baseVersion={profileVersion} mode={mode} />}
            </section>);
        })}
      </div>

      <section className="card stack" data-testid="template-compare">
        <h2>{t('atpl.compare')}</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={t('atpl.compare')}><table className="grid-table nowrap-cells">
          <thead><tr><th>{t('atpl.row.item')}</th>{templates.map((tp) => <th key={tp.key}>{pick(tp.title)}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th>{templates.map((tp) => <td key={tp.key}>{r.value(tp)}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="fine">{t('atpl.compareNote')}</p>
      </section>
    </>
  );
}
