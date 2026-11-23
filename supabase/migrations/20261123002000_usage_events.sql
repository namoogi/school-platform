-- 43차: 학교별 사용량·요금 추정 (ADR 0018)
-- AI 호출처럼 돈이 드는 사용은 호출한 쪽이 이 표에 한 줄씩 남긴다(추가만). 지금은 앱 안 AI 호출이 없어 비어 있다.
-- 저장소 사용량은 site_assets·source_files 에서 바로 계산하므로 따로 기록하지 않는다.
select set_config('request.jwt.claims', '{}', true);

create table public.usage_events (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('ai')),
  provider text not null check (length(provider) between 1 and 40),
  model text not null default '' check (length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- 호출 시점 단가로 계산한 추정 금액(USD). 단가가 바뀌어도 지난 기록은 그대로 둔다
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  feature text not null default '' check (length(feature) <= 60),
  created_by uuid default app.uid(),
  created_at timestamptz not null default now()
);
create index usage_events_school on public.usage_events (school_id, created_at desc);
create trigger usage_events_immutable before update or delete on public.usage_events
  for each row execute function private.reject_change();

alter table public.usage_events enable row level security;
grant select, insert on public.usage_events to authenticated;
create policy usage_events_read on public.usage_events for select to authenticated using (app.is_school_admin(school_id));
create policy usage_events_insert on public.usage_events for insert to authenticated with check (app.is_member(school_id));
revoke update, delete, truncate, references, trigger on public.usage_events from authenticated;
revoke all on public.usage_events from anon;
