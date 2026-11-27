'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from './I18nProvider';

type S = { id: string; name: string; status: string };

async function setContext(schoolId: string | null, fallbackError = '학교를 바꾸지 못했습니다.') {
  const res = await fetch('/api/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolId }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? fallbackError);
}

/** 상단 막대의 학교 전환기. 볼 수 있는 학교만 나오고(RLS), 전환하면 그 학교의 첫 화면으로 간다. */
export function SchoolSwitcher({ current, schools, platform }: { current: S | null; schools: S[]; platform: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);
  const [q, setQ] = useState('');
  const list = schools.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  if (!schools.length && !platform) return null;
  async function pick(id: string) {
    try { await setContext(id, t('switcher.error')); ref.current?.removeAttribute('open'); router.push('/'); router.refresh(); }
    catch (e) { alert((e as Error).message); }
  }
  return (
    <details className="switcher" ref={ref}>
      <summary>
        {/* 보이는 학교 이름이 접근 이름에 그대로 들어가도록 aria-label 대신 숨김 글자로 용도를 붙인다 (WCAG 2.5.3) */}
        <span className="sr-only">{t('switcher.label')}</span>
        <span className="switcher-name" data-testid="school-name">{current ? current.name : t('switcher.platform')}</span>
        {current?.status === 'trial' && <span className="badge" data-tone="info">{t('switcher.trial')}</span>}
        {current?.status === 'suspended' && <span className="badge" data-tone="danger">{t('switcher.suspended')}</span>}
      </summary>
      <div className="switcher-panel">
        {schools.length > 6 && <input type="search" placeholder={t('switcher.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('switcher.search')} />}
        <div className="menu-label">{platform ? t('switcher.allSchools') : t('switcher.mySchools')}</div>
        {list.map((s) => (
          <button key={s.id} type="button" aria-current={current?.id === s.id ? 'true' : undefined} onClick={() => pick(s.id)}>
            <span>{s.name}</span>
            {s.status !== 'active' && <span className="badge" data-tone={s.status === 'trial' ? 'info' : 'danger'}>{s.status === 'trial' ? t('switcher.trial') : t('switcher.suspended')}</span>}
          </button>
        ))}
        {platform && <><hr /><Link href="/admin" onClick={() => ref.current?.removeAttribute('open')}>{t('switcher.toPlatform')}</Link></>}
      </div>
    </details>
  );
}

export function LeaveSchoolButton() {
  const router = useRouter();
  const { t } = useI18n();
  async function leave() {
    await setContext(null);
    router.push('/admin'); router.refresh();
  }
  return <button type="button" className="btn btn-ghost btn-sm" onClick={leave}>{t('switcher.leave')}</button>;
}

export function EnterSchoolButton({ schoolId, label = '들어가기' }: { schoolId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function enter() {
    setBusy(true);
    try { await setContext(schoolId); router.push('/'); router.refresh(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }
  return <button type="button" className="btn btn-secondary btn-sm" onClick={enter} disabled={busy}>{label}</button>;
}
