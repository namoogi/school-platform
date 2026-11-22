/**
 * 24차 디자인 원형(archetype) 목록. 색 조합이 아니라 탐색 구조·그리드·서체·밀도·상호작용이 서로 다른 화면 구조다.
 * 참고 제품은 '구조 원리'만 가져오며 로고·에셋·고유 화면을 복제하지 않는다.
 * 근거: docs/research/dashboard-rea-2026-11.md
 */
export type ArchetypeMeta = {
  slug: string;
  no: number;
  name: string;
  category: '학사·교육 행정' | '개발·업무 도구' | '엔터프라이즈·분석' | '문서·워크스페이스' | '공공 서비스';
  inspired: string;
  nav: string;
  grid: string;
  type: string;
  density: string;
  signature: string;
  fit: string;
  risk: string;
};

export const ARCHETYPES: ArchetypeMeta[] = [
  {
    slug: 'campus', no: 1, name: '학사 업무형', category: '학사·교육 행정',
    inspired: 'Canvas LMS · PowerSchool · Google Classroom의 수업 중심 구조',
    nav: '전역 아이콘 레일 + 학기·학교 선택 상단 막대 + 수업 카드에서 들어가는 맥락 탐색',
    grid: '본문 가변 + 오른쪽 할 일 열 320px',
    type: 'Pretendard · 본문 16px · 제목 28/20/16',
    density: '넉넉함 · 카드 위주 · 행 48px',
    signature: '수업 카드 격자와 마감순 할 일 목록, 다가오는 일정',
    fit: '교사·학교 관리자가 매일 여는 첫 화면',
    risk: '표가 많은 관리 업무(좌석·청구)에는 화면이 길어짐',
  },
  {
    slug: 'command', no: 2, name: '명령·목록형 고밀도', category: '개발·업무 도구',
    inspired: 'Linear · GitHub(Primer) · Vercel(Geist)의 키보드 중심 목록',
    nav: '좁은 사이드바(보기·저장된 필터) + 명령 팔레트(Ctrl K) + 단축키',
    grid: '목록 가변 + 오른쪽 속성 패널 340px',
    type: 'Inter + Pretendard · 본문 13px · 고정폭 숫자',
    density: '촘촘함 · 행 36px · 상태별 묶음',
    signature: '상태로 묶인 목록, 행 선택 → 속성 패널, 명령 팔레트',
    fit: '전체 관리자·숙련 관리자, 연구소·개발 보드',
    risk: '처음 쓰는 교사에게 낯설고 글자가 작음',
  },
  {
    slug: 'launchpad', no: 3, name: '런치패드 타일형', category: '엔터프라이즈·분석',
    inspired: 'SAP Fiori 런치패드 · Workday 홈의 역할별 타일',
    nav: '사이드바 없음 · 상단 셸 막대 + 역할별 타일 묶음 → 각 앱으로 이동',
    grid: '고정 폭 타일 격자(176px 단위) · 가운데 정렬 최대 1280px',
    type: 'IBM Plex Sans KR · 본문 14px · 타일 숫자 32px',
    density: '중간 · 타일 하나에 핵심 숫자 하나',
    signature: '숫자가 살아 있는 타일, 역할별 묶음, 앱 단위 진입',
    fit: '여러 모듈을 가진 학교(라이선스 모듈별 진입)',
    risk: '세부 작업은 각 앱 화면이 따로 필요, 홈이 메뉴판에 그침',
  },
  {
    slug: 'analytics', no: 4, name: '분석 대시보드형', category: '엔터프라이즈·분석',
    inspired: 'Grafana · Stripe 대시보드의 패널 격자와 기간 필터',
    nav: '상단 전역 필터(기간·학교급·학기) 고정 + 얇은 아이콘 사이드바',
    grid: '12열 패널 격자 · 패널 높이 단위 고정',
    type: 'Pretendard + JetBrains Mono 숫자 · 본문 13px · KPI 28px',
    density: '중간~촘촘 · 어두운 바탕',
    signature: '변화량이 붙은 KPI 띠, 추이 차트, 필터 하나로 모든 패널 갱신',
    fit: '전체 관리자의 학교 현황, 학기말 통계',
    risk: '숫자만 보고 할 일이 안 보임, 어두운 화면은 학교 사용자에게 낯섦',
  },
  {
    slug: 'workspace', no: 5, name: '문서 워크스페이스형', category: '문서·워크스페이스',
    inspired: 'Notion · Coda의 페이지 트리와 문서 속 표',
    nav: '페이지 트리 사이드바 + 빵부스러기 · 문서 안에 표·보드 보기 전환',
    grid: '읽기 폭 720px 가운데 열 · 표는 넓게 펼침',
    type: 'Noto Serif KR 제목 + Pretendard 본문 16px · 줄 간격 1.7',
    density: '여유로움 · 블록 단위',
    signature: '속성 블록, 콜아웃, 같은 자료를 표/보드로 바꿔 보기',
    fit: '규칙·양식·발행본처럼 문서가 중심인 업무, 학교 정체성',
    risk: '대량 표 작업·일괄 처리에는 느림',
  },
  {
    slug: 'public', no: 6, name: '공공 서비스 단일 열형', category: '공공 서비스',
    inspired: 'GOV.UK Design System · 범정부 UI/UX 디자인 시스템(KRDS)',
    nav: '사이드바 없음 · 머리말 + 한 줄 탐색, 한 화면 한 가지 일',
    grid: '단일 열 최대 960px (본문 2/3 + 관련 링크 1/3)',
    type: 'SUIT · 본문 18px (KRDS 17 · GOV.UK 19 사이) · 제목 40/27/21',
    density: '가장 넉넉함 · 터치 목표 48px',
    signature: '할 일 목록(완료·진행 중·시작 전), 단계별 안내, 큰 단추',
    fit: '컴퓨터에 익숙지 않은 교직원·보호자, 접근성 최우선 화면',
    risk: '정보가 한 화면에 적게 들어가 숙련 관리자에게는 느림',
  },
  {
    slug: 'grid', no: 7, name: '데이터 그리드형', category: '문서·워크스페이스',
    inspired: 'Airtable · 스프레드시트형 운영 도구',
    nav: '상단 표 탭 + 보기 목록 사이드바 + 도구 막대(필터·정렬·묶기)',
    grid: '화면 전체 폭 격자 · 첫 열 고정 · 행 펼침 슬라이드오버',
    type: 'Noto Sans KR · 본문 13px · 칸 머리에 형식 아이콘',
    density: '가장 촘촘 · 행 32px',
    signature: '칸 형식(선택·숫자·사람), 묶기, 행을 펼쳐 상세 편집',
    fit: '수업·명단·성적처럼 행이 많은 자료, 원본 대조',
    risk: '확정 판·원본 보존 규칙을 칸 편집이 흐리게 보이게 할 수 있음',
  },
  {
    slug: 'triage', no: 8, name: '3단 작업함형', category: '개발·업무 도구',
    inspired: '메일·고객지원 작업함(받은편지함 → 목록 → 상세)과 Sentry 이슈 분류',
    nav: '왼쪽 함(대기·답변함·전체) + 가운데 목록 + 오른쪽 상세',
    grid: '3단 분할 240 / 380 / 가변',
    type: 'IBM Plex Sans KR · 본문 14px · 근거 인용은 IBM Plex Mono',
    density: '중간 · 목록 행 2줄 72px',
    signature: '근거를 옆에 두고 바로 결정(확정·보류·되묻기), J/K 이동',
    fit: '자료 → 질문 → 확정 흐름(이 플랫폼의 핵심 업무)',
    risk: '질문 처리 외 화면에는 맞지 않음, 좁은 화면에서 단 접기 필요',
  },
];

export function archetypeBySlug(slug: string) {
  return ARCHETYPES.find((a) => a.slug === slug);
}
