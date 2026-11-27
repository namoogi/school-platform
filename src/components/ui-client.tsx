'use client';
import Link from 'next/link';
import type { MsgKey } from '@/lib/i18n/catalog';
import { useI18n } from './I18nProvider';

/**
 * ADR 0037: ui.tsx 는 서버·브라우저 화면이 함께 쓰므로 훅을 못 쓴다. 문구가 든 작은 조각만 여기서 화면 언어로 그린다.
 */
export type Crumb = { href?: string; label: string };

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('ui.breadcrumb')}><ol className="breadcrumb">
      {crumbs.map((c, i) => <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>)}
    </ol></nav>
  );
}

/** 단계 이름은 label(이미 옮긴 글) 또는 labelKey(이름표) 중 하나 */
export type StepItem = { key: string; label?: string; labelKey?: MsgKey; href?: string };

/** 학사 흐름 단계: 자료 첨부 → 관리자 확인 → 문서 발행 */
export function Steps({ current, done = [], items }: { current: string; done?: string[]; items: StepItem[] }) {
  const { t } = useI18n();
  return (
    <ol className="steps" aria-label={t('ui.steps')}>
      {items.map((s, i) => {
        const label = s.labelKey ? t(s.labelKey) : s.label;
        const inner = <><span className="dot" aria-hidden="true">{done.includes(s.key) ? '✓' : i + 1}</span>{label}{done.includes(s.key) && <span className="sr-only">{t('ui.stepDone')}</span>}</>;
        return (
          <li key={s.key} className={done.includes(s.key) ? 'done' : ''} aria-current={s.key === current ? 'step' : undefined}>
            {s.href && s.key !== current ? <Link href={s.href}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ol>
  );
}
