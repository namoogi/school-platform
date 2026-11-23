'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Bot, Copy, KeyRound } from 'lucide-react';
import { StatusBadge } from '@/components/ui';
import { Field } from '@/components/Field';

/**
 * 34차 외부 작업 토큰(ADR 0012) → 36차 'AI 작업 공간'(ADR 0013).
 * 학교 관리자가 자기 학교의 Claude Code·Codex 같은 에이전트에게 홈페이지 내용의 '시안'만 맡길 때 토큰을 발급한다.
 * 범위 = 항목 종류(동화·쪽·소식) × 주소(고르지 않으면 그 종류 모두) × 권한(읽기·파일 올리기·시안 저장).
 * 원문은 발급 직후 한 번만 보인다. 공개·설정·구성원·다른 학교는 어떤 토큰으로도 안 되고, 공개는 사람이 한다.
 */
export type TokenRow = {
  id: string; label: string; kinds: string[]; keys: string[] | null; perms: string[]; agent_kind: string; created_at: string; expires_at: string | null;
  revoked_at: string | null; last_used_at: string | null; uses: number;
  recent: { action: string; created_at: string; detail: Record<string, unknown> }[];
};
type Entry = { kind: string; key: string; title: string };

const AGENT: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', other: '기타' };
const KIND: Record<string, string> = { story: '성품 동화', page: '쪽', news: '소식' };
const PERM: Record<string, string> = { read: '읽기', upload: '파일 올리기', create: '만들기', edit: '고치기(내용·구조)', archive: '보관', publish: '공개(지시하면 바로)' };
const DAYS: { v: string; label: string }[] = [{ v: '7', label: '7일' }, { v: '30', label: '30일' }, { v: '90', label: '90일' }, { v: '365', label: '365일' }, { v: 'none', label: '무기한' }];
const ACT: Record<string, string> = { version: '판 시안', create: '새로 만듦', meta: '항목 정보 고침', archive: '보관', publish: '공개', unpublish: '공개 내림' };
const did = (r: TokenRow['recent'][number]) => {
  if (r.action === 'asset.upload') return `파일 올림(${r.detail.mime === 'application/pdf' ? 'PDF' : '그림'})`;
  const [, act] = r.action.split('.');
  const what = `${KIND[String(r.detail.kind ?? 'story')] ?? ''} /${String(r.detail.key ?? '')}`;
  if (act === 'publish') return `${what} ${String(r.detail.version ?? '')}판 공개`;
  if (act === 'version') return `${what} ${String(r.detail.version ?? '')}판 시안${r.detail.structure_changed ? ` (구조 바뀜: 블록 ${r.detail.blocks_before}→${r.detail.blocks_after})` : ''}`;
  return `${what} ${ACT[act] ?? act}`;
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
  const { soon, stale } = alertsOf(tokens, Date.now());
  if (!soon.length && !stale.length) return null;
  return (
    <div className="banner" data-tone="warning" role="status" data-testid="token-alerts">
      {soon.length > 0 && <p><b>작업 토큰 기한이 30일 안에 끝납니다:</b> {soon.map((t) => `${t.label}(${day(t.expires_at)})`).join(', ')}. 아래 'AI 작업 공간'에서 연장하거나 새로 발급하세요.</p>}
      {stale.length > 0 && <p><b>180일 넘게 쓰지 않은 무기한 토큰:</b> {stale.map((t) => t.label).join(', ')}. 쓰지 않으면 폐기하세요.</p>}
    </div>
  );
}

/** 38차: 항목 보관·되살리기 (학교 관리자). 공개 중이면 보관 단추가 잠긴다 */
export function ArchiveControl({ id, archived, live }: { id: string; archived: boolean; live: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function go(next: boolean) {
    setErr(null);
    try { await send(`/api/site/entries/${id}/archive`, { archived: next }); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  return (
    <div className={archived ? 'banner' : 'archive-control'} data-tone={archived ? 'info' : undefined} data-testid="archive-control">
      {archived
        ? <><p><b>보관함에 있는 항목입니다.</b> 방문자에게 보이지 않고 판 기록은 모두 남아 있습니다.</p>
            <div className="form-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => go(false)}><ArchiveRestore size={14} aria-hidden="true" />되살리기</button></div></>
        : <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(true)} disabled={live} title={live ? '공개를 내린 뒤 보관할 수 있습니다' : undefined}>
              <Archive size={14} aria-hidden="true" />보관함으로{live ? ' (공개를 내린 뒤)' : ''}
            </button>
          </div>}
      {err && <p className="ui-error" role="alert">{err}</p>}
    </div>
  );
}

async function send(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}
function day(s: string | null) { return s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function AgentTokenPanel({ tokens, entries, stories }: { tokens: TokenRow[]; entries: Entry[]; stories: boolean }) {
  const router = useRouter();
  const kindChoices = stories ? ['story', 'page', 'news'] : ['page', 'news'];
  const [label, setLabel] = useState('동화 그림·PDF 작업');
  const [agent, setAgent] = useState('codex');
  const [days, setDays] = useState('7');
  const [extendDays, setExtendDays] = useState('365');
  const [kinds, setKinds] = useState<string[]>([kindChoices[0]]);
  const [keys, setKeys] = useState<string[]>([]);
  const [perms, setPerms] = useState<string[]>(['read', 'upload', 'edit']);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = entries.filter((e) => kinds.includes(e.kind));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setIssued(null); setCopied(false);
    const pickedKeys = keys.filter((k) => shown.some((s) => s.key === k));
    try { setIssued((await send('/api/site/agent-tokens', { label, days: days === 'none' ? null : Number(days), kinds, keys: pickedKeys, perms, agent_kind: agent })).token); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  async function extend(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/extend`, { days: extendDays === 'none' ? null : Number(extendDays) }); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  async function revoke(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/revoke`, {}); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  const now = Date.now();
  const state = (t: TokenRow) => t.revoked_at ? { label: '폐기', tone: 'neutral' as const }
    : t.expires_at && new Date(t.expires_at).getTime() < now ? { label: '기한 지남', tone: 'neutral' as const }
    : t.expires_at && new Date(t.expires_at).getTime() - now <= 30 * DAY_MS ? { label: '곧 끝남', tone: 'warning' as const } : { label: '사용 가능', tone: 'success' as const };

  return (
    <section className="card site-form" data-testid="agent-tokens">
      <h2><Bot size={20} aria-hidden="true" /> AI 작업 공간</h2>
      <p className="fine">
        학교가 쓰는 Claude Code·Codex 같은 에이전트에게 홈페이지 내용의 <b>시안</b>만 맡깁니다. 토큰으로는 고른 항목을 읽고, 그림·PDF를 올리고,
        새 판(시안)을 저장하는 일만 됩니다. 공개·설정·구성원·다른 학교는 할 수 없습니다. 시안을 확인한 뒤 해당 함에서 직접 공개하세요.
        에이전트 안내: 저장소의 <code>docs/agents/claude-code.md</code>, <code>docs/agents/codex.md</code>
      </p>
      <form onSubmit={issue} className="site-form-fields">
        <Field label="이름" required hint="무엇을 맡기는지 알아보기 쉽게" count={{ value: label.length, max: 80 }}>
          <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="에이전트">
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {Object.entries(AGENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="기한" hint={days === 'none' || days === '365'
          ? <span data-testid="agent-token-long-warning">긴 기한·무기한 토큰은 새어 나가면 폐기할 때까지 쓸 수 있습니다. 권한은 필요한 만큼만 고르고, 목록의 '마지막 사용'을 가끔 확인하세요.</span>
          : '짧을수록 안전합니다. 끝나기 전에 연장할 수 있습니다.'}>
          <select value={days} onChange={(e) => setDays(e.target.value)} data-testid="agent-token-days">
            {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </Field>
        <fieldset data-testid="agent-token-kinds">
          <legend>맡길 종류</legend>
          <div className="row-wrap">
            {kindChoices.map((k) => (
              <label key={k} className="radio"><input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} />{KIND[k]}</label>
            ))}
          </div>
        </fieldset>
        <fieldset data-testid="agent-token-keys">
          <legend>맡길 항목 (고르지 않으면 고른 종류 모두)</legend>
          {shown.length === 0
            ? <p className="fine">고른 종류에 아직 항목이 없습니다.</p>
            : <div className="row-wrap">
                {shown.map((e) => (
                  <label key={`${e.kind}:${e.key}`} className="radio">
                    <input type="checkbox" checked={keys.includes(e.key)} onChange={() => setKeys(toggle(keys, e.key))} />{e.title} (/{e.key})
                  </label>
                ))}
              </div>}
        </fieldset>
        <fieldset data-testid="agent-token-perms">
          <legend>권한</legend>
          <div className="row-wrap">
            {Object.entries(PERM).map(([k, v]) => (
              <label key={k} className="radio"><input type="checkbox" checked={perms.includes(k)} onChange={() => setPerms(toggle(perms, k))} />{v}</label>
            ))}
          </div>
          {perms.includes('publish') && (
            <p className="fine" role="note" data-testid="agent-token-publish-note">
              '공개' 권한이 있으면 에이전트에게 공개를 지시했을 때 이 사이트에서 누르지 않아도 바로 방문자에게 보입니다. 만들기·고치기만으로는 공개되지 않습니다.
              공개 기록·활동 기록에 남고, 공개 내림은 언제든 여기서 할 수 있습니다.
            </p>
          )}
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !kinds.length || !perms.length} data-testid="agent-token-issue"><KeyRound size={16} aria-hidden="true" />토큰 발급</button>
        </div>
      </form>
      {issued && (
        <div className="banner" data-tone="warning" role="status">
          <p><b>지금 한 번만 보입니다.</b> 복사해서 에이전트 쪽 환경 변수 <code>SCHOOL_AGENT_TOKEN</code>에 넣으세요. 채팅·문서·저장소에 붙여 넣지 마세요.</p>
          <p><code data-testid="agent-token-value" style={{ wordBreak: 'break-all' }}>{issued}</code></p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(issued).then(() => setCopied(true))}>
              <Copy size={14} aria-hidden="true" />{copied ? '복사했습니다' : '복사'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {tokens.length > 0 && (
        <Field label="연장 기한" hint="목록의 '연장' 단추에 씁니다. 남은 기한 끝부터 늘립니다(토큰 값은 그대로).">
          <select value={extendDays} onChange={(e) => setExtendDays(e.target.value)} data-testid="agent-token-extend-days">
            {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </Field>
      )}
      {tokens.length > 0 && (
        <div className="table-wrap"><table className="grid-table" data-testid="agent-token-list">
          <thead><tr><th scope="col">이름</th><th scope="col">범위</th><th scope="col">상태</th><th scope="col">기한</th><th scope="col">에이전트</th><th scope="col">마지막 사용</th><th scope="col">한 일</th><th scope="col"><span className="sr-only">폐기</span></th></tr></thead>
          <tbody>
            {tokens.map((t) => {
              const st = state(t);
              return (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{t.kinds.map((k) => KIND[k] ?? k).join('·')} · {t.keys ? t.keys.map((k) => `/${k}`).join(' ') : '모두'}<br /><span className="fine">{t.perms.map((p) => PERM[p] ?? p).join('·')}</span></td>
                  <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                  <td>{t.expires_at ? day(t.expires_at) : '무기한'}</td>
                  <td>{AGENT[t.agent_kind] ?? t.agent_kind}</td>
                  <td>{day(t.last_used_at)}</td>
                  <td>{t.uses}건{t.recent.length > 0 && <ul className="fine">{t.recent.map((r, k) => <li key={k}>{did(r)} · {day(r.created_at)}</li>)}</ul>}</td>
                  <td>{!t.revoked_at && <span className="row-wrap">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => extend(t.id)} aria-label={`${t.label} 기한 연장`}>연장</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)} aria-label={`${t.label} 폐기`}>폐기</button>
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
