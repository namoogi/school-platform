'use client';
import type { PeriodValue } from '@/lib/analyze';
import { useI18n } from './I18nProvider';

export function PeriodTable({ value }: { value: PeriodValue }) {
  const { t } = useI18n();
  return (
    <table className="grid-table">
      <thead><tr><th>{t('review.col.id')}</th><th>{t('review.col.label')}</th><th>{t('review.col.assessments')}</th></tr></thead>
      <tbody>
        {value.periods.map((p) => (
          <tr key={p.id}><td><code>{p.id}</code></td><td>{p.label}</td><td>{p.assessments.join(', ') || '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
