import { Fragment } from 'react';
import { loadForPage } from '@/lib/page';
import { listDefinitions, listPackages, packageSpecs, previewPackage, type Issue, type Preview } from '@/lib/packages';
import { PageHeader, StatusBadge } from '@/components/ui';
import { PackageSwitch } from './PackagesClient';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 정의 종류 이름은 사전의 def.kind.*
const DEF_KINDS = ['record_type', 'form', 'view', 'output', 'flow'];

/** 61차 F5(ADR 0025): 학사 꾸러미 — 학교 AI가 만든 정의 묶음을 검사 결과·합성 미리보기로 보고, 관리자가 켠다 */
export default async function PackagesPage() {
  const { packages, previews, defs, school, uiLang } = await loadForPage(async ({ db, school }) => {
    const packages = await listPackages(db, school.id);
    const defs = await listDefinitions(db, school.id);
    const previews: Record<string, Preview[]> = {};
    for (const p of packages) if (p.valid) previews[p.code] = previewPackage(await packageSpecs(db, school.id, p.code, p.version));
    return { packages, previews, defs, uiLang: await userLang(db) };
  }, { module: 'records' });
  const { t, lang } = await getI18n(uiLang, school.locale);
  const KIND = Object.fromEntries(DEF_KINDS.map((k) => [k, t(`def.kind.${k}` as MsgKey)]));
  return (
    <>
      <PageHeader title={t('nav.packages.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.packages.title') }]}
        description={t('pkg.lead')}
        meta={<span>{t('pkg.meta', { n: packages.length, on: packages.filter((p) => p.state?.state === 'enabled').length })}</span>} />
      {packages.length === 0 && (
        <section className="card"><p className="muted empty">{t('pkg.empty')}</p></section>
      )}
      <div className="stack">
        {packages.map((p) => {
          const on = p.state?.state === 'enabled';
          const errors = p.issues.filter((i) => i.level === 'error');
          // 꾸러미가 가리키는 정의 판의 검사 결과도 함께 보여 준다(무엇을 고쳐야 하는지)
          const memberIssues: Issue[] = p.members.flatMap((m) => {
            const d = defs.find((x) => x.kind === m.kind && x.code === m.code && x.version === m.version);
            return d ? d.issues.map((i) => ({ ...i, path: `${KIND[m.kind] ?? m.kind} ${m.code} · ${i.path}` })) : [];
          });
          const shown = [...p.issues, ...memberIssues];
          return (
            <section className="card" key={p.code} data-testid={`pkg-${p.code}`}>
              <div className="between">
                <h2>{p.title[lang] ?? p.title.ko ?? p.title.en ?? p.code} <small className="muted">{p.code} · {t('common.version', { v: p.version })}{p.author_kind === 'agent' ? t('pkg.byAgent') : ''}</small></h2>
                <span>
                  {on ? <StatusBadge tone="success">{t('pkg.onV', { v: p.state!.version })}</StatusBadge> : <StatusBadge tone="neutral">{t('pkg.off')}</StatusBadge>}{' '}
                  {p.valid ? <StatusBadge tone="success">{t('pkg.valid')}</StatusBadge> : <StatusBadge tone="danger">{t('pkg.errors', { n: errors.length })}</StatusBadge>}
                </span>
              </div>
              {p.why && <p className="muted">{p.why}</p>}
              <p className="fine">{p.members.map((m) => t('pkg.member', { kind: KIND[m.kind] ?? m.kind, code: m.code, v: m.version })).join(' · ')}</p>
              {shown.length > 0 && (
                <ul className="issue-list" aria-label={t('pkg.results')}>
                  {shown.map((i, n) => <li key={n}><StatusBadge tone={i.level === 'error' ? 'danger' : 'warning'}>{t(i.level === 'error' ? 'pkg.error' : 'pkg.check')}</StatusBadge> {i.path} — {i.message}</li>)}
                </ul>
              )}
              {(previews[p.code] ?? []).map((pv) => (
                <details key={pv.record_type} className="preview">
                  <summary>{t('pkg.preview', { title: pv.title })}{pv.flow ? t('pkg.flow', { states: pv.flow.states.join(' → ') }) : ''}</summary>
                  {pv.form && pv.form.map((sec, n) => (
                    <fieldset key={n}><legend>{sec.title || KIND.form}</legend>
                      <dl className="facts">{sec.fields.map((f) => <Fragment key={f.key}><dt>{f.label}{f.required ? ' *' : ''}</dt><dd>{f.type}{f.options ? ` (${f.options.join('·')})` : ''} · {f.privacy}</dd></Fragment>)}</dl>
                    </fieldset>
                  ))}
                  {pv.list && (
                    <div className="table-wrap"><table className="grid-table"><thead><tr>{pv.list.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>{pv.list.rows.map((r, n) => <tr key={n}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
                  )}
                  {pv.output && pv.output.map((b, n) => b.rows
                    ? <div className="table-wrap" key={n}><table className="grid-table"><tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
                    : b.type === 'heading' ? <h3 key={n}>{b.text}</h3> : <p key={n}>{b.text}</p>)}
                </details>
              ))}
              {school.isAdmin ? <PackageSwitch code={p.code} version={p.version} enabled={on} valid={p.valid} /> : <p className="muted">{t('pkg.adminOnly')}</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
