import { currentUserId } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { getI18n, userLang } from '@/lib/i18n/server';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { TEMPLATE_SAMPLES } from '@/lib/site-template-samples';
import { templateText } from '@/lib/site-labels';
import { TemplateView, type TemplateSearch } from '../../templates/TemplateView';

export const dynamic = 'force-dynamic';

/**
 * 템플릿 공개 주소(홍보용, 2026-11-28 사용자 결정): 누구나 보고, 템플릿 화면만 나온다(안내 줄·예시 안내 없음).
 * 내용은 합성 예시뿐이고 DB를 읽지 않는다. 로그인한 사람이면 그 사람의 화면 언어만 읽는다.
 */
export default async function TemplateDemo({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<TemplateSearch> }) {
  const { key } = await params;
  const userId = await currentUserId();
  const { t: tr } = await getI18n(userId ? await asUser(userId, userLang) : null);
  return <TemplateView templateKey={key} sp={await searchParams} base="/demo" bare tr={tr} />;
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  const { t: tr } = await getI18n();
  if (!t) return { title: tr('site.tpl.live.label') };
  return { title: TEMPLATE_SAMPLES[t.key]?.school ?? templateText(tr, t.key, 'name', t.name) };
}
