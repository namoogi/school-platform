import type { PeriodValue } from '@/lib/analyze';

export function PeriodTable({ value }: { value: PeriodValue }) {
  return (
    <table className="grid-table">
      <thead><tr><th>기간 ID</th><th>기간 이름</th><th>소속 평가 기간</th></tr></thead>
      <tbody>
        {value.periods.map((p) => (
          <tr key={p.id}><td><code>{p.id}</code></td><td>{p.label}</td><td>{p.assessments.join(', ') || '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
