'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Bot, ClipboardCopy, Copy, KeyRound } from 'lucide-react';
import { StatusBadge, withLink } from '@/components/ui';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';
import type { Vars } from '@/lib/i18n/format';
import { Field } from '@/components/Field';
import { AI_LABEL, buildConnectText, type AiKind } from '@/lib/agent-connect';

/**
 * 34차 외부 작업 토큰(ADR 0012) → 36차 'AI 작업 공간'(ADR 0013).
 * 학교 관리자가 자기 학교의 Claude Code·Codex 같은 에이전트에게 홈페이지 내용의 '시안'만 맡길 때 토큰을 발급한다.
 * 범위 = 항목 종류(동화·쪽·소식) × 주소(고르지 않으면 그 종류 모두) × 권한(읽기·파일 올리기·시안 저장).
 * 원문은 발급 직후 한 번만 보인다. 공개·설정·구성원·다른 학교는 어떤 토큰으로도 안 되고, 공개는 사람이 한다.
 */
export type TokenRow = {
  id: string; label: string; kinds: string[]; keys: string[] | null; perms: string[]; agent_kind: string; created_at: string; expires_at: string | null;
  revoked_at: string | null; last_used_at: string | null; uses: number;
  recent: { action: string; created_at: string; detail: Record<string, unknown>; session_label?: string | null; operator?: string | null }[];
  /** 83차: 이 토큰을 쓴 세션·작업자(자기 신고)별 횟수 */
  sessions: { session_label: string | null; operator: string | null; n: number; last: string }[];
};
type Entry = { kind: string; key: string; title: string };

type T = (key: MsgKey, vars?: Vars) => string;
/** AI 종류 이름: Codex·Claude Code는 고유명사라 그대로, '기타 AI'만 화면 언어로 */
const agentLabel = (t: T, k: string) => (k === 'other' ? t('site.token.ai.other') : (AI_LABEL as Record<string, string>)[k] ?? k);
const KIND_KEY: Record<string, MsgKey> = { story: 'site.token.kind.story', page: 'site.token.kind.page', news: 'site.token.kind.news', package: 'site.token.kind.package' };
const PERM_KEY: Record<string, MsgKey> = {
  read: 'site.token.perm.read', upload: 'site.token.perm.upload', create: 'site.token.perm.create', edit: 'site.token.perm.edit',
  archive: 'site.token.perm.archive', publish: 'site.token.perm.publish', autopublish: 'site.token.perm.autopublish',
};
const DAYS = ['7', '30', '90', '365', 'none'];
const dayLabel = (t: T, v: string) => (v === 'none' ? t('integ.noExpiry') : t('site.token.days', { n: Number(v) }));
const ACT_KEY: Record<string, MsgKey> = {
  version: 'site.token.act.version', create: 'site.token.act.create', meta: 'site.token.act.meta',
  archive: 'site.token.act.archive', publish: 'site.token.act.publish', unpublish: 'site.token.act.unpublish',
};
const kindLabel = (t: T, k: string) => (KIND_KEY[k] ? t(KIND_KEY[k]) : k);
const permLabel = (t: T, p: string) => (PERM_KEY[p] ? t(PERM_KEY[p]) : p);
const did = (t: T, r: TokenRow['recent'][number]) => {
  if (r.action === 'asset.upload') return t('site.token.did.upload', { type: r.detail.mime === 'application/pdf' ? 'PDF' : t('site.token.did.image') });
  const [, act] = r.action.split('.');
  const k = String(r.detail.kind ?? 'story');
  const what = t('site.token.did.what', { kind: KIND_KEY[k] ? t(KIND_KEY[k]) : '', key: String(r.detail.key ?? '') });
  if (act === 'publish') return t('site.token.did.publish', { what, v: String(r.detail.version ?? '') });
  if (act === 'version') return t('site.token.did.version', {
    what, v: String(r.detail.version ?? ''),
    structure: r.detail.structure_changed ? t('site.token.did.structure', { before: String(r.detail.blocks_before), after: String(r.detail.blocks_after) }) : '',
  });
  return `${what} ${ACT_KEY[act] ? t(ACT_KEY[act]) : act}`;
};
const DAY_MS = 86400000;
/** 38차: 만료 임박(30일 안) · 오래 안 쓴 무기한(180일) 토큰 — 서버의 tokenAlerts 와 같은 기준 */
function alertsOf(tokens: TokenRow[], now: number) {
  const live = tokens.filter((t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > now));
  return {
    soon: live.filter((t) => t.expires_at && new Date(t.expires_at).getTime() - now <= 30 * DAY_MS),
    stale: live.filter((t) => !t.expires_at && now - new Date(t.last_used_at ?? t.created_at).getTime() >= 180 * DAY_MS),
  };
}

/** /site 설정 위쪽 알림 */
export function TokenAlerts({ tokens }: { tokens: TokenRow[] }) {
  const { t, locale } = useI18n();
  const { soon, stale } = alertsOf(tokens, Date.now());
  if (!soon.length && !stale.length) return null;
  return (
    <div className="banner" data-tone="warning" role="status" data-testid="token-alerts">
      {soon.length > 0 && <p><b>{t('site.token.alert.soon')}</b> {t('site.token.alert.soonBody', { list: soon.map((x) => `${x.label}(${day(x.expires_at, locale)})`).join(', ') })}</p>}
      {stale.length > 0 && <p><b>{t('site.token.alert.stale')}</b> {t('site.token.alert.staleBody', { list: stale.map((x) => x.label).join(', ') })}</p>}
    </div>
  );
}

/** 38차: 항목 보관·되살리기 (학교 관리자). 공개 중이면 보관 단추가 잠긴다 */
export function ArchiveControl({ id, archived, live }: { id: string; archived: boolean; live: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [err, setErr] = useState<string | null>(null);
  async function go(next: boolean) {
    setErr(null);
    try { await send(`/api/site/entries/${id}/archive`, { archived: next }, t('common.failed')); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  return (
    <div className={archived ? 'banner' : 'archive-control'} data-tone={archived ? 'info' : undefined} data-testid="archive-control">
      {archived
        ? <><p><b>{t('site.token.archived.title')}</b> {t('site.token.archived.body')}</p>
            <div className="form-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => go(false)}><ArchiveRestore size={14} aria-hidden="true" />{t('site.token.restore')}</button></div></>
        : <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(true)} disabled={live} title={live ? t('site.token.archiveLockedTitle') : undefined}>
              <Archive size={14} aria-hidden="true" />{live ? t('site.token.toArchiveLocked') : t('site.token.toArchive')}
            </button>
          </div>}
      {err && <p className="ui-error" role="alert">{err}</p>}
    </div>
  );
}

async function send(url: string, body: unknown, fallback: string) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}
function day(s: string | null, locale: string) { return s ? new Date(s).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** 클립보드 복사. 막혀 있으면(권한·http) 숨은 글상자로 한 번 더 시도한다 */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { return document.execCommand('copy'); } finally { t.remove(); }
}

type School = { name: string; slug: string | null };
type Scope = { kinds: string[]; keys: string[] | null; perms: string[]; expiresAt: string | null };
const aiOf = (k: string): AiKind => (k === 'codex' || k === 'claude-code' ? k : 'other');
const connectText = (ai: AiKind, school: School, scope: Scope, token: string | null, who: { operator?: string; session?: string } = {}) => buildConnectText({
  ai, schoolName: school.name, publicSlug: school.slug, baseUrl: window.location.origin, token, ...scope, ...who,
});

/** 46차 'AI 연결'(ADR 0022): 발급 직후 — AI 종류를 고르면 지시문 + 토큰이 든 붙여넣기 글 하나 */
function ConnectBox({ token, agent, scope, school }: { token: string; agent: string; scope: Scope; school: School }) {
  const { t } = useI18n();
  const [ai, setAi] = useState<AiKind>(aiOf(agent));
  const [copied, setCopied] = useState<'all' | 'token' | 'fail' | null>(null);
  const [operator, setOperator] = useState('');
  const [session, setSession] = useState('');
  const text = connectText(ai, school, scope, token, { operator, session });
  const copy = async (what: 'all' | 'token') => setCopied((await copyText(what === 'all' ? text : token)) ? what : 'fail');
  return (
    <div className="banner" data-tone="warning" role="region" aria-label={t('site.token.connect.title')} data-testid="agent-connect">
      <h3>{t('site.token.connect.title')}</h3>
      <p><b>{t('site.token.connect.once')}</b> {t('site.token.connect.lead')}</p>
      <fieldset data-testid="agent-connect-ai">
        <legend>{t('site.token.connect.which')}</legend>
        <div className="row-wrap">
          {(Object.keys(AI_LABEL) as AiKind[]).map((k) => (
            <label key={k} className="radio"><input type="radio" name="agent-connect-ai" checked={ai === k} onChange={() => { setAi(k); setCopied(null); }} />{agentLabel(t, k)}</label>
          ))}
        </div>
      </fieldset>
      <div className="row-wrap">
        <Field label={t('site.token.connect.operator')} hint={t('site.token.connect.operatorHint')}>
          <input value={operator} maxLength={120} onChange={(e) => setOperator(e.target.value)} placeholder={t('site.token.connect.operatorPh')} data-testid="agent-connect-operator" />
        </Field>
        <Field label={t('site.token.connect.session')} hint={t('site.token.connect.sessionHint')}>
          <input value={session} maxLength={80} onChange={(e) => setSession(e.target.value)} placeholder={t('site.token.connect.sessionPh')} data-testid="agent-connect-session" />
        </Field>
      </div>
      <Field label={t('site.token.connect.text')} hint={t('site.token.connect.textHint')}>
        <textarea readOnly rows={10} value={text} data-testid="agent-connect-text" onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={() => copy('all')} data-testid="agent-connect-copy">
          <ClipboardCopy size={16} aria-hidden="true" />{t('site.token.connect.copyAll')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy('token')} data-testid="agent-token-copy">
          <Copy size={14} aria-hidden="true" />{t('site.token.connect.copyToken')}
        </button>
        <span role="status" aria-live="polite" className="fine">
          {copied === 'all' ? t('site.token.connect.copiedAll') : copied === 'token' ? t('site.token.connect.copiedToken') : copied === 'fail' ? t('site.token.connect.copyFail') : ''}
        </span>
      </div>
      <p className="fine" data-testid="agent-connect-risk">
        {t('site.token.connect.risk')}
      </p>
      <details>
        <summary>{t('site.token.connect.showToken')}</summary>
        <p><code data-testid="agent-token-value" style={{ wordBreak: 'break-all' }}>{token}</code></p>
      </details>
    </div>
  );
}

/** 이미 발급한 토큰: 원문이 없으니 지시문만(토큰 자리는 환경 변수 안내) */
function InstructionCopy({ t, school }: { t: TokenRow; school: School }) {
  const { t: tr } = useI18n();
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" aria-label={tr('site.token.instructionCopyAria', { name: t.label })} data-testid="agent-instruction-copy"
        onClick={async () => setDone(await copyText(connectText(aiOf(t.agent_kind), school, { kinds: t.kinds, keys: t.keys, perms: t.perms, expiresAt: t.expires_at }, null)))}>
        {tr('site.token.instructionCopy')}
      </button>
      <span role="status" aria-live="polite" className="fine">{done === true ? tr('site.token.copied') : done === false ? tr('site.token.copyFailed') : ''}</span>
    </>
  );
}

export function AgentTokenPanel({ tokens, entries, stories, records = false, school }: { tokens: TokenRow[]; entries: Entry[]; stories: boolean; records?: boolean; school: School }) {
  const router = useRouter();
  const { t: tr, locale } = useI18n();
  // 61차 F5: 학사 꾸러미(정의 만들기·새 판) — 학사 문서실 라이선스가 있을 때. 켜기는 관리자가 /packages 에서 한다
  const kindChoices = [...(stories ? ['story', 'page', 'news'] : ['page', 'news']), ...(records ? ['package'] : [])];
  const [label, setLabel] = useState(() => tr('site.token.defaultLabel'));
  const [agent, setAgent] = useState('codex');
  const [days, setDays] = useState('7');
  const [extendDays, setExtendDays] = useState('365');
  const [kinds, setKinds] = useState<string[]>([kindChoices[0]]);
  const [keys, setKeys] = useState<string[]>([]);
  const [perms, setPerms] = useState<string[]>(['read', 'upload', 'edit']);
  const [issued, setIssued] = useState<{ token: string; agent: string; scope: Scope } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = entries.filter((e) => kinds.includes(e.kind));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setIssued(null);
    const pickedKeys = kinds.some((k) => k !== 'package') ? keys.filter((k) => shown.some((s) => s.key === k)) : [];
    const n = days === 'none' ? null : Number(days);
    try {
      const { token } = await send('/api/site/agent-tokens', { label, days: n, kinds, keys: pickedKeys, perms, agent_kind: agent }, tr('common.failed'));
      setIssued({ token, agent, scope: { kinds, keys: pickedKeys.length ? pickedKeys : null, perms, expiresAt: n ? new Date(Date.now() + n * DAY_MS).toISOString() : null } });
      router.refresh();
    }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  async function extend(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/extend`, { days: extendDays === 'none' ? null : Number(extendDays) }, tr('common.failed')); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  async function revoke(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/revoke`, {}, tr('common.failed')); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  const now = Date.now();
  const state = (t: TokenRow) => t.revoked_at ? { label: tr('integ.revoked'), tone: 'neutral' as const }
    : t.expires_at && new Date(t.expires_at).getTime() < now ? { label: tr('integ.expired'), tone: 'neutral' as const }
    : t.expires_at && new Date(t.expires_at).getTime() - now <= 30 * DAY_MS ? { label: tr('site.token.endingSoon'), tone: 'warning' as const } : { label: tr('integ.usable'), tone: 'success' as const };

  return (
    <section className="card site-form" data-testid="agent-tokens">
      <h2><Bot size={20} aria-hidden="true" /> {tr('site.token.title')}</h2>
      <p className="fine">
        {withLink(tr('site.token.lead'), { b: <b>{tr('site.token.connectText')}</b> })}
      </p>
      <form onSubmit={issue} className="site-form-fields">
        <Field label={tr('common.name')} required hint={tr('site.token.nameHint')} count={{ value: label.length, max: 80 }}>
          <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label={tr('site.token.agent')}>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {Object.keys(AI_LABEL).map((k) => <option key={k} value={k}>{agentLabel(tr, k)}</option>)}
          </select>
        </Field>
        <Field label={tr('integ.col.expires')} hint={days === 'none' || days === '365'
          ? <span data-testid="agent-token-long-warning">{tr('site.token.longWarning')}</span>
          : tr('site.token.shortHint')}>
          <select value={days} onChange={(e) => setDays(e.target.value)} data-testid="agent-token-days">
            {DAYS.map((d) => <option key={d} value={d}>{dayLabel(tr, d)}</option>)}
          </select>
        </Field>
        <fieldset data-testid="agent-token-kinds">
          <legend>{tr('site.token.kinds')}</legend>
          <div className="row-wrap">
            {kindChoices.map((k) => (
              <label key={k} className="radio"><input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} />{kindLabel(tr, k)}</label>
            ))}
          </div>
        </fieldset>
        <fieldset data-testid="agent-token-keys">
          <legend>{tr('site.token.keys')}</legend>
          {shown.length === 0
            ? <p className="fine">{tr('site.token.keysEmpty')}</p>
            : <div className="row-wrap">
                {shown.map((e) => (
                  <label key={`${e.kind}:${e.key}`} className="radio">
                    <input type="checkbox" checked={keys.includes(e.key)} onChange={() => setKeys(toggle(keys, e.key))} />{e.title} (/{e.key})
                  </label>
                ))}
              </div>}
        </fieldset>
        <fieldset data-testid="agent-token-perms">
          <legend>{tr('site.token.perms')}</legend>
          <div className="row-wrap">
            {Object.keys(PERM_KEY).map((k) => (
              <label key={k} className="radio"><input type="checkbox" checked={perms.includes(k)} onChange={() => setPerms(k === 'autopublish' && !perms.includes(k) ? [...new Set([...perms, 'publish', k])] : k === 'publish' && perms.includes(k) ? perms.filter((x) => x !== 'publish' && x !== 'autopublish') : toggle(perms, k))} />{permLabel(tr, k)}</label>
            ))}
          </div>
          {perms.includes('autopublish') && (
            <p className="fine" role="note" data-testid="agent-token-autopublish-note">
              {withLink(tr('site.token.autoNote'), { b: <b>{tr('site.token.autoNoteTitle')}</b> })}
              <br /><b>{tr('site.token.autoOneSession')}</b> {tr('site.token.autoOneSessionBody')}
            </p>
          )}
          {perms.includes('publish') && !perms.includes('autopublish') && (
            <p className="fine" role="note" data-testid="agent-token-publish-note">
              {tr('site.token.publishNote')}
            </p>
          )}
        </fieldset>
        <p className="fine" role="note" data-testid="agent-token-session-guide">
          <b>{tr('site.token.sessionGuideTitle')}</b> {tr('site.token.sessionGuide')}
        </p>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !kinds.length || !perms.length} data-testid="agent-token-issue"><KeyRound size={16} aria-hidden="true" />{tr('site.token.issue')}</button>
        </div>
      </form>
      {issued && <ConnectBox key={issued.token} token={issued.token} agent={issued.agent} scope={issued.scope} school={school} />}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {tokens.length > 0 && (
        <Field label={tr('site.token.extendDays')} hint={tr('site.token.extendDaysHint')}>
          <select value={extendDays} onChange={(e) => setExtendDays(e.target.value)} data-testid="agent-token-extend-days">
            {DAYS.map((d) => <option key={d} value={d}>{dayLabel(tr, d)}</option>)}
          </select>
        </Field>
      )}
      {tokens.length > 0 && (
        <div className="table-wrap"><table className="grid-table" data-testid="agent-token-list">
          <thead><tr><th scope="col">{tr('common.name')}</th><th scope="col">{tr('integ.col.scope')}</th><th scope="col">{tr('integ.col.status')}</th><th scope="col">{tr('integ.col.expires')}</th><th scope="col">{tr('site.token.agent')}</th><th scope="col">{tr('integ.col.lastUsed')}</th><th scope="col">{tr('site.token.col.sessions')}</th><th scope="col">{tr('site.token.col.done')}</th><th scope="col"><span className="sr-only">{tr('site.token.col.actions')}</span></th></tr></thead>
          <tbody>
            {tokens.map((t) => {
              const st = state(t);
              return (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{t.kinds.map((k) => kindLabel(tr, k)).join('·')} · {t.keys ? t.keys.map((k) => `/${k}`).join(' ') : tr('integ.all')}<br /><span className="fine">{t.perms.map((p) => permLabel(tr, p)).join('·')}</span></td>
                  <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                  <td>{t.expires_at ? day(t.expires_at, locale) : tr('integ.noExpiry')}</td>
                  <td>{agentLabel(tr, t.agent_kind)}</td>
                  <td>{day(t.last_used_at, locale)}</td>
                  <td data-testid="agent-token-sessions">
                    {t.sessions.length === 0 ? <span className="fine">{tr('site.token.noRecord')}</span> : (
                      <ul className="fine">{t.sessions.map((x, k) => <li key={k}>{x.session_label ?? tr('site.token.noSessionName')} · {x.operator ?? tr('site.token.noOperator')} <span className="muted">{tr('site.token.sessionUses', { n: x.n })}</span></li>)}</ul>)}
                    {t.sessions.length >= 2 && !t.revoked_at && (
                      <StatusBadge tone={t.perms.includes('autopublish') ? 'danger' : 'warning'}>{t.perms.includes('autopublish') ? tr('site.token.sharedAuto') : tr('site.token.shared')}</StatusBadge>)}
                  </td>
                  <td>{tr('site.token.uses', { n: t.uses })}{t.recent.length > 0 && <ul className="fine">{t.recent.map((r, k) => <li key={k}>{did(tr, r)} · {day(r.created_at, locale)}{r.session_label || r.operator ? ` · ${[r.session_label, r.operator].filter(Boolean).join(' / ')}` : ''}</li>)}</ul>}</td>
                  <td>{!t.revoked_at && <span className="row-wrap">
                    <InstructionCopy t={t} school={school} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => extend(t.id)} aria-label={tr('site.token.extendAria', { name: t.label })}>{tr('site.token.extend')}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)} aria-label={tr('site.token.revokeAria', { name: t.label })}>{tr('integ.revoked')}</button>
                  </span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
