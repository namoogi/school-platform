-- 126차(ADR 0046): 두 단계 메뉴. 공개 사이트 메뉴 재료에 쪽의 상위 메뉴(content.menu.parent)와
-- 메뉴 주소가 있는 구역(blocks[].anchor)을 더한다. 홈 쪽의 메뉴 주소 구역은 'home_sections'로 따로 낸다('홈' 아래 하위 메뉴).
-- 숨긴 구역·방문자에게 안 그려지는 구역(닫힌 신청 칸, 소식 없는 소식 목록)·제목 없는 구역은 빼고, 쪽 안 순서를 지킨다.
-- 표·권한은 바꾸지 않는다. 나머지는 20261128000400_site_inquiries.sql 의 정의 그대로다.

-- 한 쪽 내용에서 메뉴에 실을 구역(메뉴 주소·제목). app.public_site 안에서만 쓴다
create or replace function private.site_menu_sections(content jsonb, inquiry_open boolean, has_news boolean) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('anchor', b.value ->> 'anchor', 'title', m.title) order by b.ord), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(content -> 'blocks') = 'array' then content -> 'blocks' else '[]'::jsonb end) with ordinality b(value, ord)
  cross join lateral (select case when b.value ->> 'type' = 'heading' then b.value -> 'text' else b.value -> 'title' end as title) m
  where coalesce(b.value ->> 'anchor', '') <> '' and coalesce((b.value ->> 'hidden')::boolean, false) = false
    and b.value ->> 'type' in ('section', 'heading', 'news_list', 'inquiry')
    and jsonb_typeof(m.title) = 'object' and exists (select 1 from jsonb_each_text(m.title) x where x.value <> '')
    and (b.value ->> 'type' <> 'inquiry' or inquiry_open)
    and (b.value ->> 'type' <> 'news_list' or has_news)
$$;
revoke all on function private.site_menu_sections(jsonb, boolean, boolean) from public;

create or replace function app.public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare sid uuid; result jsonb; news_on boolean;
begin
  sid := private.open_site(p_slug);
  if sid is null then return null; end if;
  news_on := exists (select 1 from private.live_versions(sid) l where l.kind = 'news' and l.visibility = 'public');
  select jsonb_build_object(
    'slug', s.public_slug, 'school', c.name, 'default_lang', s.default_lang, 'langs', to_jsonb(s.langs), 'theme', s.theme,
    'title', s.site_title,
    'stories', 'stories' = any(private.school_modules(sid)),
    'nav', coalesce((select jsonb_agg(jsonb_build_object(
                       'key', l.key, 'title', l.content -> 'title',
                       'parent', l.content -> 'menu' ->> 'parent',
                       'sections', private.site_menu_sections(l.content, s.inquiry_open, news_on))
                     order by l.sort, l.key)
                     from private.live_versions(sid) l where l.kind = 'page' and l.visibility = 'public' and l.key <> 'home'), '[]'::jsonb),
    'home_sections', coalesce((select private.site_menu_sections(l.content, s.inquiry_open, news_on)
                               from private.live_versions(sid) l where l.kind = 'page' and l.key = 'home'), '[]'::jsonb),
    'has_news', news_on,
    'inquiry_open', s.inquiry_open)
  into result
  from public.site_settings s join public.schools c on c.id = s.school_id where s.school_id = sid;
  return result;
end $$;
