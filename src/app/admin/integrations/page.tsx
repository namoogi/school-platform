import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { overview } from '@/lib/admin';
import { LINK_KINDS, listLinks, sessionPrompt } from '@/lib/devlinks';
import { isUuid } from '@/lib/services';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { AddLinkForm, CopyBox, LinkActions } from './IntegrationsClient';
import { InspectorPanel } from './InspectorPanel';
import { listInspectorTokens } from '@/lib/inspector';
import { INSPECTOR_ID } from '@/lib/db';
import { platformAgentTokens, tokenAlerts } from '@/lib/agent';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { Translate } from '@/lib/i18n/base';
import type { MsgKey } from '@/lib/i18n/catalog';

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school: selected } = await searchParams;
  const { schools, links, tokens, account, agentTokens, uiLang } = await loadForPlatform(async ({ db }) => {
    const schools = await overview(db);
    const id = selected && isUuid(selected) && schools.some((s) => s.id === selected) ? selected : schools[0]?.id;
    return { schools, uiLang: await userLang(db), links: id ? await listLinks(db, id, true) : [], tokens: await listInspectorTokens(db), agentTokens: await platformAgentTokens(db) };
  });
  const current = schools.find((s) => s.id === (selected && schools.some((x) => x.id === selected) ? selected : schools[0]?.id));
  const { t, locale } = await getI18n(uiLang);
  // 연동 종류·상태 이름은 사전의 devlink.kind.* · devlink.status.*
  const kindName = (k: string) => t(`devlink.kind.${k}` as MsgKey);
  const kinds = Object.fromEntries(Object.entries(LINK_KINDS).map(([k, v]) => [k, { label: kindName(k), example: v.example }]));
  return (
    <>
      <PageHeader title={t('nav.integrations.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.integrations.title') }]}
        description={t('integ.lead')} />
      <nav className="tabs" aria-label={t('integ.pickSchool')}>
        {schools.map((s) => (
          <Link key={s.id} href={`/admin/integrations?school=${s.id}`} aria-current={s.id === current?.id ? 'page' : undefined} className={s.id === current?.id ? 'active' : ''}>{s.name}</Link>
        ))}
      </nav>
      {!current ? <EmptyState title={t('integ.noSchoolsTitle')}>{t('integ.noSchoolsBody')}</EmptyState> : (
        <div className="grid-2">
          <section className="card" data-testid="dev-links">
            <div className="card-header"><h2>{t('integ.linksTitle', { name: current.name })}</h2><span className="fine">{t('integ.inUse', { n: links.filter((l) => l.status !== 'archived').length })}</span></div>
            {links.length === 0 && <p className="muted">{t('integ.noLinks')}</p>}
            <div className="table-wrap">
              <table className="grid-table">
                <thead><tr><th scope="col">{t('integ.col.kind')}</th><th scope="col">{t('integ.col.label')}</th><th scope="col">{t('integ.col.status')}</th><th scope="col"><span className="sr-only">{t('integ.col.actions')}</span></th></tr></thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{kindName(l.kind)}</td>
                      <td><strong>{l.label}</strong><small><a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></small>{l.notes && <small>{l.notes}</small>}</td>
                      <td><StatusBadge tone={l.status === 'active' ? 'success' : l.status === 'planned' ? 'info' : 'neutral'}>{t(`devlink.status.${l.status}` as MsgKey)}</StatusBadge></td>
                      <td><LinkActions id={l.id} status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddLinkForm schoolId={current.id} kinds={kinds} />
          </section>
          <section className="card">
            <div className="card-header"><h2>{t('integ.openSession')}</h2></div>
            <p className="fine">{t('integ.openNote')}</p>
            <CopyBox label={t('integ.claudePrompt')} text={sessionPrompt(current, links, 'claude')} />
            <CopyBox label={t('integ.codexPrompt')} text={sessionPrompt(current, links, 'codex')} />
          </section>
        </div>
      )}
      <AgentTokensOverview tokens={agentTokens} t={t} locale={locale} />
      <InspectorPanel tokens={JSON.parse(JSON.stringify(tokens))} readOnly={account.id === INSPECTOR_ID} />
    </>
  );
}

// 토큰 종류 이름은 사전의 integ.kind.*
const TOKEN_KINDS = ['story', 'page', 'news'];

/** 38차(ADR 0014): 모든 학교의 AI 작업 공간 토큰 — 연례 점검(만료 임박 · 오래 안 쓴 무기한) */
function AgentTokensOverview({ tokens, t, locale }: { tokens: Awaited<ReturnType<typeof platformAgentTokens>>; t: Translate; locale: string }) {
  const day = (s: string | null) => (s ? new Date(s).toLocaleDateString(locale) : '—');
  const { soon, stale } = tokenAlerts(tokens);
  const flag = (id: string) => (soon.some((x) => x.id === id) ? t('integ.soon') : stale.some((x) => x.id === id) ? t('integ.stale') : null);
  return (
    <section className="card" data-testid="platform-agent-tokens">
      <div className="card-header"><h2>{t('integ.tokens')}</h2><span className="fine">{t('integ.needCheck', { n: soon.length + stale.length })}</span></div>
      <p className="fine">{t('integ.tokensNote')}</p>
      {tokens.length === 0 ? <p className="muted">{t('integ.noTokens')}</p> : (
        <div className="table-wrap">
          <table className="grid-table">
            <thead><tr><th scope="col">{t('integ.col.school')}</th><th scope="col">{t('integ.col.name')}</th><th scope="col">{t('integ.col.scope')}</th><th scope="col">{t('integ.col.expires')}</th><th scope="col">{t('integ.col.lastUsed')}</th><th scope="col">{t('integ.col.status')}</th></tr></thead>
            <tbody>
              {tokens.map((tk) => {
                const f = flag(tk.id);
                return (
                  <tr key={tk.id}>
                    <td>{tk.school_name}</td>
                    <td>{tk.label}</td>
                    <td>{tk.kinds.map((k) => (TOKEN_KINDS.includes(k) ? t(`integ.kind.${k}` as MsgKey) : k)).join('·')} · {tk.keys ? tk.keys.map((k) => `/${k}`).join(' ') : t('integ.all')}</td>
                    <td>{tk.expires_at ? day(tk.expires_at) : t('integ.noExpiry')}</td>
                    <td>{day(tk.last_used_at)}</td>
                    <td>{tk.revoked_at ? <StatusBadge tone="neutral">{t('integ.revoked')}</StatusBadge>
                      : tk.expires_at && new Date(tk.expires_at) < new Date() ? <StatusBadge tone="neutral">{t('integ.expired')}</StatusBadge>
                      : f ? <StatusBadge tone="warning">{f}</StatusBadge> : <StatusBadge tone="success">{t('integ.usable')}</StatusBadge>}</td>
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
