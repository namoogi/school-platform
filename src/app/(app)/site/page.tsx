import { hostForSlug } from '@/lib/site-hosts';
import Link from 'next/link';
import { BookHeart, FileText, Megaphone, MonitorSmartphone, Settings2, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { getEntry, getSettings, listAssets, listEntries, pick, type EntryKind, type EntryStatus } from '@/lib/site';
import { EmptyState, StatusBadge } from '@/components/ui';
import { TriageKeys } from '../review/TriageKeys';
import { EntryEditor, EntryPublishControl, NewEntryForm, SiteSettingsForm } from './SiteClient';
import { BulkPublishControl } from './BulkPublishControl';
import { ImportPanel } from './ImportClient';
import { AgentTokenPanel, ArchiveControl, TokenAlerts } from './AgentTokenClient';
import { listAgentTokens } from '@/lib/agent';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

export const dynamic = 'force-dynamic';

type Box = 'settings' | EntryKind;
// 상태 이름은 site.status.<값> 이름표로 보인다
const STATUS_TONE: Record<EntryStatus, 'neutral' | 'success' | 'warning' | 'info'> = {
  draft: 'neutral', live: 'success', changed: 'warning', hidden: 'info',
};
const ICON: Record<Box, LucideIcon> = { settings: Settings2, page: FileText, news: Megaphone, story: BookHeart };

/**
 * 27차 학교 홈페이지 관리 (ADR 0008): 함(설정·쪽·소식·성품 동화) → 목록 → 편집.
 * 편집은 새 판으로 쌓이고, 공개는 학교 관리자가 판을 골라 한다. 방문자에게는 공개한 판만 보인다.
 */
export default async function SiteAdminPage({ searchParams }: { searchParams: Promise<{ box?: string; id?: string; new?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { school, settings, entries, assets, detail, tokens, newInquiries, uiLang } = await loadForPage(async ({ db, school }) => {
    const entries = await listEntries(db, school.id);
    const pickId = sp.id && entries.some((e) => e.id === sp.id) ? sp.id : undefined;
    return {
      uiLang: await userLang(db),
      settings: await getSettings(db, school.id),
      entries,
      assets: await listAssets(db, school.id),
      detail: pickId ? await getEntry(db, school.id, pickId) : null,
      // 34·35차: AI 작업 공간(작업 토큰)은 학교 관리자만 본다(RLS도 관리자만)
      tokens: school.isAdmin && sp.box === 'settings' ? await listAgentTokens(db, school.id) : null,
      // 91차: 처리하지 않은 방문·상담 신청 수(학교 관리자만, RLS도 관리자만)
      newInquiries: school.isAdmin ? Number((await db.query(`select count(*) as n from public.site_inquiries where school_id = $1 and status = 'new'`, [school.id])).rows[0].n) : 0,
    };
  }, { module: 'homepage' });
  const { t } = await getI18n(uiLang, school.locale);
  const kindLabel = (k: EntryKind) => t(`site.kind.${k}` as MsgKey);

  const boxes: Box[] = ['settings', 'page', 'news', ...(school.modules.includes('stories') ? ['story' as const] : [])];
  const box: Box = boxes.includes(sp.box as Box) ? (sp.box as Box) : settings ? 'page' : 'settings';
  // 38차: 보관한 항목은 목록 아래 '보관함'으로
  const list = box === 'settings' ? [] : entries.filter((e) => e.kind === box && !e.archived_at);
  const archivedList = box === 'settings' ? [] : entries.filter((e) => e.kind === box && e.archived_at);
  const selected = box === 'settings' ? undefined : (detail && detail.entry.kind === box ? detail : null);
  const href = (b: Box, id?: string) => `/site?box=${b}${id ? `&id=${id}` : ''}`;
  const lang = settings?.default_lang ?? 'ko';
  // 47차: 학교 자체 주소가 연결돼 있으면 그 주소를 보인다(예: https://rungarunsuksa.vercel.app)
  const ownHost = settings ? hostForSlug(settings.public_slug) : null;
  const publicUrl = settings ? (ownHost ? `https://${ownHost}` : `/s/${settings.public_slug}`) : null;

  return (
    <div className="triage" data-testid="site-admin">
      <header className="triage-head">
        <div>
          <h1>{t('site.home.title')}</h1>
          <p className="fine">{t('site.home.lead')}</p>
        </div>
        <Link className="btn btn-sm" href="/site/templates" data-testid="site-templates-link">{t('site.home.templates')}</Link>
        {school.isAdmin && <Link className="btn btn-sm" href="/site/inquiries" data-testid="site-inquiries-link">{newInquiries ? t('site.home.inquiriesWithNew', { n: newInquiries }) : t('site.home.inquiries')}</Link>}
        {publicUrl && (settings!.is_open
          ? <Link className="btn btn-secondary btn-sm" href={publicUrl} target="_blank" data-testid="public-link">{t('site.home.openPublic')}{ownHost ? ` · ${ownHost}` : ''}</Link>
          : <StatusBadge tone="neutral">{t('site.home.closedBadge')}</StatusBadge>)}
      </header>

      <nav className="triage-boxes" aria-label={t('site.home.boxesNav')}>
        {boxes.map((b) => {
          const Icon = ICON[b];
          return (
            <Link key={b} href={href(b)} className="triage-box" aria-current={b === box ? 'page' : undefined}>
              <Icon size={18} aria-hidden="true" /><span>{b === 'settings' ? t('site.home.settings') : kindLabel(b)}</span>
              <span className="triage-count">{b === 'settings' ? (settings?.is_open ? t('site.home.open') : t('site.home.closed')) : entries.filter((e) => e.kind === b && !e.archived_at).length}</span>
            </Link>
          );
        })}
      </nav>

      <section className="triage-list" aria-label={t('site.home.listAria')}>
        {box === 'settings'
          ? <p className="triage-empty">{t('site.home.settingsHint')}</p>
          : <>
              <NewEntryForm kind={box} disabled={!settings} initialOpen={sp.new === '1'} />
              {school.isAdmin && box === 'story' && <BulkPublishControl candidates={list
                .filter((e) => e.status === 'draft' || e.status === 'changed')
                .map((e) => ({ id: e.id, title: pick(e.latest_title, lang, lang) || e.key, base_version: e.latest_version, live_version: e.live_version }))} />}

              <ul>
                {list.map((e) => (
                  <li key={e.id} className="site-entry-card" data-selected={e.id === selected?.entry.id ? 'true' : undefined}>
                    <Link href={href(box, e.id)} className="triage-item" aria-current={e.id === selected?.entry.id ? 'true' : undefined}>
                      <span className="triage-item-top"><StatusBadge tone={STATUS_TONE[e.status]}>{t(`site.status.${e.status}` as MsgKey)}</StatusBadge><span className="triage-time">{t('common.version', { v: e.latest_version })}</span></span>
                      <span className="triage-item-title">{pick(e.latest_title, lang, lang) || e.key}</span>
                      <span className="triage-item-sub">/{e.key}{e.visibility === 'unlisted' ? ` · ${t('site.home.unlisted')}` : ''}{typeof e.meta.virtue === 'string' && e.meta.virtue ? ` · ${e.meta.virtue}` : ''}</span>
                    </Link>
                    <Link href={`/site/edit/${e.id}`} className="site-row-live" data-testid="row-live-edit">
                      <MonitorSmartphone size={16} aria-hidden="true" />{t('site.home.rowLiveEdit')}<span className="sr-only">{t('site.home.rowLiveEditSr', { title: pick(e.latest_title, lang, lang) || e.key })}</span></Link>
                    {school.isAdmin && box === 'story' && <EntryPublishControl id={e.id}
                      title={pick(e.latest_title, lang, lang) || e.key} latestVersion={e.latest_version} liveVersion={e.live_version} />}
                  </li>
                ))}
              </ul>
              {list.length === 0 && <p className="triage-empty">{settings ? t('site.home.emptyList') : t('site.home.needSettings')}</p>}
              {archivedList.length > 0 && (
                <details className="triage-archive" data-testid="archive-box" open={!!selected?.entry.archived_at}>
                  <summary>{t('site.home.archiveBox', { n: archivedList.length })}</summary>
                  <ul>{archivedList.map((e) => (
                    <li key={e.id}><Link href={href(box, e.id)} className="triage-item" aria-current={e.id === selected?.entry.id ? 'true' : undefined}>
                      <span className="triage-item-title">{pick(e.latest_title, lang, lang) || e.key}</span><span className="triage-item-sub">/{e.key} · {t('site.home.archived')}</span>
                    </Link></li>))}</ul>
                </details>
              )}
            </>}
      </section>

      <section className="triage-detail" aria-label={t('site.home.editAria')}>
        <div className="triage-pad">
          {box === 'settings'
            ? (school.isAdmin
                ? <>
                    {/* 가져오기 등으로 설정이 바뀌면 양식을 새 값으로 다시 연다(예전 값으로 덮어쓰지 않게) */}
                    {tokens && <TokenAlerts tokens={JSON.parse(JSON.stringify(tokens))} />}
                    <SiteSettingsForm key={settings?.updated_at ?? 'new'} initial={settings ? JSON.parse(JSON.stringify(settings)) : null} schoolName={school.name} saved={sp.saved === '1'} />
                    {settings && <ImportPanel settings={JSON.parse(JSON.stringify(settings))} existing={entries.map((e) => ({ id: e.id, kind: e.kind, key: e.key }))} />}
                    {tokens && <AgentTokenPanel tokens={JSON.parse(JSON.stringify(tokens))}
                      stories={school.modules.includes('stories')} records={school.modules.includes('records')}
                      school={{ name: school.name, slug: settings?.public_slug ?? null }}
                      entries={entries.map((e) => ({ kind: e.kind, key: e.key, title: pick(e.latest_title, lang, lang) || e.key }))} />}
                  </>
                : <EmptyState title={t('site.home.settingsAdminOnly')}>{t('site.home.settingsAdminOnlyBody')}</EmptyState>)
            : selected
              ? <>
                <nav className="site-view-switch" aria-label={t('site.home.viewSwitch')} data-testid="view-switch">
                  <span aria-current="page">{t('site.home.editByField')}</span>
                  <Link href={`/site/edit/${selected.entry.id}`} data-testid="live-edit-link"><MonitorSmartphone size={16} aria-hidden="true" />{t('site.home.editOnScreen')}</Link>
                </nav>
                {school.isAdmin && <ArchiveControl id={selected.entry.id} archived={!!selected.entry.archived_at} live={!!selected.liveVersionId} />}
                <EntryEditor key={selected.entry.id} detail={JSON.parse(JSON.stringify(selected))}
                  langs={settings?.langs ?? ['ko']} canPublish={school.isAdmin} assets={JSON.parse(JSON.stringify(assets))}
                  menuParents={entries.filter((e) => e.kind === 'page' && e.key !== 'home' && e.key !== 'news' && e.id !== selected.entry.id && !e.archived_at).map((e) => ({ key: e.key, title: e.latest_title[settings?.default_lang ?? 'ko'] || Object.values(e.latest_title)[0] || e.key }))}
                  publicHref={settings?.is_open ? `${publicUrl}${box === 'page' ? (selected.entry.key === 'home' ? '' : `/p/${selected.entry.key}`) : box === 'news' ? `/news/${selected.entry.key}` : `/stories/${selected.entry.key}`}` : null} /></>
              : <EmptyState title={t('site.home.pickTitle')}>{t('site.home.pickBody')}</EmptyState>}
        </div>
      </section>
      <TriageKeys hrefs={list.map((e) => href(box, e.id))} current={selected ? href(box, selected.entry.id) : null} />
    </div>
  );
}
