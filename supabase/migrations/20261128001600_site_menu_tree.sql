-- 126차(ADR 0046): 두 단계 메뉴. 공개 사이트 메뉴 재료에 쪽의 상위 메뉴(content.menu.parent)와
-- 메뉴 주소가 있는 구역(blocks[].anchor, 숨긴 구역 제외, 쪽 안 순서)을 더한다. 표·권한은 바꾸지 않는다.
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
                       'sections', coalesce((select jsonb_agg(jsonb_build_object('anchor', b.value ->> 'anchor', 'title', coalesce(b.value -> 'title', b.value -> 'text')) order by b.ord)
                                             from jsonb_array_elements(case when jsonb_typeof(l.content -> 'blocks') = 'array' then l.content -> 'blocks' else '[]'::jsonb end) with ordinality b(value, ord)
                                             where coalesce(b.value ->> 'anchor', '') <> '' and coalesce((b.value ->> 'hidden')::boolean, false) = false), '[]'::jsonb))
                     order by l.sort, l.key)
                     from private.live_versions(sid) l where l.kind = 'page' and l.visibility = 'public' and l.key <> 'home'), '[]'::jsonb),
    'has_news', exists (select 1 from private.live_versions(sid) l where l.kind = 'news' and l.visibility = 'public'),
    'inquiry_open', s.inquiry_open)
  into result
  from public.site_settings s join public.schools c on c.id = s.school_id where s.school_id = sid;
  return result;
end $$;
