import Link from 'next/link';
import { BookHeart, FileText, Megaphone, Settings2, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { getEntry, getSettings, KIND_LABEL, listAssets, listEntries, pick, type EntryKind, type EntryStatus } from '@/lib/site';
import { EmptyState, StatusBadge } from '@/components/ui';
import { TriageKeys } from '../review/TriageKeys';
import { EntryEditor, NewEntryForm, SiteSettingsForm } from './SiteClient';
import { ImportPanel } from './ImportClient';
import { AgentTokenPanel } from './AgentTokenClient';
import { listAgentTokens } from '@/lib/agent';

export const dynamic = 'force-dynamic';

type Box = 'settings' | EntryKind;
const STATUS: Record<EntryStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'info' }> = {
  draft: { label: '시안', tone: 'neutral' }, live: { label: '공개 중', tone: 'success' },
  changed: { label: '공개 중 · 새 판 있음', tone: 'warning' }, hidden: { label: '공개 내림', tone: 'info' },
};
const ICON: Record<Box, LucideIcon> = { settings: Settings2, page: FileText, news: Megaphone, story: BookHeart };

/**
 * 27차 학교 홈페이지 관리 (ADR 0008): 함(설정·쪽·소식·성품 동화) → 목록 → 편집.
 * 편집은 새 판으로 쌓이고, 공개는 학교 관리자가 판을 골라 한다. 방문자에게는 공개한 판만 보인다.
 */
export default async function SiteAdminPage({ searchParams }: { searchParams: Promise<{ box?: string; id?: string }> }) {
  const sp = await searchParams;
  const { school, settings, entries, assets, detail, tokens } = await loadForPage(async ({ db, school }) => {
    const entries = await listEntries(db, school.id);
    const pickId = sp.id && entries.some((e) => e.id === sp.id) ? sp.id : undefined;
    return {
      settings: await getSettings(db, school.id),
      entries,
      assets: await listAssets(db, school.id),
      detail: pickId ? await getEntry(db, school.id, pickId) : null,
      // 34·35차: AI 작업 공간(작업 토큰)은 학교 관리자만 본다(RLS도 관리자만)
      tokens: school.isAdmin && sp.box === 'settings' ? await listAgentTokens(db, school.id) : null,
    };
  }, { module: 'homepage' });

  const boxes: Box[] = ['settings', 'page', 'news', ...(school.modules.includes('stories') ? ['story' as const] : [])];
  const box: Box = boxes.includes(sp.box as Box) ? (sp.box as Box) : settings ? 'page' : 'settings';
  const list = box === 'settings' ? [] : entries.filter((e) => e.kind === box);
  const selected = box === 'settings' ? undefined : (detail && detail.entry.kind === box ? detail : null);
  const href = (b: Box, id?: string) => `/site?box=${b}${id ? `&id=${id}` : ''}`;
  const lang = settings?.default_lang ?? 'ko';
  const publicUrl = settings ? `/s/${settings.public_slug}` : null;

  return (
    <div className="triage" data-testid="site-admin">
      <header className="triage-head">
        <div>
          <h1>학교 홈페이지</h1>
          <p className="fine">고칠 때마다 새 판으로 쌓이고, 방문자에게는 공개한 판만 보입니다. 공개·내림은 학교 관리자가 합니다.</p>
        </div>
        {publicUrl && (settings!.is_open
          ? <Link className="btn btn-secondary btn-sm" href={publicUrl} target="_blank" data-testid="public-link">공개 홈페이지 열기</Link>
          : <StatusBadge tone="neutral">홈페이지 닫힘</StatusBadge>)}
      </header>

      <nav className="triage-boxes" aria-label="홈페이지 함">
        {boxes.map((b) => {
          const Icon = ICON[b];
          return (
            <Link key={b} href={href(b)} className="triage-box" aria-current={b === box ? 'page' : undefined}>
              <Icon size={18} aria-hidden="true" /><span>{b === 'settings' ? '설정' : KIND_LABEL[b]}</span>
              <span className="triage-count">{b === 'settings' ? (settings?.is_open ? '열림' : '닫힘') : entries.filter((e) => e.kind === b).length}</span>
            </Link>
          );
        })}
      </nav>

      <section className="triage-list" aria-label="목록">
        {box === 'settings'
          ? <p className="triage-empty">홈페이지 주소·언어·이름을 정하고 열거나 닫습니다.</p>
          : <>
              <NewEntryForm kind={box} disabled={!settings} />
              <ul>
                {list.map((e) => (
                  <li key={e.id}>
                    <Link href={href(box, e.id)} className="triage-item" aria-current={e.id === selected?.entry.id ? 'true' : undefined}>
                      <span className="triage-item-top"><StatusBadge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusBadge><span className="triage-time">{e.latest_version}판</span></span>
                      <span className="triage-item-title">{pick(e.latest_title, lang, lang) || e.key}</span>
                      <span className="triage-item-sub">/{e.key}{e.visibility === 'unlisted' ? ' · 숨은 주소' : ''}{typeof e.meta.virtue === 'string' && e.meta.virtue ? ` · ${e.meta.virtue}` : ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {list.length === 0 && <p className="triage-empty">{settings ? '아직 없습니다. 위에서 새로 만드세요.' : '먼저 설정에서 홈페이지 주소를 정해 주세요.'}</p>}
            </>}
      </section>

      <section className="triage-detail" aria-label="편집">
        <div className="triage-pad">
          {box === 'settings'
            ? (school.isAdmin
                ? <>
                    {/* 가져오기 등으로 설정이 바뀌면 양식을 새 값으로 다시 연다(예전 값으로 덮어쓰지 않게) */}
                    <SiteSettingsForm key={settings?.updated_at ?? 'new'} initial={settings ? JSON.parse(JSON.stringify(settings)) : null} schoolName={school.name} />
                    {settings && <ImportPanel settings={JSON.parse(JSON.stringify(settings))} existing={entries.map((e) => ({ id: e.id, kind: e.kind, key: e.key }))} />}
                    {tokens && <AgentTokenPanel tokens={JSON.parse(JSON.stringify(tokens))}
                      stories={school.modules.includes('stories')}
                      entries={entries.map((e) => ({ kind: e.kind, key: e.key, title: pick(e.latest_title, lang, lang) || e.key }))} />}
                  </>
                : <EmptyState title="설정은 학교 관리자가 합니다">시안 만들기와 고치기는 교사도 할 수 있습니다.</EmptyState>)
            : selected
              ? <EntryEditor key={selected.entry.id} detail={JSON.parse(JSON.stringify(selected))}
                  langs={settings?.langs ?? ['ko']} canPublish={school.isAdmin} assets={JSON.parse(JSON.stringify(assets))}
                  publicHref={settings?.is_open ? `${publicUrl}${box === 'page' ? (selected.entry.key === 'home' ? '' : `/p/${selected.entry.key}`) : box === 'news' ? `/news/${selected.entry.key}` : `/stories/${selected.entry.key}`}` : null} />
              : <EmptyState title="왼쪽 목록에서 고르세요">고르면 여기서 고치고 판을 공개합니다.</EmptyState>}
        </div>
      </section>
      <TriageKeys hrefs={list.map((e) => href(box, e.id))} current={selected ? href(box, selected.entry.id) : null} />
    </div>
  );
}
