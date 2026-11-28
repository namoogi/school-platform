'use client';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChooseDirection } from '@/app/admin/design/ChooseDirection';
import { useI18n } from '@/components/I18nProvider';

/** 시안 위에 떠 있는 비교 막대: 목록으로, 이전·다음 원형, 이 방향 선택 */
export function PreviewBar({ no, total, name, prev, next }: { no: number; total: number; name: string; prev: string; next: string }) {
  const { t } = useI18n();
  return (
    <nav className="pv-bar" aria-label={t('pv.bar')}>
      <Link href="/admin/design" className="pv-link"><ArrowLeft size={14} aria-hidden="true" />{t('pv.back')}</Link>
      <span className="pv-sep" aria-hidden="true" />
      <Link href={`/preview/${prev}`} className="pv-icon" aria-label={t('pv.prev')}><ChevronLeft size={16} /></Link>
      <span className="pv-name"><b>{no}</b>/{total} {name}</span>
      <Link href={`/preview/${next}`} className="pv-icon" aria-label={t('pv.next')}><ChevronRight size={16} /></Link>
      <span className="pv-sep" aria-hidden="true" />
      <ChooseDirection name={`${no}. ${name}`} />
    </nav>
  );
}
