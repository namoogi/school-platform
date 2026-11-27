-- 111차: 하루 환산(app.attendance_days)의 출석인정 판정을 그 날짜에 유효한 코드 판으로만 본다.
-- 학교가 app.add_code 로 사유 코드를 바꾸면 옛 판·새 판이 같은 code 를 쓰고 effective_from/effective_to 만 다르다.
-- 예전 조건은 기간을 보지 않아, 어느 한 판이라도 counts_present = true 면 그 날 유효하지 않은 판으로도 결석을 출석으로 셌다.
-- 수업 마감 입력(app.offering_calc_inputs, 20261128000800, Codex #169)과 같은 기간 조건을 쓴다: [effective_from, effective_to).
-- 본문은 최신 정의(20261127000100 F6 열람 계정 판)를 그대로 두고 사유 판정 조건만 바꾼다. 소유자는 원래처럼 마이그레이션 역할이다
-- (create or replace 는 소유자·실행 권한을 유지한다. 아래 revoke/grant 는 원래 상태를 다시 적어 둔 것).
create or replace function app.attendance_days(target uuid, person uuid, from_day date, to_day date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare ratio numeric; res jsonb := '[]'; d record; dayev record; am record; pm record; tot integer; nabs integer; status text; val numeric; rsn text;
begin
  if not (app.is_member(target) or exists (select 1 from private.portal_people(app.uid()) pp where pp.school_id = target and pp.person_id = person)) then
    raise exception '이 학교 구성원만 볼 수 있습니다.' using errcode = '42501';
  end if;
  select coalesce((policy -> 'attendance' ->> 'day_absent_ratio')::numeric, 0.5) into ratio from public.grading_policies where school_id = target order by version desc limit 1;
  ratio := coalesce(ratio, 0.5);
  for d in select distinct a.day from public.current_attendance a where a.school_id = target and a.person_id = person and a.day >= from_day and a.day < to_day order by a.day loop
    select kind_code, reason_code into dayev from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'day';
    select kind_code, reason_code into am from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'session' and session_code = 'am';
    select kind_code, reason_code into pm from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'session' and session_code = 'pm';
    val := 0; rsn := null;
    if dayev.kind_code is not null then
      status := dayev.kind_code; rsn := dayev.reason_code; val := case when dayev.kind_code = 'absent' then 1 else 0 end;
    elsif am.kind_code is not null or pm.kind_code is not null then
      if am.kind_code = 'absent' and pm.kind_code = 'absent' then status := 'absent'; val := 1; rsn := am.reason_code;
      elsif am.kind_code = 'absent' or pm.kind_code = 'absent' then status := 'half_absent'; val := 0.5; rsn := coalesce(am.reason_code, pm.reason_code);
      else status := coalesce(nullif(am.kind_code, 'present'), nullif(pm.kind_code, 'present'), 'present');
      end if;
    else
      select count(*), count(*) filter (where kind_code in ('absent', 'class_absent')), max(reason_code) filter (where kind_code in ('absent', 'class_absent'))
        into tot, nabs, rsn from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'period';
      if tot > 0 and nabs::numeric / tot >= ratio then status := 'absent'; val := 1;
      elsif nabs > 0 then status := 'class_absent';
      else status := coalesce((select kind_code from public.current_attendance where school_id = target and person_id = person and day = d.day
                                and scope = 'period' and kind_code in ('tardy', 'early_leave') limit 1), 'present');
      end if;
    end if;
    -- 출석인정 사유는 결석으로 세지 않는다(KR 출석인정, US 학교 활동)
    -- 그 날(d.day)에 유효한 코드 판만 본다(옛 판·새 판이 같은 코드를 쓴다, 111차)
    if rsn is not null and exists (select 1 from public.code_lists c where c.school_id = target and c.list_key = 'attendance_reason' and c.code = rsn
                                    and (c.effective_from is null or c.effective_from <= d.day) and (c.effective_to is null or d.day < c.effective_to)
                                    and coalesce((c.attrs ->> 'counts_present')::boolean, false)) then
      val := 0;
    end if;
    res := res || jsonb_build_object('day', d.day, 'status', status, 'reason', rsn, 'absent_value', val);
  end loop;
  return res;
end $$;

revoke all on function app.attendance_days(uuid, uuid, date, date) from public, anon;
grant execute on function app.attendance_days(uuid, uuid, date, date) to authenticated;
