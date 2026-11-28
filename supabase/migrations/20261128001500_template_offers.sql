-- 123차: 학사 관리 템플릿 새 판 → 학교에 '제안' (ADR 0043 3단계, ADR 0027 기본판 제안과 같은 뜻)
-- · 열린 제안은 저장하지 않고 계산한다: 학교가 쓰는 템플릿의 최신 판이 학교 판보다 높으면 '지금 판 → 최신 판' 제안이다.
--   (참은 학교 관할 판 하나. 제안을 따로 저장해 학교 판과 맞추면 되돌아오기·동시 공개·학교 이전마다 어긋남이 생겼다 — Codex 199번 PR 검토)
-- · 학교의 결정(수락·보류·거절)만 기록으로 쌓는다(추가만). 수락 = 앱이 같은 트랜잭션에서 그 판을 적용한 뒤 기록
-- · 템플릿 표는 외래키로 묶지 않는다(학교 관할 판과 같음, 학교 이전 때 관제 표를 끌고 가지 않게). 있는지는 함수가 본다
select set_config('request.jwt.claims', '{}', true);

create table public.academic_template_decisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  from_version integer not null check (from_version >= 1),
  to_version integer not null check (to_version > from_version),
  decision text not null check (decision in ('accepted', 'held', 'declined')),
  note text check (note is null or length(note) <= 500),
  decided_by uuid not null default app.uid(),
  decided_at timestamptz not null default now()
);
create index academic_template_decisions_school on public.academic_template_decisions (school_id, template_key, to_version, decided_at desc);
create trigger academic_template_decisions_guard before update or delete on public.academic_template_decisions for each row execute function private.guard_columns();

alter table public.academic_template_decisions enable row level security;
revoke all on public.academic_template_decisions from public, anon, authenticated;
grant select on public.academic_template_decisions to authenticated;
create policy academic_template_decisions_read on public.academic_template_decisions for select to authenticated
  using (app.is_platform_admin() or app.is_member(school_id));

-- 학교 관리자가 지금 열린 제안(지금 판 → 그 템플릿의 최신 판)에 대한 결정을 남긴다.
-- 보류·거절: 지금 열린 제안이어야 한다. 수락: 앱이 같은 트랜잭션에서 그 판을 적용해 학교 판이 이미 그 판이어야 한다.
create or replace function app.record_template_decision(target uuid, p_key text, p_to integer, decision text, decision_note text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare cur record; before record; latest integer; src integer; new_id uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 결정합니다.' using errcode = '42501'; end if;
  if decision not in ('accepted', 'declined', 'held') then raise exception '결정은 accepted·declined·held 입니다.' using errcode = '22023'; end if;
  -- 학교 관할 판 쓰기(app.set_school_profile)와 같은 학교별 잠금: 그 사이 진행 중인 템플릿 바꾸기·수락이 끝난 뒤의 판을 보고 결정한다(Codex 199번 PR 검토).
  -- 수락은 같은 트랜잭션에서 이미 이 잠금을 잡았다(트랜잭션 잠금은 다시 잡아도 된다)
  perform pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext(target::text));
  select template_key, template_version into cur from public.school_profiles where school_id = target order by version desc limit 1;
  if cur.template_key is distinct from p_key then
    raise exception '학교가 다른 템플릿으로 바꿔 이 제안은 쓸 수 없습니다.' using errcode = 'P0409';
  end if;
  select max(version) into latest from public.academic_templates where key = p_key;
  if p_to is distinct from latest then raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409'; end if;
  -- '어느 판에서'는 호출한 쪽이 아니라 학교 판에서 정한다(Codex 199번 PR 검토).
  -- 보류·거절: 지금 판. 수락: 이 트랜잭션에서 적용하기 직전 판(관할 판 created_at 은 트랜잭션 시작 시각 now())
  if decision = 'accepted' then
    if cur.template_version <> p_to then raise exception '템플릿 새 판을 먼저 적용해야 수락할 수 있습니다.' using errcode = '22023'; end if;
    select template_key, template_version into before from public.school_profiles where school_id = target and created_at < now() order by version desc limit 1;
    if before.template_key is distinct from p_key or before.template_version >= p_to then
      raise exception '템플릿 새 판을 먼저 적용해야 수락할 수 있습니다.' using errcode = '22023';
    end if;
    src := before.template_version;
  elsif cur.template_version >= p_to then
    raise exception '학교가 이미 그 판 이상을 써서 지난 제안입니다.' using errcode = 'P0409';
  else
    src := cur.template_version;
  end if;
  insert into public.academic_template_decisions(school_id, template_key, from_version, to_version, decision, note)
  values (target, p_key, src, p_to, decision, nullif(trim(decision_note), '')) returning id into new_id;
  return new_id;
end $$;
revoke all on function app.record_template_decision(uuid, text, integer, text, text) from public, anon;
grant execute on function app.record_template_decision(uuid, text, integer, text, text) to authenticated;

-- 제안 카드가 새 판의 '바뀐 이유'를 보이도록 판 하나 읽기에 why 를 더한다(반환 모양이 바뀌어 지우고 다시 만든다)
drop function app.academic_template(text, integer);
create function app.academic_template(p_key text, p_version integer)
returns table (key text, version integer, sort_order integer, title jsonb, summary jsonb, manifest jsonb, why text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select t.key, t.version, t.sort_order, t.title, t.summary, t.manifest, t.why
    from public.academic_templates t
   where app.uid() is not null and t.key = p_key and t.version = p_version
$$;
revoke all on function app.academic_template(text, integer) from public, anon;
grant execute on function app.academic_template(text, integer) to authenticated;
