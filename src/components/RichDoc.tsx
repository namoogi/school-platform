import { type Block, type Inline, parseRich } from '@/lib/richdoc';

/** 81차: 연구소 본문 보기 — 표·지표 타일·흐름도·막대·계단을 같은 규칙으로 그린다. 색만으로 뜻을 전하지 않도록 글·기호를 함께 쓴다 */
function Ins({ xs }: { xs: Inline[] }) {
  return <>{xs.map((x, i) => x.t === 'b' ? <strong key={i}>{x.v}</strong> : x.t === 'code' ? <code key={i}>{x.v}</code>
    : x.t === 'a' ? <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{x.v}</a> : <span key={i}>{x.v}</span>)}</>;
}
const QUOTE = { decide: '결정', warn: '주의', note: '메모' } as const;

function B({ b }: { b: Block }) {
  switch (b.k) {
    case 'h': {
      const H = (`h${Math.min(b.level + 1, 5)}`) as 'h2';
      return <H id={b.id} className={`rd-h rd-h${b.level}`}><Ins xs={b.text} /></H>;
    }
    case 'p': return <p><Ins xs={b.text} /></p>;
    case 'ul': return <ul>{b.items.map((x, i) => <li key={i}><Ins xs={x} /></li>)}</ul>;
    case 'ol': return <ol>{b.items.map((x, i) => <li key={i}><Ins xs={x} /></li>)}</ol>;
    case 'hr': return <hr />;
    case 'quote': return (
      <aside className={`rd-callout rd-${b.tone}`} aria-label={QUOTE[b.tone]}>
        <span className="rd-callout-tag">{QUOTE[b.tone]}</span>
        <div>{b.lines.map((l, i) => <p key={i}><Ins xs={l} /></p>)}</div>
      </aside>);
    case 'table': return (
      <div className="table-wrap"><table className="grid-table rd-table">
        <thead><tr>{b.head.map((c, i) => <th key={i} scope="col"><Ins xs={c} /></th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row"><Ins xs={c} /></th> : <td key={j}><Ins xs={c} /></td>)}</tr>)}</tbody>
      </table></div>);
    case 'kpi': return (
      <div className="rd-kpis">{b.items.map((x, i) => (
        <div key={i} className="rd-kpi"><span className="rd-kpi-label">{x.label}</span><strong className="rd-kpi-value">{x.value}</strong>{x.hint && <span className="rd-kpi-hint">{x.hint}</span>}</div>))}</div>);
    case 'steps': return (
      <ol className="rd-steps" aria-label="흐름">{b.items.map((x, i) => (
        <li key={i} className="rd-step"><span className="rd-step-no" aria-hidden="true">{i + 1}</span><strong>{x.title}</strong>{x.hint && <span className="rd-step-hint">{x.hint}</span>}</li>))}</ol>);
    case 'bars': {
      const max = Math.max(...b.items.map((x) => Math.abs(x.value)), 1);
      return (
        <div className="rd-bars" role="list">{b.items.map((x, i) => (
          <div key={i} className="rd-bar" role="listitem">
            <span className="rd-bar-label">{x.label}</span>
            <span className="rd-bar-track"><span className="rd-bar-fill" style={{ width: `${Math.max(2, (Math.abs(x.value) / max) * 100)}%` }} /></span>
            <span className="rd-bar-text">{x.text}</span>
          </div>))}</div>);
    }
    case 'tiers': return (
      <ol className="rd-tiers" aria-label="단계">{[...b.items].reverse().map((x, i, arr) => (
        <li key={i} className="rd-tier" data-level={arr.length - i}>
          <span className="rd-tier-no">{arr.length - i}</span><div><strong>{x.name}</strong>{x.tag && <span className="tag">{x.tag}</span>}{x.hint && <p>{x.hint}</p>}</div>
        </li>))}</ol>);
    case 'code': return <pre className="copy-box"><code>{b.text}</code></pre>;
  }
}

export function RichDoc({ body, testId }: { body: string; testId?: string }) {
  const blocks = parseRich(body);
  if (!blocks.length) return <p className="muted">내용이 없습니다.</p>;
  return <div className="rd" data-testid={testId}>{blocks.map((b, i) => <B key={i} b={b} />)}</div>;
}
