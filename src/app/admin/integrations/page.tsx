import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { overview } from '@/lib/admin';
import { LINK_KINDS, LINK_STATUS, listLinks, sessionPrompt } from '@/lib/devlinks';
import { isUuid } from '@/lib/services';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { AddLinkForm, CopyBox, LinkActions } from './IntegrationsClient';
import { InspectorPanel } from './InspectorPanel';
import { listInspectorTokens } from '@/lib/inspector';
import { INSPECTOR_ID } from '@/lib/db';
import { platformAgentTokens, tokenAlerts } from '@/lib/agent';

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school: selected } = await searchParams;
  const { schools, links, tokens, account, agentTokens } = await loadForPlatform(async ({ db }) => {
    const schools = await overview(db);
    const id = selected && isUuid(selected) && schools.some((s) => s.id === selected) ? selected : schools[0]?.id;
    return { schools, links: id ? await listLinks(db, id, true) : [], tokens: await listInspectorTokens(db), agentTokens: await platformAgentTokens(db) };
  });
  const current = schools.find((s) => s.id === (selected && schools.some((x) => x.id === selected) ? selected : schools[0]?.id));
  const kinds = Object.fromEntries(Object.entries(LINK_KINDS).map(([k, v]) => [k, { label: v.label, example: v.example }]));
  return (
    <>
      <PageHeader title="학교별 개발 연동" crumbs={[{ label: '전체 관리' }, { label: '학교별 개발 연동' }]}
        description="학교마다 전용 GitHub 저장소, Claude Code 세션, Codex 환경, Vercel·Supabase 프로젝트를 연결하고, 그 학교 작업용 세션을 여는 요청 문구를 만듭니다. 주소와 설명만 저장하고 토큰·키는 저장하지 않습니다." />
      <nav className="tabs" aria-label="학교 선택">
        {schools.map((s) => (
          <Link key={s.id} href={`/admin/integrations?school=${s.id}`} aria-current={s.id === current?.id ? 'page' : undefined} className={s.id === current?.id ? 'active' : ''}>{s.name}</Link>
        ))}
      </nav>
      {!current ? <EmptyState title="학교가 없습니다">학교·라이선스에서 먼저 학교를 만드세요.</EmptyState> : (
        <div className="grid-2">
          <section className="card" data-testid="dev-links">
            <div className="card-header"><h2>{current.name} 연동</h2><span className="fine">{links.filter((l) => l.status !== 'archived').length}개 사용</span></div>
            {links.length === 0 && <p className="muted">아직 연결한 자원이 없습니다.</p>}
            <div className="table-wrap">
              <table className="grid-table">
                <thead><tr><th scope="col">종류</th><th scope="col">이름·주소</th><th scope="col">상태</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{LINK_KINDS[l.kind].label}</td>
                      <td><strong>{l.label}</strong><small><a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></small>{l.notes && <small>{l.notes}</small>}</td>
                      <td><StatusBadge tone={l.status === 'active' ? 'success' : l.status === 'planned' ? 'info' : 'neutral'}>{LINK_STATUS[l.status]}</StatusBadge></td>
                      <td><LinkActions id={l.id} status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddLinkForm schoolId={current.id} kinds={kinds} />
          </section>
          <section className="card">
            <div className="card-header"><h2>이 학교 작업 세션 열기</h2></div>
            <p className="fine">Claude Code(claude.ai/code)나 Codex에서 새 작업을 열 때 붙여 넣는 문구입니다. 세션을 연 뒤 그 주소를 왼쪽 연동에 'Claude Code 세션'·'Codex 환경'으로 등록하면 학교별로 추적됩니다.</p>
            <CopyBox label="Claude Code 요청" text={sessionPrompt(current, links, 'claude')} />
            <CopyBox label="Codex 요청" text={sessionPrompt(current, links, 'codex')} />
          </section>
        </div>
      )}
      <AgentTokensOverview tokens={agentTokens} />
      <InspectorPanel tokens={JSON.parse(JSON.stringify(tokens))} readOnly={account.id === INSPECTOR_ID} />
    </>
  );
}

const KIND: Record<string, string> = { story: '동화', page: '쪽', news: '소식' };
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '—');

/** 38차(ADR 0014): 모든 학교의 AI 작업 공간 토큰 — 연례 점검(만료 임박 · 오래 안 쓴 무기한) */
function AgentTokensOverview({ tokens }: { tokens: Awaited<ReturnType<typeof platformAgentTokens>> }) {
  const { soon, stale } = tokenAlerts(tokens);
  const flag = (id: string) => (soon.some((t) => t.id === id) ? '곧 끝남' : stale.some((t) => t.id === id) ? '오래 안 씀' : null);
  return (
    <section className="card" data-testid="platform-agent-tokens">
      <div className="card-header"><h2>학교 AI 작업 공간 토큰</h2><span className="fine">점검 필요 {soon.length + stale.length}개</span></div>
      <p className="fine">학교 관리자가 발급한 작업 토큰입니다. 기한이 30일 안에 끝나는 것과, 180일 넘게 쓰지 않은 무기한 토큰을 표시합니다. 연장·폐기는 각 학교 관리자가 /site 설정에서 합니다.</p>
      {tokens.length === 0 ? <p className="muted">발급한 토큰이 없습니다.</p> : (
        <div className="table-wrap">
          <table className="grid-table">
            <thead><tr><th scope="col">학교</th><th scope="col">이름</th><th scope="col">범위</th><th scope="col">기한</th><th scope="col">마지막 사용</th><th scope="col">상태</th></tr></thead>
            <tbody>
              {tokens.map((t) => {
                const f = flag(t.id);
                return (
                  <tr key={t.id}>
                    <td>{t.school_name}</td>
                    <td>{t.label}</td>
                    <td>{t.kinds.map((k) => KIND[k] ?? k).join('·')} · {t.keys ? t.keys.map((k) => `/${k}`).join(' ') : '모두'}</td>
                    <td>{t.expires_at ? day(t.expires_at) : '무기한'}</td>
                    <td>{day(t.last_used_at)}</td>
                    <td>{t.revoked_at ? <StatusBadge tone="neutral">폐기</StatusBadge>
                      : t.expires_at && new Date(t.expires_at) < new Date() ? <StatusBadge tone="neutral">기한 지남</StatusBadge>
                      : f ? <StatusBadge tone="warning">{f}</StatusBadge> : <StatusBadge tone="success">사용 가능</StatusBadge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
