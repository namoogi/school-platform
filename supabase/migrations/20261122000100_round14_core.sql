-- 14차: 학교별 자료 → 근거 질문 → 확정 규칙 → 발행본 보존
-- Supabase(Postgres 15+)와 로컬 Postgres 16에서 동일하게 적용한다.
-- 접근 제어는 RLS로 강제한다. 앱은 요청마다 트랜잭션 안에서
--   set local role authenticated; set_config('request.jwt.claims', '{"sub": "<user id>"}', true)
-- 를 설정한 뒤 쿼리한다. (Supabase PostgREST와 같은 방식)

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

create schema if not exists app;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema app to authenticated;

-- 현재 요청 사용자. Supabase auth.uid()와 같은 클레임을 읽는다.
create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::json ->> 'sub', '')::uuid
$$;

-- ── 학교와 사용자 ─────────────────────────────────────────
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  locale text not null default 'ko',
  created_at timestamptz not null default now()
);

-- 로그인 정보는 노출 스키마 밖에 둔다. (authenticated 역할은 접근 불가)
create table private.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references private.app_users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('admin')),
  primary key (user_id, school_id)
);

-- 현재 사용자가 소속된 학교인지 (RLS 재귀를 피하려고 security definer)
create or replace function app.is_member(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = app.uid() and m.school_id = target
  )
$$;
revoke all on function app.is_member(uuid) from public;
grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.uid() to authenticated;

-- ── 학교 자료 ────────────────────────────────────────────
-- status: parsed(내용을 읽음) / registered(주소만 등록, 내용 미열람) / pending_reader(파일은 받았으나 이 환경에 판독기 없음)
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('file', 'sheet')),
  name text not null,
  mime_type text,
  size_bytes integer,
  sha256 text,
  content text,
  sheet_url text,
  status text not null check (status in ('parsed', 'registered', 'pending_reader')),
  status_note text,
  uploaded_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, school_id),
  check (kind = 'file' or sheet_url is not null)
);

create table public.source_rows (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  file_id uuid not null,
  row_number integer not null,   -- 원본 파일의 줄 번호(머리행 = 1)
  data jsonb not null,
  unique (file_id, row_number),
  foreign key (file_id, school_id) references public.source_files(id, school_id)
);

-- ── 질문과 확정 규칙 ──────────────────────────────────────
-- 분석이 만든 후보와 근거. 확정 규칙과 다르면 needs_review로 다시 연다.
create table public.rule_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  topic text not null check (topic in ('period_structure')),
  status text not null check (status in ('open', 'answered', 'superseded')),
  prompt text not null,
  proposal jsonb not null,
  evidence jsonb not null,
  issues jsonb not null default '[]',
  analyzer text not null,
  source_fingerprint text not null,
  differs_from_rule_id uuid,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (id, school_id)
);
create unique index rule_questions_one_open on public.rule_questions (school_id, topic) where status = 'open';

-- 관리자가 확인·수정한 규칙. 갱신 대신 새 버전을 추가한다.
create table public.school_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  topic text not null check (topic in ('period_structure')),
  version integer not null,
  value jsonb not null,
  decision text not null check (decision in ('accepted', 'edited')),
  rationale text,
  evidence jsonb not null,
  question_id uuid,
  confirmed_by uuid not null default app.uid(),
  confirmed_at timestamptz not null default now(),
  unique (school_id, topic, version),
  unique (id, school_id),
  foreign key (question_id, school_id) references public.rule_questions(id, school_id),
  check (decision = 'accepted' or coalesce(length(trim(rationale)), 0) > 0)
);

-- ── 문서 양식과 발행본 ────────────────────────────────────
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  version integer not null,
  title text not null,
  period_heading text not null,
  assessment_heading text not null,
  footer_note text not null,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, version),
  unique (id, school_id)
);

create table public.published_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  rule_id uuid not null,
  template_id uuid not null,
  revision_of uuid,
  revision_number integer not null default 1,
  snapshot jsonb not null,        -- 당시 출력에 필요한 값 전부 (학교명, 규칙 값, 양식, 학생 표기, 자료 해시)
  snapshot_sha256 text not null,
  published_by uuid not null default app.uid(),
  published_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (rule_id, school_id) references public.school_rules(id, school_id),
  foreign key (template_id, school_id) references public.document_templates(id, school_id),
  foreign key (revision_of, school_id) references public.published_documents(id, school_id)
);
create unique index published_documents_one_revision on public.published_documents (revision_of) where revision_of is not null;

-- ── 변경 불가 보장 ───────────────────────────────────────
create or replace function private.reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '%: 발행·확정 기록은 수정하거나 삭제할 수 없습니다. 새 버전을 추가하세요.', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger school_rules_immutable before update or delete on public.school_rules
  for each row execute function private.reject_change();
create trigger published_documents_immutable before update or delete on public.published_documents
  for each row execute function private.reject_change();
create trigger document_templates_immutable before update or delete on public.document_templates
  for each row execute function private.reject_change();
create trigger source_rows_immutable before update or delete on public.source_rows
  for each row execute function private.reject_change();

-- 자료는 보관 처리(archived_at)만 허용하고 원문·소속은 바꾸지 않는다.
create or replace function private.guard_source_file() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'source_files: 자료는 삭제하지 않고 보관 처리합니다.' using errcode = 'P0001';
  end if;
  if new.school_id is distinct from old.school_id or new.content is distinct from old.content
     or new.sha256 is distinct from old.sha256 or new.name is distinct from old.name
     or new.kind is distinct from old.kind or new.sheet_url is distinct from old.sheet_url
     or new.uploaded_by is distinct from old.uploaded_by or new.created_at is distinct from old.created_at then
    raise exception 'source_files: 원문과 소속은 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger source_files_guard before update or delete on public.source_files
  for each row execute function private.guard_source_file();

-- 질문은 상태 전환만 허용한다.
create or replace function private.guard_question() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'rule_questions: 질문 기록은 삭제하지 않습니다.' using errcode = 'P0001';
  end if;
  if old.status <> 'open' then
    raise exception 'rule_questions: 이미 처리된 질문입니다.' using errcode = 'P0001';
  end if;
  if new.school_id is distinct from old.school_id or new.proposal is distinct from old.proposal
     or new.evidence is distinct from old.evidence or new.source_fingerprint is distinct from old.source_fingerprint then
    raise exception 'rule_questions: 근거와 후보는 바꿀 수 없습니다. 새 질문을 만드세요.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger rule_questions_guard before update or delete on public.rule_questions
  for each row execute function private.guard_question();

-- ── RLS ──────────────────────────────────────────────────
alter table public.schools enable row level security;
alter table public.memberships enable row level security;
alter table public.source_files enable row level security;
alter table public.source_rows enable row level security;
alter table public.rule_questions enable row level security;
alter table public.school_rules enable row level security;
alter table public.document_templates enable row level security;
alter table public.published_documents enable row level security;

grant usage on schema public to authenticated;
grant select on public.schools, public.memberships to authenticated;
grant select, insert, update on public.source_files, public.rule_questions to authenticated;
grant select, insert on public.source_rows, public.school_rules, public.document_templates, public.published_documents to authenticated;

create policy schools_member_read on public.schools for select to authenticated using (app.is_member(id));
create policy memberships_self_read on public.memberships for select to authenticated using (user_id = app.uid());

create policy source_files_read on public.source_files for select to authenticated using (app.is_member(school_id));
create policy source_files_insert on public.source_files for insert to authenticated
  with check (app.is_member(school_id) and uploaded_by = app.uid());
create policy source_files_update on public.source_files for update to authenticated
  using (app.is_member(school_id)) with check (app.is_member(school_id));

create policy source_rows_read on public.source_rows for select to authenticated using (app.is_member(school_id));
create policy source_rows_insert on public.source_rows for insert to authenticated with check (app.is_member(school_id));

create policy rule_questions_read on public.rule_questions for select to authenticated using (app.is_member(school_id));
create policy rule_questions_insert on public.rule_questions for insert to authenticated with check (app.is_member(school_id));
create policy rule_questions_update on public.rule_questions for update to authenticated
  using (app.is_member(school_id)) with check (app.is_member(school_id));

create policy school_rules_read on public.school_rules for select to authenticated using (app.is_member(school_id));
create policy school_rules_insert on public.school_rules for insert to authenticated
  with check (app.is_member(school_id) and confirmed_by = app.uid());

create policy templates_read on public.document_templates for select to authenticated using (app.is_member(school_id));
create policy templates_insert on public.document_templates for insert to authenticated
  with check (app.is_member(school_id) and created_by = app.uid());

create policy documents_read on public.published_documents for select to authenticated using (app.is_member(school_id));
create policy documents_insert on public.published_documents for insert to authenticated
  with check (app.is_member(school_id) and published_by = app.uid());

-- Supabase에서 anon 역할에는 아무 권한도 주지 않는다.
revoke all on all tables in schema public from anon;
-- Supabase는 public 새 표에 기본 권한을 넓게 준다. TRUNCATE는 RLS를 우회하므로 반드시 회수한다.
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke update on public.schools, public.memberships, public.source_rows, public.school_rules,
  public.document_templates, public.published_documents from authenticated;
revoke insert on public.schools, public.memberships from authenticated;
