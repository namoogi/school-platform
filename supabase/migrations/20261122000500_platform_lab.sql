-- 17차: 전체 관리 · 개발·연구소 보드
-- 개발 기획, 도구, 방법론, 연구소(엔진 개선 실험), 할 일을 한 표에 두고 종류별 상태를 쓴다.
-- 학교 자료가 아니므로 school_id 가 없고, 전체 관리자만 읽고 쓴다. 변경 전 값은 이력 표에 남긴다.

create table public.platform_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'tool', 'method', 'lab', 'todo')),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  status text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  tags text[] not null default '{}',
  link text check (link is null or link ~ '^https?://'),
  parent_id uuid references public.platform_items(id),
  sort integer not null default 0,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint platform_items_status_check check (
    (kind = 'plan'   and status in ('idea', 'planned', 'in_progress', 'done', 'dropped')) or
    (kind in ('tool', 'method') and status in ('candidate', 'trial', 'adopted', 'rejected')) or
    (kind = 'lab'    and status in ('idea', 'running', 'concluded', 'dropped')) or
    (kind = 'todo'   and status in ('todo', 'doing', 'done'))
  ),
  constraint platform_items_not_self_parent check (parent_id is null or parent_id <> id)
);
create index platform_items_kind on public.platform_items (kind, archived_at, status);

create table public.platform_item_history (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.platform_items(id),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before jsonb not null
);

create or replace function private.platform_item_touch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform_items: 삭제하지 않고 보관 처리합니다.' using errcode = 'P0001';
  end if;
  if new.kind is distinct from old.kind or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'platform_items: 종류와 작성 정보는 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  insert into public.platform_item_history(item_id, changed_by, before) values (old.id, app.uid(), to_jsonb(old));
  new.updated_at := now();
  return new;
end $$;
create trigger platform_items_touch before update or delete on public.platform_items
  for each row execute function private.platform_item_touch();
create trigger platform_item_history_immutable before update or delete on public.platform_item_history
  for each row execute function private.reject_change();

alter table public.platform_items enable row level security;
alter table public.platform_item_history enable row level security;
grant select, insert, update on public.platform_items to authenticated;
grant select on public.platform_item_history to authenticated;
create policy platform_items_admin on public.platform_items for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy platform_item_history_read on public.platform_item_history for select to authenticated
  using (app.is_platform_admin());
revoke delete, truncate, references, trigger on public.platform_items, public.platform_item_history from authenticated;
revoke all on public.platform_items, public.platform_item_history from anon;

-- ── 시작 내용: 2026-11-22까지의 로드맵과 결정 ─────────────────
-- 작성자는 시스템(빈 UUID)으로 둔다. 이후 항목은 로그인한 전체 관리자로 남는다.
do $$
declare
  sys uuid := '00000000-0000-0000-0000-000000000000';
  p_ai uuid; p_pay uuid; p_engine uuid; p_lab uuid;
begin
  if exists (select 1 from public.platform_items) then return; end if;

  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by) values
    ('plan', '14차 첫 흐름 (로그인 → 자료 → 근거 질문 → 확정 규칙 → 문서 발행)', '두 예시 학교의 접근 분리와 발행본 보존까지. docs/rounds/round-14.md', 'done', 'high', '{학사,발행}', 10, sys),
    ('plan', '15차 XLSX·DOCX·PDF 자료 읽기', '시트·문서 표·PDF 표를 행 위치 근거와 함께 읽는다. 스캔 PDF는 OCR 필요.', 'done', 'normal', '{자료}', 20, sys),
    ('plan', '16차 전체 관리자·학교 라이선스·Google 로그인', '학교 단위 생성, 학교 관리자가 좌석·기능 등록, 전체 관리자 모든 학교 접근(입장 기록).', 'done', 'high', '{운영,로그인}', 30, sys),
    ('plan', '학교가 직접 가입 신청하기', '지금은 전체 관리자가 학교를 만든다. 신청 → 검토 → 생성 흐름이 필요한지 결정.', 'idea', 'normal', '{운영}', 60, sys),
    ('plan', '초대 메일 자동 발송', '지금은 초대 후 관리자가 직접 알린다. 메일 발송 서비스 선택 필요(외부 발송이라 승인 후).', 'idea', 'normal', '{운영}', 70, sys),
    ('plan', 'Google Sheets 내용 읽기', '시트 권한 연결(Google API) 필요. 지금은 주소만 등록.', 'idea', 'low', '{자료}', 80, sys),
    ('plan', '스캔 PDF 글자 인식(OCR)', 'OCR 서비스 또는 라이브러리 비교 필요.', 'idea', 'low', '{자료}', 90, sys),
    ('plan', '13차 남은 범위: 개인정보·학교 간 공유, 개선 요청 판, 서체 설정', 'school-platform-handoff/reference/site/round-13.html 참고.', 'idea', 'normal', '{시안}', 100, sys);

  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by)
    values ('plan', 'AI 분석 연결 (Claude API)', '규칙 기반 분석기 옆에 AI 분석기를 붙인다. 유료 API라 프롬프트·비용 추정을 무료로 먼저 확인하고 과금 전 승인.', 'planned', 'high', '{분석,AI}', 40, sys)
    returning id into p_ai;
  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by)
    values ('plan', '실제 결제 연동', '지금은 청구 예정액 확정 기록까지. 결제 대행사·청구 주기·세금계산서 결정 필요. 되돌리기 어려운 작업이라 별도 승인.', 'idea', 'normal', '{운영,과금}', 50, sys)
    returning id into p_pay;

  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by) values
    ('tool', 'Supabase Auth (Google 로그인)', '16차 채택. 소셜 로그인·초대·재설정을 직접 만들지 않음. 같은 Supabase 안에서 결제처 추가 없음.', 'adopted', 'normal', '{로그인}', 10, sys),
    ('tool', 'Vercel 빌드에서 마이그레이션 적용 (predeploy)', 'DB 비밀번호를 개발 세션에 두지 않고 Vercel 환경 변수에만 둔다.', 'adopted', 'normal', '{배포}', 20, sys),
    ('tool', 'Playwright E2E (실제 서버 + 로컬 Postgres)', '전체 흐름과 학교 간 HTTP 거부를 브라우저로 검증.', 'adopted', 'normal', '{테스트}', 30, sys),
    ('tool', 'Codex CLI·Codex 클라우드 협업', 'ChatGPT 계정에 GitHub 저장소 연결. AGENTS.md를 공통 지침으로 사용. 연결은 사용자가 ChatGPT 설정에서.', 'candidate', 'normal', '{협업}', 40, sys),
    ('tool', 'GitHub Actions CI', '지금은 Vercel 배포 결과만 검사로 본다. PR마다 npm test를 돌릴지 결정.', 'candidate', 'normal', '{테스트,배포}', 50, sys);

  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by) values
    ('method', '차시(Round) 단위 개발과 PR 쌓기', '한 PR에 한 차시. 결과는 docs/rounds/에 남긴다.', 'adopted', 'normal', '{프로세스}', 10, sys),
    ('method', 'RLS 우선 설계 (데이터 경계를 DB에서 강제)', '화면이 아니라 DB 정책으로 학교 간 분리·역할을 강제하고 양방향 테스트.', 'adopted', 'high', '{보안}', 20, sys),
    ('method', '발행 시점 스냅샷 보존', '발행본은 당시 규칙·양식·자료 해시를 담고 스냅샷만으로 렌더링.', 'adopted', 'normal', '{학사}', 30, sys),
    ('method', 'ADR(결정 기록)로 도구·방법 비교 후 채택', '새 도구·방법은 docs/decisions/에 비교를 남기고 시범 적용 뒤 AGENTS.md에 반영. 지침 충돌 방지.', 'trial', 'normal', '{프로세스}', 40, sys);

  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by)
    values ('lab', '분석 엔진 버전 관리', '분석기·모듈 버전을 기록하고 학교별 적용 버전을 고정·업그레이드. 발행본은 당시 버전 유지.', 'idea', 'high', '{엔진}', 10, sys)
    returning id into p_engine;
  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by)
    values ('lab', '학교 규칙 패턴 모으기 (비식별)', '학교들의 확정 규칙·질문 패턴을 비식별로 모아 기본 엔진 개선안을 만들고 합성 자료로 시험. 학교 동의 범위(개인정보) 결정 필요.', 'idea', 'normal', '{엔진,개인정보}', 20, sys)
    returning id into p_lab;
  insert into public.platform_items(kind, title, body, status, priority, tags, sort, created_by) values
    ('lab', '실제 학교 PDF 판독 정확도 시험', '병합 셀·여러 단·테두리만 있는 표. 합성 PDF로만 시험했음.', 'idea', 'normal', '{자료}', 30, sys);

  insert into public.platform_items(kind, title, body, status, priority, tags, parent_id, sort, created_by) values
    ('todo', 'PR #1·#2·#3 병합 후 onschools.vercel.app 을 Production으로 옮기기', '', 'todo', 'high', '{배포}', null, 10, sys),
    ('todo', '학교 공개 전 Vercel 배포 보호(Deployment Protection) 범위 정리', '학교 선생님이 Vercel 로그인 없이 들어올 수 있어야 함. 공개 범위 확대라 확인 후.', 'todo', 'high', '{배포}', null, 20, sys),
    ('todo', 'AI 분석 프롬프트 설계와 학교당 월 비용 추정', '', 'todo', 'normal', '{AI}', p_ai, 30, sys),
    ('todo', '결제 대행사 후보 비교 (수수료·정산·세금계산서)', '', 'todo', 'normal', '{과금}', p_pay, 40, sys),
    ('todo', '분석기 버전 기록 방식 설계', '', 'todo', 'normal', '{엔진}', p_engine, 50, sys),
    ('todo', '학교 자료 활용 동의 문안 초안', '', 'todo', 'low', '{개인정보}', p_lab, 60, sys);
end $$;
