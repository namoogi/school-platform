import { Fragment } from 'react';
import { loadForPage } from '@/lib/page';
import { listDefinitions, listPackages, packageSpecs, previewPackage, type Issue, type Preview } from '@/lib/packages';
import { PageHeader, StatusBadge } from '@/components/ui';
import { PackageSwitch } from './PackagesClient';

const KIND: Record<string, string> = { record_type: '기록 유형', form: '양식', view: '목록', output: '출력', flow: '흐름' };

/** 61차 F5(ADR 0025): 학사 꾸러미 — 학교 AI가 만든 정의 묶음을 검사 결과·합성 미리보기로 보고, 관리자가 켠다 */
export default async function PackagesPage() {
  const { packages, previews, defs, school } = await loadForPage(async ({ db, school }) => {
    const packages = await listPackages(db, school.id);
    const defs = await listDefinitions(db, school.id);
    const previews: Record<string, Preview[]> = {};
    for (const p of packages) if (p.valid) previews[p.code] = previewPackage(await packageSpecs(db, school.id, p.code, p.version));
    return { packages, previews, defs };
  }, { module: 'records' });
  return (
    <>
      <PageHeader title="학사 꾸러미" crumbs={[{ label: '학사 운영' }, { label: '학사 꾸러미' }]}
        description="학교가 정한 기록 유형·양식·목록·출력·흐름의 묶음입니다. 학교 AI가 작업 토큰으로 만들고 검사기가 확인하면, 합성 자료 미리보기를 보고 관리자가 켭니다."
        meta={<span>꾸러미 {packages.length}개 · 켜짐 {packages.filter((p) => p.state?.state === 'enabled').length}개</span>} />
      {packages.length === 0 && (
        <section className="card"><p className="muted empty">아직 꾸러미가 없습니다. 홈페이지 → AI 작업 공간에서 &lsquo;학사 꾸러미&rsquo; 종류로 작업 토큰을 발급해 학교 AI에게 맡길 수 있습니다.</p></section>
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
                <h2>{p.title.ko ?? p.title.en ?? p.code} <small className="muted">{p.code} · {p.version}판{p.author_kind === 'agent' ? ' · 학교 AI 작성' : ''}</small></h2>
                <span>
                  {on ? <StatusBadge tone="success">켜짐 · {p.state!.version}판</StatusBadge> : <StatusBadge tone="neutral">꺼짐</StatusBadge>}{' '}
                  {p.valid ? <StatusBadge tone="success">검사 통과</StatusBadge> : <StatusBadge tone="danger">검사 오류 {errors.length}</StatusBadge>}
                </span>
              </div>
              {p.why && <p className="muted">{p.why}</p>}
              <p className="fine">{p.members.map((m) => `${KIND[m.kind] ?? m.kind} ${m.code}(${m.version}판)`).join(' · ')}</p>
              {shown.length > 0 && (
                <ul className="issue-list" aria-label="검사 결과">
                  {shown.map((i, n) => <li key={n}><StatusBadge tone={i.level === 'error' ? 'danger' : 'warning'}>{i.level === 'error' ? '오류' : '확인'}</StatusBadge> {i.path} — {i.message}</li>)}
                </ul>
              )}
              {(previews[p.code] ?? []).map((pv) => (
                <details key={pv.record_type} className="preview">
                  <summary>미리보기(합성 자료): {pv.title}{pv.flow ? ` · 흐름 ${pv.flow.states.join(' → ')}` : ''}</summary>
                  {pv.form && pv.form.map((sec, n) => (
                    <fieldset key={n}><legend>{sec.title || '양식'}</legend>
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
              {school.isAdmin ? <PackageSwitch code={p.code} version={p.version} enabled={on} valid={p.valid} /> : <p className="muted">켜기·끄기는 학교 관리자가 합니다.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
