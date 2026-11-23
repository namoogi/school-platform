-- 26차: 사용자별 화면(UI) 선택
-- 전체 관리 화면과 학교 화면에서 쓸 UI 원형·명암을 사용자마다 저장한다. 어느 기기에서 로그인해도 같은 화면이 열린다.
-- 학교 자료가 아니라 사용자 개인 설정이므로 school_id 가 없고, 본인 행만 읽고 쓴다(RLS). 학교 데이터 조회 경로와 무관하다.

create table public.user_preferences (
  user_id uuid primary key default app.uid() references private.app_users(id) on delete cascade,
  platform_ui text not null default 'analytics' check (platform_ui in ('analytics', 'campus')),
  platform_mode text not null default 'dark' check (platform_mode in ('dark', 'light')),
  school_ui text not null default 'campus' check (school_ui in ('campus', 'analytics')),
  school_mode text not null default 'light' check (school_mode in ('dark', 'light')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
create policy user_preferences_select on public.user_preferences for select to authenticated using (user_id = app.uid());
create policy user_preferences_insert on public.user_preferences for insert to authenticated with check (user_id = app.uid());
create policy user_preferences_update on public.user_preferences for update to authenticated using (user_id = app.uid()) with check (user_id = app.uid());
grant select, insert, update on public.user_preferences to authenticated;
