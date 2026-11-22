/**
 * 24차 디자인 원형 비교용 합성 자료. 모든 원형이 같은 내용을 그린다(실제 학생·교직원 정보 아님).
 * 장면: 드리미 예시학교 학교 관리자가 2학기 중간에 운영 현황을 보는 화면.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const SCHOOL = {
  name: '드리미 예시학교',
  short: '드리미',
  term: '2026학년도 2학기',
  week: '12주차',
  today: '11월 23일 (월)',
  user: { name: '김예시', role: '학교 관리자', initial: '김' },
  seats: { used: 18, total: 20 },
  modules: ['자료·규칙', '학사 문서', '성적·마감'],
  otherSchools: ['Rungarun Example School', '소망 예시학교'],
};

export type Question = {
  id: string; title: string; kind: '충돌' | '근거 부족' | '새 항목'; tone: Tone;
  source: string; location: string; evidence: string; current?: string; proposed: string;
  opened: string; age: string; status: '대기' | '답변함'; assignee: string;
};

export const QUESTIONS: Question[] = [
  { id: 'Q-118', title: '2학기 출석 인정 기준이 1학기 규칙과 다릅니다', kind: '충돌', tone: 'danger',
    source: '2학기_학사운영계획.docx', location: '3쪽 · 표 2', evidence: '질병 결석은 진단서 제출 시 3일까지 출석으로 인정한다.',
    current: '질병 결석은 학부모 확인서로 2일까지 인정 (1학기 확정)', proposed: '진단서 제출 시 3일까지 인정', opened: '11월 21일', age: '2일', status: '대기', assignee: '김예시' },
  { id: 'Q-117', title: "창의활동 '마을 지도 만들기' 학점 근거가 없습니다", kind: '근거 부족', tone: 'warning',
    source: '창의활동_승인목록.xlsx', location: '시트 1 · 14행', evidence: '마을 지도 만들기 | 담당 이샘플 | 학점 (빈 칸)',
    proposed: '2학점 (같은 유형 평균)', opened: '11월 20일', age: '3일', status: '대기', assignee: '김예시' },
  { id: 'Q-116', title: "발행용 표기명 '정보과학 탐구'를 새로 등록할까요?", kind: '새 항목', tone: 'info',
    source: '과목표기명_시트.csv', location: '22행', evidence: '프로그래밍과 AI → 정보과학 탐구',
    proposed: "실제 과목명 '프로그래밍과 AI'의 발행용 표기명으로 등록", opened: '11월 19일', age: '4일', status: '대기', assignee: '박교사' },
  { id: 'Q-112', title: '중학교 1기 학년 계산이 0학년으로 나옵니다', kind: '충돌', tone: 'danger',
    source: '학생명단_중등.xlsx', location: '시트 2 · B열', evidence: '입학 기수: 중1기', current: '기수 형식 \\d+기', proposed: "'중1기'를 중학교 1기로 해석", opened: '11월 15일', age: '8일', status: '답변함', assignee: '김예시' },
];

export type Source = { id: string; name: string; reader: 'XLSX' | 'DOCX' | 'PDF' | 'CSV'; rows: number; by: string; at: string; review: boolean; size: string };

export const SOURCES: Source[] = [
  { id: 'F-31', name: '2학기_학사운영계획.docx', reader: 'DOCX', rows: 42, by: '김예시', at: '11월 21일 14:02', review: false, size: '184KB' },
  { id: 'F-30', name: '창의활동_승인목록.xlsx', reader: 'XLSX', rows: 27, by: '이샘플', at: '11월 20일 09:40', review: false, size: '32KB' },
  { id: 'F-29', name: '과목표기명_시트.csv', reader: 'CSV', rows: 64, by: '박교사', at: '11월 19일 16:15', review: false, size: '6KB' },
  { id: 'F-28', name: '가정통신문_11월.pdf', reader: 'PDF', rows: 9, by: '김예시', at: '11월 18일 11:30', review: true, size: '412KB' },
  { id: 'F-27', name: '학생명단_중등.xlsx', reader: 'XLSX', rows: 38, by: '김예시', at: '11월 15일 10:05', review: false, size: '21KB' },
];

export type Course = {
  id: string; name: string; display: string; type: '선택' | '창의' | '필수'; level: '중' | '고';
  teacher: string; students: number; capacity: number; credits: number;
  status: '수강신청 중' | '진행 중' | '마감 판 확정'; tone: Tone; block: string; progress: number;
};

export const COURSES: Course[] = [
  { id: 'C-201', name: '프로그래밍과 AI', display: '정보과학 탐구', type: '선택', level: '고', teacher: '박교사', students: 14, capacity: 16, credits: 3, status: '진행 중', tone: 'info', block: 'A블록', progress: 68 },
  { id: 'C-202', name: '농사와 수리', display: '수학적 모델링', type: '선택', level: '고', teacher: '최샘플', students: 11, capacity: 12, credits: 2, status: '진행 중', tone: 'info', block: 'B블록', progress: 72 },
  { id: 'C-203', name: '기획과 마케팅', display: '경영 탐구', type: '선택', level: '고', teacher: '박교사', students: 16, capacity: 16, credits: 2, status: '마감 판 확정', tone: 'success', block: 'C블록', progress: 100 },
  { id: 'C-204', name: '마을 지도 만들기', display: '지역사회 탐구', type: '창의', level: '중', teacher: '이샘플', students: 9, capacity: 12, credits: 0, status: '진행 중', tone: 'warning', block: '창의', progress: 55 },
  { id: 'C-205', name: '선교전략과 국제개발', display: '국제개발 협력', type: '선택', level: '고', teacher: '정예시', students: 8, capacity: 14, credits: 2, status: '수강신청 중', tone: 'neutral', block: 'D블록', progress: 10 },
  { id: 'C-206', name: '공동체와 성경', display: '공동체 윤리', type: '필수', level: '중', teacher: '정예시', students: 22, capacity: 24, credits: 1, status: '진행 중', tone: 'info', block: '필수', progress: 64 },
];

export type Doc = { id: string; title: string; template: string; version: string; at: string; by: string; hash: string };

export const DOCUMENTS: Doc[] = [
  { id: 'D-09', title: '2학기 학사 일정 안내', template: '학사 안내 v3', version: '판 2', at: '11월 22일', by: '김예시', hash: 'a41f·09c2' },
  { id: 'D-08', title: '창의활동 운영 규정', template: '규정 v1', version: '판 1', at: '11월 12일', by: '김예시', hash: '7be0·11d4' },
  { id: 'D-07', title: '1학기 출결 기준', template: '규정 v1', version: '판 3', at: '8월 28일', by: '박교사', hash: '3c9a·e771' },
];

export type Task = { id: string; title: string; due: string; done: boolean; link: string };

export const TASKS: Task[] = [
  { id: 't1', title: '출석 인정 기준 충돌 확인 (Q-118)', due: '오늘', done: false, link: 'Q-118' },
  { id: 't2', title: '가정통신문 PDF 표 읽기 검토', due: '오늘', done: false, link: 'F-28' },
  { id: 't3', title: '창의활동 학점 근거 답변 (Q-117)', due: '11월 25일', done: false, link: 'Q-117' },
  { id: 't4', title: "'기획과 마케팅' 마감 판 확정", due: '11월 20일', done: true, link: 'C-203' },
  { id: 't5', title: '좌석 2개 남음: 추가 여부 결정', due: '11월 30일', done: false, link: 'seats' },
];

export const EVENTS = [
  { date: '11.25', day: '수', title: '창의활동 중간 발표', kind: '행사' },
  { date: '11.28', day: '토', title: '2학기 성적 입력 1차 마감', kind: '마감' },
  { date: '12.04', day: '금', title: '선택과목 수강신청 마감', kind: '마감' },
  { date: '12.18', day: '금', title: '학기말 마감 판 확정', kind: '마감' },
];

export const ACTIVITY = [
  { who: '김예시', what: "'2학기 학사 일정 안내' 판 2 발행", when: '어제 17:20' },
  { who: '박교사', what: '과목표기명_시트.csv 등록 · 64행', when: '11월 19일' },
  { who: '자동 판독', what: '가정통신문_11월.pdf 표 1개를 검토 필요로 표시', when: '11월 18일' },
  { who: '이샘플', what: '창의활동_승인목록.xlsx 등록 · 질문 1건 열림', when: '11월 20일' },
];

export const MEMBERS = [
  { name: '김예시', role: '학교 관리자', last: '방금' },
  { name: '박교사', role: '교사', last: '2시간 전' },
  { name: '이샘플', role: '교사', last: '어제' },
  { name: '최샘플', role: '교사', last: '3일 전' },
  { name: '정예시', role: '교사', last: '1주 전' },
];

/** 주별 추이(최근 8주): 자료 등록 행 수, 열린 질문, 닫힌 질문 */
export const TREND = {
  weeks: ['5주', '6주', '7주', '8주', '9주', '10주', '11주', '12주'],
  rows: [40, 12, 88, 64, 30, 22, 91, 133],
  opened: [2, 1, 5, 3, 1, 2, 4, 3],
  closed: [1, 2, 3, 4, 2, 1, 3, 1],
};

export const KPI = [
  { key: 'questions', label: '확인 대기 질문', value: '3', unit: '건', delta: '+1', tone: 'warning' as Tone, hint: '가장 오래된 것 4일' },
  { key: 'rows', label: '이번 주 등록 행', value: '133', unit: '행', delta: '+46%', tone: 'info' as Tone, hint: '자료 3개' },
  { key: 'courses', label: '마감 판 확정', value: '1', unit: '/ 6', delta: '17%', tone: 'success' as Tone, hint: '학기말 12월 18일' },
  { key: 'seats', label: '좌석 사용', value: '18', unit: '/ 20', delta: '90%', tone: 'neutral' as Tone, hint: '2석 남음' },
];

export const toneLabel: Record<Tone, string> = { neutral: '보통', info: '안내', success: '완료', warning: '주의', danger: '위험' };
