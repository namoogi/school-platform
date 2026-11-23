/** 39차 관제 센터: 서버·브라우저 공용 상수·타입 (DB 의존 없음). ADR 0015 */
export const STATUS = {
  open: { label: '답 기다림', tone: 'warning' },
  proceeding: { label: '추천안으로 진행 중', tone: 'info' },
  parked: { label: '보류(되돌리기 어려움)', tone: 'danger' },
  answered: { label: '전달 대기', tone: 'discovery' },
  delivered: { label: '세션에 전달됨', tone: 'info' },
  done: { label: '끝남', tone: 'success' },
  dropped: { label: '접음', tone: 'neutral' },
} as const;
export type Status = keyof typeof STATUS;
export const NEEDS_USER: Status[] = ['open', 'parked', 'proceeding'];

export type Option = { key: string; label: string; detail?: string };
export type Message = {
  id: number; author: 'user' | 'control' | 'session'; author_session: string | null; kind: string; choice: string | null; body: string;
  target_session: string | null; new_session: boolean; created_at: string; delivered_at: string | null; delivery_note: string | null;
};
export type Request = {
  id: string; no: number; kind: 'decision' | 'directive'; title: string; detail: string; options: Option[]; recommended: string | null;
  reversible: boolean | null; related: string; lab_item_id: string | null; source_session: string | null; status: Status;
  author: string; created_at: string; updated_at: string; messages: Message[];
};
export type Session = { id: string; name: string; role: string; tags: string[]; active: boolean };
