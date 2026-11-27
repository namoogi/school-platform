'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Module } from '@/lib/admin';
import { useConfirm } from '@/components/ConfirmDialog';
import { useI18n } from '@/components/I18nProvider';
import { withLink as withSlot } from '@/components/ui';
import type { MsgKey } from '@/lib/i18n/catalog';

// failed: 서버가 오류 문구를 주지 않을 때 보일 글(화면 언어로 넘긴다)
async function post(url: string, body: unknown, failed: string) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? failed);
  return data;
}

// 학교 상태 이름은 사전의 school.status.*
const STATUSES = ['trial', 'active', 'suspended'];
// 학교 기본 언어로 고를 수 있는 코드(DB 학교 만들기 함수가 ko·en·th 만 받는다). 이름은 화면 언어로 Intl 이 만든다
const SCHOOL_LOCALES = ['ko', 'en', 'th'];

export function SchoolActions({ schoolId, schoolName, status, period }: { schoolId: string; schoolName: string; status: string; period: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [ask, confirmDialog] = useConfirm();
  const statusLabel = (k: string) => t(`school.status.${k}` as MsgKey);
  async function run(fn: () => Promise<unknown>) {
    try { await fn(); router.refresh(); } catch (e) { alert((e as Error).message); }
  }
  async function changeStatus(next: string) {
    const ok = await ask(next === 'suspended'
      ? { title: t('adminc.suspendTitle', { name: schoolName }), description: t('adminc.suspendBody'), confirmLabel: t('adminc.suspend') }
      : { title: t('adminc.statusTitle', { name: schoolName, status: statusLabel(next) }), description: t('adminc.statusBody'), confirmLabel: t('adminc.changeStatus'), tone: 'primary' });
    if (ok) run(() => post(`/api/admin/schools/${schoolId}/status`, { status: next }, t('common.failed')));
  }
  return (
    <>
      {confirmDialog}
      <select aria-label={t('adminc.statusAria', { name: schoolName })} value={status} className="small" onChange={(e) => changeStatus(e.target.value)}>
        {STATUSES.map((k) => <option key={k} value={k}>{statusLabel(k)}</option>)}
      </select>
      <button type="button" className="secondary small"
        onClick={async () => {
          if (await ask({ title: t('adminc.billTitle', { period }), description: withSlot(t('adminc.billBody', { name: schoolName, period }), { strong: <strong>{t('adminc.billStrong')}</strong> }), confirmLabel: t('adminc.billConfirm') }))
            run(() => post(`/api/admin/schools/${schoolId}/statement`, { period }, t('common.failed')));
        }}>
        {t('adminc.billButton', { period })}
      </button>
    </>
  );
}

export function CreateSchoolForm({ modules }: { modules: Module[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const langName = (code: string) => { try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code; } catch { return code; } };
  const [f, setF] = useState({ name: '', slug: '', locale: 'ko', adminEmail: '', seats: 5, modules: ['records'] as string[], githubUrl: '' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function create() {
    try {
      const { id } = await post('/api/admin/schools', f, t('common.failed'));
      let extra = '';
      if (f.githubUrl.trim()) {
        try { await post(`/api/admin/schools/${id}/links`, { kind: 'github_repo', label: t('adminc.repoLabel', { name: f.name }), url: f.githubUrl.trim() }, t('common.failed')); extra = t('adminc.repoLinked'); }
        catch (e) { extra = t('adminc.repoFailed', { error: (e as Error).message }); }
      }
      setMsg({ text: t('adminc.created', { name: f.name, email: f.adminEmail, extra }) });
      setF({ ...f, name: '', slug: '', adminEmail: '', githubUrl: '' }); router.refresh();
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="create-school">
      <h2>{t('adminc.createTitle')}</h2>
      <label>{t('adminc.schoolName')}<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>{t('adminc.slug')}<input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder={t('adminc.slugPlaceholder')} /></label>
      <label>{t('adminc.locale')}<select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })}>{SCHOOL_LOCALES.map((c) => <option key={c} value={c}>{langName(c)}</option>)}</select></label>
      <label>{t('adminc.adminEmail')}<input type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></label>
      <label>{t('adminc.seats')}<input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} /></label>
      <label>{t('adminc.repo')}<input value={f.githubUrl} onChange={(e) => setF({ ...f, githubUrl: e.target.value })} placeholder="https://github.com/<owner>/<repo>" /></label>
      <fieldset className="choices"><legend>{t('adminc.modules')}</legend>
        {modules.filter((m) => m.available).map((m) => (
          <label key={m.key} className="radio"><input type="checkbox" disabled={m.required} checked={m.required || f.modules.includes(m.key)}
            onChange={(e) => setF({ ...f, modules: e.target.checked ? [...f.modules, m.key] : f.modules.filter((k) => k !== m.key) })} /> {m.name}</label>
        ))}
      </fieldset>
      <button type="button" className="primary" onClick={create} disabled={!f.name || !f.slug || !f.adminEmail}>{t('adminc.create')}</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}

/** 109차 ADR 0043: 시연용 가상 학교(합성 자료). 이미 있으면 다시 만들지 않는다. */
export function DemoSchoolButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function build() {
    setBusy(true);
    try {
      const r = await post('/api/admin/demo-school', {}, t('common.failed')) as { created: boolean; students: number; offerings: number };
      setMsg({ text: r.created ? t('demo.built', { students: r.students, offerings: r.offerings }) : t('demo.exists') });
      router.refresh();
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
    setBusy(false);
  }
  return (
    <div className="stack" data-testid="demo-school">
      <h2>{t('demo.title')}</h2>
      <p className="fine">{t('demo.lead')}</p>
      <button type="button" className="secondary" onClick={build} disabled={busy}>{busy ? t('demo.building') : t('demo.build')}</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}

export function PriceForm({ modules }: { modules: Module[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [prices, setPrices] = useState(Object.fromEntries(modules.map((m) => [m.key, m.monthly_price_per_seat_krw])));
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(key: string) {
    try { await post('/api/admin/prices', { key, price: prices[key] }, t('common.failed')); setMsg({ text: t('adminc.priceSaved') }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="prices">
      <h2>{t('adminc.prices')}</h2>
      {modules.map((m) => (
        <div key={m.key} className="row price-row">
          <span className="price-name">{m.name}{!m.available && <span className="tag">{t('license.comingSoon')}</span>}</span>
          <span className="input-affix"><input type="number" min={0} step={100} inputMode="numeric" value={prices[m.key]} aria-label={t('adminc.priceAria', { name: m.name })} onChange={(e) => setPrices({ ...prices, [m.key]: Number(e.target.value) })} /><span aria-hidden="true">{t('adminc.won')}</span></span>
          <button type="button" className="secondary small" onClick={() => save(m.key)}>{t('adminc.save')}</button>
        </div>
      ))}
      <p className="fine">{t('adminc.priceNote')}</p>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
