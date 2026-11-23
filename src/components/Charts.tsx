/**
 * 26차: 서버에서 그리는 작은 차트(의존성 없음). 색은 CSS 토큰(.chart-*)으로만 정하고,
 * 화면낭독기용으로 같은 값을 표로도 제공한다.
 */
export function BarChart({ title, data, unit = '' }: { title: string; data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 600, H = 180, pad = 24, bw = (W - pad * 2) / Math.max(1, data.length);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={title}>
        {ticks.map((t) => {
          const y = H - (t / max) * (H - pad);
          return <g key={t}><line className="chart-grid" x1={pad} x2={W - pad} y1={y} y2={y} /><text className="chart-axis" x={pad - 6} y={y + 4} textAnchor="end">{t}</text></g>;
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * (H - pad);
          const x = pad + i * bw + bw * 0.18;
          const last = i === data.length - 1;
          return (
            <g key={d.label}>
              <rect className={last ? 'chart-bar is-last' : 'chart-bar'} x={x} y={H - h} width={bw * 0.64} height={Math.max(h, d.value ? 2 : 0)} rx={2} />
              {(data.length <= 14 || i % 5 === 0 || last) && <text className="chart-axis" x={x + bw * 0.32} y={H + 16} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <table className="sr-only"><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{d.value}{unit}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** 가로 막대(학교별 비율). 값은 글자로도 함께 보인다. */
export function HBars({ rows }: { rows: { label: string; value: number; max: number; note?: string }[] }) {
  return (
    <ul className="hbars">
      {rows.map((r) => {
        const ratio = r.max > 0 ? Math.min(1, r.value / r.max) : 0;
        return (
          <li key={r.label}>
            <div className="hbars-top"><span>{r.label}</span><b className="num">{r.value} / {r.max}{r.note ? ` · ${r.note}` : ''}</b></div>
            <div className="hbars-track" role="meter" aria-label={r.label} aria-valuemin={0} aria-valuemax={r.max} aria-valuenow={r.value}>
              <span data-tone={ratio >= 1 ? 'danger' : ratio >= 0.9 ? 'warning' : undefined} style={{ width: `${ratio * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
