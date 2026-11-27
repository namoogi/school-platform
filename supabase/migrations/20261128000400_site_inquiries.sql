-- 91차(ADR 0036): 학교 홈페이지 방문·상담 신청.
-- 방문자(로그인 없음)가 학교에 남기는 첫 쓰기 경로다. 표에는 직접 쓰지 못하고, 검사하는 공개 제출 함수 하나로만 넣는다.
-- 읽기·처리는 그 학교 관리자만(app.is_school_admin = 관리자 소속 또는 전체 관리자). 학생·보호자 열람 계정은 볼 수 없다.
-- 지우지 않는다: 보존 기간이 지난 신청은 개인정보 칸만 가린다(ADR 0028 방식).
-- 되돌리기: site_settings.inquiry_open 을 끄면 새 신청이 막힌다. 표·함수는 남겨 두고 기록을 보존한다.

alter table public.site_settings add column if not exists inquiry_open boolean not null default false;

create table public.site_inquiries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('visit', 'consult', 'question')),
  name text not null check (char_length(name) between 1 and 80),
  contact text not null check (char_length(contact) between 3 and 120),
  preferred_date date,
  message text check (message is null or char_length(message) <= 2000),
  lang text not null default 'ko' check (lang in ('ko', 'en', 'th')),
  page text check (page is null or char_length(page) <= 200),
  consent_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'done')),
  handled_at timestamptz,
  handled_by uuid,
  redacted_at timestamptz,
  created_at timestamptz not null default now()
);
create index site_inquiries_school_created on public.site_inquiries (school_id, created_at desc);
alter table public.site_inquiries enable row level security;
alter table public.site_inquiries force row level security;
create policy site_inquiries_read on public.site_inquiries for select to authenticated
  using (app.is_member(school_id) and app.is_school_admin(school_id));
create policy site_inquiries_update on public.site_inquiries for update to authenticated
  using (app.is_member(school_id) and app.is_school_admin(school_id))
  with check (app.is_member(school_id) and app.is_school_admin(school_id));
-- 사람이 바꿀 수 있는 칸은 처리 상태뿐(이름·연락처·내용은 고칠 수 없음). 지우기 권한은 없다.
grant select on public.site_inquiries to authenticated;
grant update (status, handled_at, handled_by) on public.site_inquiries to authenticated;

-- 방문자 제출: 열린 홈페이지 + 학교가 신청을 켰을 때만. 동의 필수, 연락처당 하루 3건·학교당 한 시간 30건.
create or replace function app.submit_site_inquiry(p_slug text, p_kind text, p_name text, p_contact text, p_date date,
                                                   p_message text, p_lang text, p_page text, p_consent boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare sid uuid; n integer; c text := lower(btrim(coalesce(p_contact, '')));
begin
  sid := private.open_site(p_slug);
  if sid is null or not exists (select 1 from public.site_settings s where s.school_id = sid and s.inquiry_open) then
    raise exception 'inquiry_closed' using errcode = 'P0001';
  end if;
  if p_consent is not true then raise exception 'consent_required' using errcode = 'P0001'; end if;
  -- 같은 학교의 제출을 한 줄로 세운다(동시에 들어와도 횟수 검사와 넣기가 함께 일어남)
  perform pg_advisory_xact_lock(hashtextextended('site_inquiry:' || sid::text, 0));
  select count(*) into n from public.site_inquiries i
   where i.school_id = sid and lower(i.contact) = c and i.created_at > now() - interval '1 day';
  if n >= 3 then raise exception 'too_many' using errcode = 'P0001'; end if;
  select count(*) into n from public.site_inquiries i where i.school_id = sid and i.created_at > now() - interval '1 hour';
  if n >= 30 then raise exception 'too_many' using errcode = 'P0001'; end if;
  insert into public.site_inquiries (school_id, kind, name, contact, preferred_date, message, lang, page, consent_at)
  values (sid, p_kind, btrim(p_name), btrim(p_contact), p_date, nullif(btrim(coalesce(p_message, '')), ''),
          coalesce(nullif(p_lang, ''), 'ko'), nullif(btrim(coalesce(p_page, '')), ''), now());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function app.submit_site_inquiry(text, text, text, text, date, text, text, text, boolean) from public;
grant execute on function app.submit_site_inquiry(text, text, text, text, date, text, text, text, boolean) to anon, authenticated;

-- 보존 기간이 지난 신청 가리기(학교 관리자): 행은 두고 이름·연락처·내용만 가린다. 가린 수를 돌려준다.
create or replace function app.redact_site_inquiries(target uuid, keep_days integer) returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if not (app.is_member(target) and app.is_school_admin(target)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if keep_days is null or keep_days < 30 then raise exception 'keep_days_too_short' using errcode = 'P0001'; end if;
  update public.site_inquiries set name = '(가림)', contact = '(가림)', message = null, preferred_date = null, redacted_at = now()
   where school_id = target and redacted_at is null and created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  perform app.log_access(target, 'site.inquiry_redact', jsonb_build_object('count', n, 'keep_days', keep_days));
  return n;
end $$;
revoke all on function app.redact_site_inquiries(uuid, integer) from public;
grant execute on function app.redact_site_inquiries(uuid, integer) to authenticated;

-- 공개 사이트 정보에 '신청 받음'을 더한다(신청 구역을 보일지 정함). 나머지는 기존 정의 그대로.
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
    'nav', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'title', l.content -> 'title') order by l.sort, l.key)
                     from private.live_versions(sid) l where l.kind = 'page' and l.visibility = 'public' and l.key <> 'home'), '[]'::jsonb),
    'has_news', exists (select 1 from private.live_versions(sid) l where l.kind = 'news' and l.visibility = 'public'),
    'inquiry_open', s.inquiry_open)
  into result
  from public.site_settings s join public.schools c on c.id = s.school_id where s.school_id = sid;
  return result;
end $$;
