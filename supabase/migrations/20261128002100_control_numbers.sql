-- 134차 ADR 0051: 차시·결정 기록(ADR)·마이그레이션 번호를 관제 센터가 나눠 준다.
-- 여러 세션이 같은 날 같은 'main 최대 + 1'을 골라 병합 때 부딪치던 일(하루 다섯 번 넘게)을 없앤다.
-- 세션은 일을 시작할 때 POST /api/control/numbers 로 번호를 받는다. 받은 번호는 다시 나오지 않는다(쓰지 않으면 빈 번호로 남는다).
-- 저장소를 모르는 DB가 이미 쓰인 번호보다 작은 값을 주지 않도록, 세션이 본 가장 큰 번호(floor)를 함께 보낸다.

create table public.control_numbers (
  kind text not null check (kind in ('round', 'adr', 'migration')),
  value bigint not null check (value > 0),
  session_id text not null check (session_id ~ '^session_[A-Za-z0-9]{8,64}$'),
  title text not null check (length(title) between 1 and 120),
  reserved_at timestamptz not null default now(),
  primary key (kind, value)
);

create or replace function private.control_numbers_guard() returns trigger
language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  raise exception 'control_numbers: 받은 번호는 고치거나 지우지 않습니다.' using errcode = 'P0001';
end $$;
create trigger control_numbers_guard before update or delete on public.control_numbers
  for each row execute function private.control_numbers_guard();

alter table public.control_numbers enable row level security;
grant select on public.control_numbers to authenticated;
create policy control_numbers_admin_read on public.control_numbers for select to authenticated using (app.is_platform_admin());
revoke all on public.control_numbers from anon;
grant select, insert on public.control_numbers to control_writer;
create policy control_numbers_writer on public.control_numbers for all to control_writer using (true) with check (true);

grant create on schema control to control_writer;
set local role control_writer;

-- 번호 받기. p = { kind, session, title, floor? }
--   round: 차시 번호(정수). adr: 결정 기록 번호(정수, 표기는 네 자리). migration: yyyymmddNNNNNN(오늘 UTC 날짜, 끝 여섯 자리는 100씩)
--   floor: 세션이 main과 열린 PR에서 본 가장 큰 값. 돌려주는 값은 floor와 지금까지 준 값보다 크다.
create or replace function control.reserve_number(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare k text := p ->> 'kind'; sid text := p ->> 'session'; ttl text := trim(coalesce(p ->> 'title', ''));
        fl bigint; last bigint; nxt bigint; day_base bigint;
begin
  perform control.enter(p_token);
  if k is null or k not in ('round', 'adr', 'migration') then
    raise exception '번호 종류는 round·adr·migration 가운데 하나입니다.' using errcode = '22023';
  end if;
  if sid is null or sid !~ '^session_[A-Za-z0-9]{8,64}$' then raise exception '세션 id 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  if length(ttl) not between 1 and 120 then raise exception '번호에 붙일 제목은 1~120자입니다.' using errcode = '22023'; end if;
  begin
    fl := coalesce(nullif(p ->> 'floor', '')::bigint, 0);
  exception when others then
    raise exception 'floor는 0 이상의 정수입니다.' using errcode = '22023';
  end;
  if fl < 0 then raise exception 'floor는 0 이상의 정수입니다.' using errcode = '22023'; end if;
  -- 같은 종류는 한 줄로 세운다(동시에 받아도 같은 번호가 나오지 않게)
  perform pg_advisory_xact_lock(hashtext('school-platform:control_numbers'), hashtext(k));
  if k = 'migration' then
    day_base := to_char(now() at time zone 'utc', 'YYYYMMDD')::bigint * 1000000;
    select max(value) into last from public.control_numbers where kind = k and value >= day_base and value < day_base + 1000000;
    nxt := greatest(coalesce(last, day_base), case when fl >= day_base and fl < day_base + 1000000 then fl else day_base end);
    nxt := (nxt / 100) * 100 + 100;
    if nxt >= day_base + 1000000 then raise exception '오늘 마이그레이션 번호를 다 썼습니다.' using errcode = '22023'; end if;
  else
    select max(value) into last from public.control_numbers where kind = k;
    nxt := greatest(coalesce(last, 0), fl) + 1;
  end if;
  insert into public.control_numbers(kind, value, session_id, title) values (k, nxt, sid, ttl);
  return jsonb_build_object('kind', k, 'value', nxt,
    'label', case k when 'round' then nxt::text || '차' when 'adr' then lpad(nxt::text, 4, '0') else nxt::text end);
end $$;

-- 최근에 나간 번호(새것 먼저, 종류마다 30개)
create or replace function control.numbers(p_token text, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform control.enter(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'value', x.value, 'session', x.session_id, 'title', x.title, 'reserved_at', x.reserved_at)
                                    order by x.kind, x.value desc), '[]')
            from (select n.*, row_number() over (partition by n.kind order by n.value desc) as rn from public.control_numbers n
                   where p_kind is null or n.kind = p_kind) x where x.rn <= 30);
end $$;

revoke all on function control.reserve_number(text, jsonb) from public, anon, authenticated;
revoke all on function control.numbers(text, text) from public, anon, authenticated;
grant execute on function control.reserve_number(text, jsonb) to agent_request;
grant execute on function control.numbers(text, text) to agent_request;

reset role;
revoke create on schema control from control_writer;
