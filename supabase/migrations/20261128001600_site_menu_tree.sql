-- 126차(ADR 0046): 두 단계 메뉴. 공개 사이트 메뉴 재료에 쪽의 상위 메뉴(content.menu.parent)와
-- 메뉴 주소가 있는 구역(blocks[].anchor, 숨긴 구역·방문자에게 안 그려지는 구역·제목 없는 구역 제외, 쪽 안 순서)을 더한다. 표·권한은 바꾸지 않는다.
-- 나머지는 20261128000400_site_inquiries.sql 의 정의 그대로다.
create or replace function app.public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare sid uuid; result jsonb;
begin
  sid := private.open_site(p_slug);
  if sid is null then return null; end if;
  select jsonb_build_object(
    'slug', s.public_slug, 'school', c.name, 'default_lang', s.default_lang, 'langs', to_jsonb(s.langs), 'theme', s.theme,
    'title', s.site_title,
    'stories', 'stories' = any(private.school_modules(sid)),
    'nav', coalesce((select jsonb_agg(jsonb_build_object(
                       'key', l.key, 'title', l.content -> 'title',
                       'parent', l.content -> 'menu' ->> 'parent',
                       'sections', coalesce((select jsonb_agg(jsonb_build_object('anchor', b.value ->> 'anchor', 'title', m.title) order by b.ord)
                                             from jsonb_array_elements(case when jsonb_typeof(l.content -> 'blocks') = 'array' then l.content -> 'blocks' else '[]'::jsonb end) with ordinality b(value, ord)
                                             cross join lateral (select case when b.value ->> 'type' = 'heading' then b.value -> 'text' else b.value -> 'title' end as title) m
                                             where coalesce(b.value ->> 'anchor', '') <> '' and coalesce((b.value ->> 'hidden')::boolean, false) = false
                                               and b.value ->> 'type' in ('section', 'heading', 'news_list', 'inquiry')
                                               and jsonb_typeof(m.title) = 'object' and exists (select 1 from jsonb_each_text(m.title) x where x.value <> '')
                                               -- 방문자에게 그려지지 않는 구역은 메뉴에도 싣지 않는다(닫힌 신청 칸, 소식 없는 소식 목록)
                                               and (b.value ->> 'type' <> 'inquiry' or s.inquiry_open)
                                               and (b.value ->> 'type' <> 'news_list' or exists (select 1 from private.live_versions(sid) n where n.kind = 'news' and n.visibility = 'public'))), '[]'::jsonb))
                     order by l.sort, l.key)
                     from private.live_versions(sid) l where l.kind = 'page' and l.visibility = 'public' and l.key <> 'home'), '[]'::jsonb),
    'has_news', exists (select 1 from private.live_versions(sid) l where l.kind = 'news' and l.visibility = 'public'),
    'inquiry_open', s.inquiry_open)
  into result
  from public.site_settings s join public.schools c on c.id = s.school_id where s.school_id = sid;
  return result;
end $$;
