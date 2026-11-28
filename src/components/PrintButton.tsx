'use client';
import { useI18n } from './I18nProvider';

/** 75차: 인쇄 단추(브라우저 인쇄 → PDF 저장 가능). 인쇄 때는 발행본 종이(.paper)만 남는다(globals.css @media print) */
export function PrintButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return <button type="button" className="btn btn-primary" onClick={() => window.print()} data-testid="print">{label ?? t('print.label')}</button>;
}
