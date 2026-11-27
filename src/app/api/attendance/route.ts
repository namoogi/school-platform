import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { recordAttendance } from '@/lib/attendance';
import { setCalendarDays } from '@/lib/foundation';
import { yearOfDay } from '@/lib/register';

/**
 * 74차: 출결(하루 출결부 저장·수업일 달력). 구성원 확인·코드 유효·수업일·학적·관리자 확인은 DB 명령 함수가 판정한다.
 * body.action: mark | calendar
 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    switch (b?.action) {
      case 'mark': {
        if (!Array.isArray(b.entries) || !b.entries.length || b.entries.length > 1000) throw new ValidationError('err.att.noRows');
        for (const e of b.entries) {
          await recordAttendance(db, school.id, { personId: e?.personId, day: b.day, scope: 'day', kind: String(e?.kind ?? ''),
            reason: e?.kind === 'present' ? '' : String(e?.reason ?? ''), note: String(e?.note ?? ''), correctionReason: String(b.reason ?? '') });
        }
        return { saved: b.entries.length };
      }
      case 'calendar': {
        // 기간(from~to)의 날들을 한 종류로. 주말 제외 선택. 같은 학년도 안이어야 한다
        const from = String(b.from ?? ''); const to = String(b.to ?? from);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new ValidationError('err.att.range');
        const y = await yearOfDay(db, school.id, from);
        if (!y) throw new ValidationError('err.att.noYear');
        const days: { day: string; kind: string; half_day: boolean; label?: string }[] = [];
        for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          if (b.skipWeekends === 'yes' && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
          days.push({ day: d.toISOString().slice(0, 10), kind: String(b.kind ?? 'instructional'), half_day: b.halfDay === 'yes', label: b.label ? String(b.label) : undefined });
          if (days.length > 400) throw new ValidationError('err.att.max400');
        }
        return { saved: await setCalendarDays(db, school.id, y.id, days) };
      }
      default: throw new ValidationError('err.unknownAction');
    }
  }, { module: 'records' });
}
