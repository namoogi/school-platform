'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Copy, KeyRound } from 'lucide-react';
import { StatusBadge } from '@/components/ui';

/**
 * 34차 외부 작업 토큰(ADR 0012) → 36차 'AI 작업 공간'(ADR 0013).
 * 학교 관리자가 자기 학교의 Claude Code·Codex 같은 에이전트에게 홈페이지 내용의 '시안'만 맡길 때 토큰을 발급한다.
 * 범위 = 항목 종류(동화·쪽·소식) × 주소(고르지 않으면 그 종류 모두) × 권한(읽기·파일 올리기·시안 저장).
 * 원문은 발급 직후 한 번만 보인다. 공개·설정·구성원·다른 학교는 어떤 토큰으로도 안 되고, 공개는 사람이 한다.
 */
export type TokenRow = {
  id: string; label: string; kinds: string[]; keys: string[] | null; perms: string[]; agent_kind: string; created_at: string; expires_at: string;
  revoked_at: string | null; last_used_at: string | null; uses: number;
  recent: { action: string; created_at: string; detail: Record<string, unknown> }[];
};
type Entry = { kind: string; key: string; title: string };

const AGENT: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', other: '기타' };
const KIND: Record<string, string> = { story: '성품 동화', page: '쪽', news: '소식' };
const PERM: Record<string, string> = { read: '읽기', upload: '파일 올리기', draft: '시안 저장' };
const did = (r: TokenRow['recent'][number]) => r.action === 'asset.upload'
  ? `파일 올림(${r.detail.mime === 'application/pdf' ? 'PDF' : '그림'})`
  : `${KIND[String(r.detail.kind ?? 'story')] ?? ''} /${String(r.detail.key ?? '')} ${String(r.detail.version ?? '')}판 시안`;

async function send(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}
const day = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function AgentTokenPanel({ tokens, entries, stories }: { tokens: TokenRow[]; entries: Entry[]; stories: boolean }) {
  const router = useRouter();
  const kindChoices = stories ? ['story', 'page', 'news'] : ['page', 'news'];
  const [label, setLabel] = useState('동화 그림·PDF 작업');
  const [agent, setAgent] = useState('codex');
  const [days, setDays] = useState(7);
  const [kinds, setKinds] = useState<string[]>([kindChoices[0]]);
  const [keys, setKeys] = useState<string[]>([]);
  const [perms, setPerms] = useState<string[]>(['read', 'upload', 'draft']);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = entries.filter((e) => kinds.includes(e.kind));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setIssued(null); setCopied(false);
    const pickedKeys = keys.filter((k) => shown.some((s) => s.key === k));
    try { setIssued((await send('/api/site/agent-tokens', { label, days, kinds, keys: pickedKeys, perms, agent_kind: agent })).token); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/revoke`, {}); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  const now = Date.now();
  const state = (t: TokenRow) => t.revoked_at ? { label: '폐기', tone: 'neutral' as const }
    : new Date(t.expires_at).getTime() < now ? { label: '기한 지남', tone: 'neutral' as const } : { label: '사용 가능', tone: 'success' as const };

  return (
    <section className="card site-form" data-testid="agent-tokens">
      <h2><Bot size={20} aria-hidden="true" /> AI 작업 공간</h2>
      <p className="fine">
        학교가 쓰는 Claude Code·Codex 같은 에이전트에게 홈페이지 내용의 <b>시안</b>만 맡깁니다. 토큰으로는 고른 항목을 읽고, 그림·PDF를 올리고,
        새 판(시안)을 저장하는 일만 됩니다. 공개·설정·구성원·다른 학교는 할 수 없습니다. 시안을 확인한 뒤 해당 함에서 직접 공개하세요.
        에이전트 안내: 저장소의 <code>docs/agents/claude-code.md</code>, <code>docs/agents/codex.md</code>
      </p>
      <form onSubmit={issue} className="site-form-fields">
        <label>이름<input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} required /></label>
        <label>에이전트
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {Object.entries(AGENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>기한
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7일</option><option value={30}>30일</option><option value={90}>90일</option>
          </select>
        </label>
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
                  <td>{day(t.expires_at)}</td>
                  <td>{AGENT[t.agent_kind] ?? t.agent_kind}</td>
                  <td>{day(t.last_used_at)}</td>
                  <td>{t.uses}건{t.recent.length > 0 && <ul className="fine">{t.recent.map((r, k) => <li key={k}>{did(r)} · {day(r.created_at)}</li>)}</ul>}</td>
                  <td>{!t.revoked_at && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)} aria-label={`${t.label} 폐기`}>폐기</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
