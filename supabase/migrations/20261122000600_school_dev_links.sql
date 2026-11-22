-- 22차: 학교별 개발 연동 (GitHub 저장소, Claude Code 세션, Codex 환경, Vercel·Supabase 프로젝트 등)
-- 전체 관리자가 학교를 만든 뒤 그 학교 전용 개발 자원을 연결·관리한다. 학교 관리자는 자기 학교 것만 본다.
-- 주소와 메모만 저장한다. 토큰·키·비밀번호는 저장하지 않는다(앱이 거부, 아래 검사로 한 번 더 막음).

create table public.school_dev_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('github_repo', 'claude_session', 'codex_environment', 'vercel_project', 'supabase_project', 'other')),
  label text not null check (length(trim(label)) between 1 and 120),
  url text not null check (url ~ '^https://[^\s]+$' and length(url) <= 500),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'active' check (status in ('planned', 'active', 'archived')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  -- 비밀 값으로 보이는 문자열은 DB에서도 거부한다
  constraint school_dev_links_no_secret check (
    (url || ' ' || notes) !~* '(ghp_|github_pat_|gho_|sk-ant-|sk-[A-Za-z0-9]{20}|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{20,}\.)'
  )
);
create index school_dev_links_school on public.school_dev_links (school_id, status);

create or replace function private.school_dev_links_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'school_dev_links: 삭제하지 않고 보관(archived) 처리합니다.' using errcode = 'P0001';
  end if;
  if new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'school_dev_links: 학교와 작성 정보는 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger school_dev_links_touch before update or delete on public.school_dev_links
  for each row execute function private.school_dev_links_touch();

alter table public.school_dev_links enable row level security;
grant select, insert, update on public.school_dev_links to authenticated;
revoke delete, truncate, references, trigger on public.school_dev_links from authenticated;
revoke all on public.school_dev_links from anon;

-- 읽기: 학교 관리자(자기 학교) · 전체 관리자. 쓰기: 전체 관리자만.
create policy school_dev_links_read on public.school_dev_links for select to authenticated
  using (app.is_school_admin(school_id));
create policy school_dev_links_insert on public.school_dev_links for insert to authenticated
  with check (app.is_platform_admin() and created_by = app.uid());
create policy school_dev_links_update on public.school_dev_links for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
