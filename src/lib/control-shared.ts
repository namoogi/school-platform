/** 39·41차 관제 센터·대화창: 서버·브라우저 공용 상수·타입 (DB 의존 없음). ADR 0015·0017 */
export const STATUS = {
  pending: { label: '승인 대기', tone: 'warning' },
  open: { label: '답 기다림', tone: 'warning' },
  proceeding: { label: '추천안으로 진행 중', tone: 'info' },
  parked: { label: '보류(되돌리기 어려움)', tone: 'danger' },
  answered: { label: '전달 대기', tone: 'discovery' },
  delivered: { label: '세션 작업 중', tone: 'info' },
  review: { label: '결과 확인 필요', tone: 'warning' },
  done: { label: '끝남', tone: 'success' },
  dropped: { label: '접음', tone: 'neutral' },
} as const;
export type Status = keyof typeof STATUS;
export const NEEDS_USER: Status[] = ['pending', 'open', 'parked', 'proceeding'];
/** 대화창 숫자: 사람이 눌러야 다음으로 가는 것 (추천안 진행 중은 세션이 이미 움직이므로 빼다) */
export const BADGE: Status[] = ['pending', 'open', 'parked', 'review'];
export const CLOSED: Status[] = ['done', 'dropped'];

export const TOPIC = {
  control: { label: '관제 센터', hint: '플랫폼 전체 방향·결정·세션 지시' },
  school_ai: { label: '학교 AI', hint: '학교 자료·글·동화 같은 내용 작업' },
  site_ui: { label: '홈페이지 인터페이스', hint: '학교 홈페이지 화면·구성·디자인' },
  system: { label: '시스템 기능', hint: '플랫폼 기능 개선·오류 (학교 요청은 전체 관리자 승인 뒤 개발)' },
} as const;
export type Topic = keyof typeof TOPIC;
export const SCHOOL_TOPICS: Topic[] = ['school_ai', 'site_ui', 'system'];

/** 결정 카드 문 종류: 되돌리기 어려움(사람을 기다림) · 기한까지 반대 없으면 진행 · 알림만 (ADR 0048) */
export type Door = 'one_way' | 'default' | 'notice';
export const DOOR_ORDER: Door[] = ['one_way', 'default', 'notice'];

export type Option = { key: string; label: string; detail?: string };
export type Message = {
  id: number; author: 'user' | 'control' | 'session'; author_session: string | null; kind: string; choice: string | null; body: string;
  target_session: string | null; new_session: boolean; deliver: boolean; created_at: string; delivered_at: string | null; delivery_note: string | null;
  author_name?: string | null; mine?: boolean;
};
export type Request = {
  id: string; no: number; kind: 'decision' | 'directive' | 'chat'; title: string; detail: string; options: Option[]; recommended: string | null;
  reversible: boolean | null; related: string; lab_item_id: string | null; source_session: string | null; assignee_session: string | null;
  status: Status; topic: Topic; school_id: string | null; school_name?: string | null;
  /** 결정 카드(129차, ADR 0048). 옛 요청·지시·대화는 비어 있다 */
  door?: Door | null; ask?: string | null; default_action?: string | null; due_at?: string | null;
  changes?: string | null; unchanged?: string | null; undo?: string | null;
  author: string; created_at: string; updated_at: string; messages: Message[];
};
export type Session = { id: string; name: string; role: string; tags: string[]; active: boolean; school_id?: string | null };
export type ThreadSummary = Pick<Request, 'id' | 'no' | 'kind' | 'title' | 'status' | 'topic' | 'school_id' | 'school_name' | 'assignee_session' | 'door'> & {
  activity_at: string; last: { author: string; body: string; kind: string } | null;
};
