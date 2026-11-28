'use client';
import { StatusBadge } from '@/components/ui';
import { useI18n } from '@/components/I18nProvider';
import type { Door, Request } from '@/lib/control-shared';
import type { MsgKey } from '@/lib/i18n/catalog';

/** 129차 결정 카드(ADR 0048): 문 종류 표시. 색만으로 구분하지 않게 글자를 함께 쓴다 */
const TONE: Record<Door, 'danger' | 'warning' | 'neutral'> = { one_way: 'danger', default: 'warning', notice: 'neutral' };

export function DoorBadge({ door }: { door: Door }) {
  const { t } = useI18n();
  return <StatusBadge tone={TONE[door]} dot>{t(`dc.door.${door}` as MsgKey)}</StatusBadge>;
}

/** 질문 한 줄 → (기한) → 바뀌는 것 / 안 바뀌는 것 / 되돌리는 길. 카드 칸이 없는 옛 요청은 그리지 않는다 */
export function DecisionFacts({ r }: { r: Pick<Request, 'door' | 'ask' | 'default_action' | 'due_at' | 'changes' | 'unchanged' | 'undo'> }) {
  const { t, locale } = useI18n();
  if (!r.door) return null;
  const due = r.due_at ? new Date(r.due_at) : null;
  // 서버·브라우저가 같은 글자를 그리도록 시간대는 서울로 고정하고(관제 센터 다른 날짜와 같음), 읽는 사람이 헷갈리지 않게 시간대 이름을 붙인다
  const dueText = due?.toLocaleString(locale, { timeZone: 'Asia/Seoul', timeZoneName: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const rows: [string, string | null | undefined][] = [
    [t(r.door === 'notice' ? 'dc.changesNotice' : 'dc.changes'), r.changes], [t('dc.unchanged'), r.unchanged], [t('dc.undo'), r.undo],
  ];
  return (
    <div className="decision-card" data-door={r.door}>
      {r.ask && <p className="decision-ask">{r.ask}</p>}
      {r.door === 'default' && due && (
        <p className="decision-due">
          {t(due.getTime() < Date.now() ? 'dc.overdue' : 'dc.due', { when: dueText ?? '', action: r.default_action ?? '' })}
        </p>
      )}
      <dl className="decision-facts">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
