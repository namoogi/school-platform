import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { getI18n, userLang } from '@/lib/i18n/server';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { templateText } from '@/lib/site-labels';
import { TemplateView, type TemplateSearch } from '../TemplateView';

export const dynamic = 'force-dynamic';

/**
 * 템플릿 미리보기(로그인한 사람, 안내 줄 포함). 로그인하지 않은 사람은 같은 쪽의 공개 주소 `/demo/<key>`로 보낸다
 * (먼저 나눠 준 링크도 그대로 열리게).
 */
export default async function TemplateLive({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<TemplateSearch> }) {
  const { key } = await params;
  const sp = await searchParams;
  const userId = await currentUserId();
  if (!userId) {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === 'string' && k !== 'view' && k !== 'thumb') as [string, string][]);
    redirect(`/demo/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}`);
  }
  const { t: tr } = await getI18n(await asUser(userId, userLang));
  return <TemplateView templateKey={key} sp={sp} base="/templates" bare={false} tr={tr} />;
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  const { t: tr } = await getI18n();
  return { title: t ? tr('site.tpl.live.metaTitle', { name: templateText(tr, t.key, 'name', t.name) }) : tr('site.tpl.live.label') };
}
