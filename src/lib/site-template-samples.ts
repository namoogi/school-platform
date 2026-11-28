import type { Content } from './site';
import type { SiteTemplate } from './site-templates';

/**
 * 86차: 템플릿 미리보기용 '예시 내용' — 지어낸 가상 학교로 안내 자리 `[ … ]`를 채워 완성 모습을 보여 준다.
 * 실제 학교·사람·연락처가 아니다(주소는 '가상시', 메일은 예약 도메인 example.org, 전화는 0으로 채움).
 * 미리보기 화면에서만 쓰고, 템플릿 적용(시안 쪽 만들기)에는 쓰지 않는다 — 학교 쪽에는 안내 자리가 그대로 들어간다.
 *
 * 값이 배열이면 같은 안내 자리가 여러 번 나올 때 차례대로 쓴다(쪽 순서 → 내용 칸 순서).
 */
export type TemplateSample = {
  school: string; text: Record<string, string | string[]>;
  /** 89차: 예시 그림 — [쪽, ...칸 경로] 에 놓을 그림 이름(public/site-templates/img/<이름>). 그림 만들기 안내: docs/design/template-image-prompts.md */
  images?: { at: (string | number)[]; name: string }[];
};

const contact = (name: string, phone: string, email: string, address: string, tagline: string) => ({
  '[학교 이름]': name, '[대표 전화]': phone, '[이메일]': email, '[학교 주소]': address, '[학교를 한 줄로 소개하는 말]': tagline,
});

export const TEMPLATE_SAMPLES: Record<string, TemplateSample> = {
  notice: {
    school: '물빛초등학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'notice-hero' }],
    text: {
      ...contact('물빛초등학교', '000-000-0000', 'office@example.org', '가상시 물빛구 배움로 12', '서로 배우고 함께 자라는 마을 학교'),
      // 107차(가상 예시)
      '[입학·전학 안내 한 줄]': '전입 서류와 첫날 안내',
      '[알림 행사 1 날짜]': '11.11', '[알림 행사 1]': '재량 휴업일', '[알림 행사 1 안내]': '돌봄교실은 평소처럼 운영합니다',
      '[알림 행사 2 날짜]': '11.20', '[알림 행사 2]': '학부모 상담 주간', '[알림 행사 2 안내]': '20~24일, 담임과 15분 상담',
      '[알림 행사 3 날짜]': '11.28', '[알림 행사 3]': '학예회', '[알림 행사 3 안내]': '오전 10시 강당, 가족 누구나',
      '[알림 입학 문의]': '교무실에 전화로 전입 날짜를 알려 주세요', '[알림 입학 서류]': '주민센터 전입 신고 뒤 학교에 서류 제출', '[알림 배정 안내]': '반 배정과 첫날 준비물을 안내합니다',
      '[알림 서류 1]': '재학 증명서', '[알림 서류 1 설명]': '전에 다니던 학교에서 발급(전학의 경우)',
      '[알림 서류 2]': '예방 접종 확인', '[알림 서류 2 설명]': '보건실에서 확인합니다',
      '[알림 입학 연락처]': '교무실 000-000-0000 · office@example.org · 평일 오전 9시~오후 4시',
      '[학교를 한 문장으로 — 예: 마을과 함께 자라는 학교]': '마을과 함께 자라는 우리 동네 학교',
      '[이번 주 가장 중요한 알림 한 줄 — 예: 다음 주 월요일 재량 휴업일]': '다음 주 월요일(11일)은 재량 휴업일입니다. 돌봄교실은 평소처럼 운영합니다.',
      '[이번 달 주요 일정]': '11일 재량 휴업 · 20일 학부모 상담 주간 · 28일 학예회',
      '[이번 달 식단표는 학교 생활 쪽에]': '이번 달 식단표와 알레르기 표시를 확인하세요.',
      '[대중교통·주차 안내]': '버스 정류장에서 걸어서 5분, 방문 차량은 후문 주차장을 이용합니다.',
      '[교장 인사말 3~5문장]': '물빛초등학교 홈페이지를 찾아 주셔서 고맙습니다. 우리 학교는 아이 한 명 한 명이 자기 속도로 배우고, 친구와 함께 자라는 곳이 되려 합니다. 가정과 학교가 자주 이야기 나눌수록 아이들은 더 단단해집니다. 궁금한 점은 언제든 교무실로 연락해 주세요.',
      '[교육 목표 1]': '스스로 배우는 어린이',
      '[교육 목표 2]': '함께 살아가는 어린이',
      '[설명]': ['질문을 품고 끝까지 탐구하는 힘을 기릅니다.', '서로 돕고 다름을 존중하는 태도를 기릅니다.'],
      '[연도]': ['1998년', '2021년'],
      '[개교·주요 일]': '물빛초등학교 개교(6학급)',
      '[주요 일]': '마을 연계 생태 교육 시작, 학교 숲 조성',
      '[주소·대중교통·주차]': '가상시 물빛구 배움로 12 · 물빛시장 정류장 하차 후 도보 5분 · 후문 방문자 주차장(10대)',
      '[월]': '11월',
      '[주요 일정]': '11일 재량 휴업 · 20~24일 학부모 상담 주간 · 28일 학예회',
      '[급식 운영 안내 · 이번 달 식단표는 PDF로 올려 주세요]': '점심은 학교 급식실에서 직접 조리합니다. 이번 달 식단표는 첨부 파일로 올려 두었습니다.',
      '[운영 시간·신청 방법]': '방과후 수업은 오후 1시 50분부터 4시까지, 돌봄교실은 오후 6시까지 운영합니다. 신청은 학기 시작 2주 전에 가정통신문으로 받습니다.',
      // 126차(가상 예시): 학교 상징·상담·가정통신문
      '[알림 상징 1]': '교표', '[알림 상징 1 설명]': '물방울 안에 새싹을 담아 함께 자라는 배움을 나타냅니다.',
      '[알림 상징 2]': '교목 · 느티나무', '[알림 상징 2 설명]': '마을 어귀를 지켜 온 나무처럼 넉넉한 그늘이 되자는 뜻입니다.',
      '[알림 상징 3]': '교화 · 개나리', '[알림 상징 3 설명]': '봄을 가장 먼저 알리는 밝은 마음을 닮자는 뜻입니다.',
      '[알림 상담 안내]': '고민이 있으면 언제든 담임 선생님이나 상담실(2층)을 찾아 주세요. 학교폭력은 학교 대표 전화 000-000-0000 또는 117(학교폭력 신고 센터)로 알릴 수 있습니다. 알린 사람의 비밀은 지켜집니다.',
      '[알림 가정통신문 안내]': '가정통신문은 아이 편으로 보내고, 같은 내용을 이 쪽과 소식에 올립니다. 회신이 필요한 통신문은 기한 안에 담임 선생님께 보내 주세요.',
      '[알림 통신문 1 날짜]': '11.04', '[알림 통신문 1]': '학부모 상담 주간 신청', '[알림 통신문 1 안내]': '희망 시간을 11월 14일까지 회신해 주세요',
      '[알림 통신문 2 날짜]': '10.28', '[알림 통신문 2]': '학예회 관람 안내', '[알림 통신문 2 안내]': '좌석 안내와 주차 방법',
      '[알림 통신문 3 날짜]': '10.15', '[알림 통신문 3]': '겨울 방과후 수업 신청', '[알림 통신문 3 안내]': '과목별 시간표와 신청 방법',
    },
  },
  story: {
    school: '숲속이야기학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'story-hero' }, { at: ['home', 'blocks', 2, 'asset'], name: 'story-day' }, { at: ['admission', 'blocks', 4, 'asset'], name: 'story-learning' }, { at: ['learning', 'blocks', 0, 'asset'], name: 'story-learning' },
      { at: ['learning', 'blocks', 1, 'asset'], name: 'story-season-3' }, { at: ['philosophy', 'blocks', 2, 'asset'], name: 'story-hero' }, { at: ['community', 'blocks', 0, 'asset'], name: 'story-season-2' },
      ...[1, 2, 3, 4].map((n) => ({ at: ['home', 'blocks', 3, 'items', n - 1, 'asset'], name: `story-season-${n}` })),
      // 124차 뒤(선생님): 풍성한 밥상 사진은 학교 모습과 어긋나 사계절 다섯째 칸·공동체 쪽에서 뺐다
      { at: ['home', 'blocks', 3, 'items', 4, 'asset'], name: 'story-learning' }],
    text: {
      ...contact('숲속이야기학교', '000-000-0000', 'hello@example.org', '가상시 숲길면 오솔길 7', '숲에서 묻고, 함께 답을 찾는 학교'),
      // 107차: 바로가기·숫자 띠·일정·목소리·입학 안내(가상 예시)
      '[이야기 바로가기 설명 1]': '아이의 질문에서 시작하는 배움', '[이야기 바로가기 설명 2]': '숲길에서 저녁 나눔까지', '[이야기 바로가기 설명 3]': '견학·상담·지원 순서', '[이야기 바로가기 설명 4]': '학교의 이야기와 알림',
      '[이야기 숫자 띠 제목]': '작은 학교라서 가능한 것',
      '[이야기 숫자 1]': '1998', '[이야기 숫자 1 설명]': '숲속 작은 집에서 문을 연 해', '[이야기 숫자 2]': '12명', '[이야기 숫자 2 설명]': '한 반 학생 수',
      '[이야기 숫자 3]': '6개', '[이야기 숫자 3 설명]': '학년이 섞인 배움 모둠', '[이야기 숫자 4]': '주 2일', '[이야기 숫자 4 설명]': '숲과 마을에서 여는 수업',
      '[이야기 행사 1 날짜]': '5.12', '[이야기 행사 1]': '학교 여는 날', '[이야기 행사 1 안내]': '숲길 산책과 수업 둘러보기',
      '[이야기 행사 2 날짜]': '6.21', '[이야기 행사 2]': '여름 텃밭 잔치', '[이야기 행사 2 안내]': '함께 기른 채소로 점심을 나눠요',
      '[이야기 행사 3 날짜]': '7.15', '[이야기 행사 3]': '배움 나눔 날', '[이야기 행사 3 안내]': '한 학기 탐구를 가족 앞에서 발표해요',
      '[공개에 동의한 분의 말만 싣습니다]': '예시 글입니다. 실제로는 공개에 동의한 분의 말만 싣습니다.',
      '[이야기 말한 사람 1]': '학부모 · 3학년', '[이야기 목소리 1]': '아이가 저녁마다 오늘 숲에서 찾은 질문을 이야기해요.',
      '[이야기 말한 사람 2]': '졸업생 · 2024년', '[이야기 목소리 2]': '모르는 것을 부끄러워하지 않는 법을 여기서 배웠습니다.',
      '[이야기 말한 사람 3]': '교사', '[이야기 목소리 3]': '정답을 알려 주기보다 질문 곁에 오래 머무는 법을 함께 배웁니다.',
      '[이야기 문의 방법]': '전화·메일로 원하는 날짜를 알려 주세요', '[이야기 견학 일정]': '매달 둘째 토요일 오전 학교 둘러보기', '[이야기 지원 서류·면담]': '지원서와 가족 면담', '[이야기 결과·등록]': '면담 뒤 2주 안에 안내',
      '[이야기 수업료]': '학기 수업료', '[이야기 수업료 안내]': '예시 금액은 싣지 않습니다. 실제 금액은 학교 자료대로 안내합니다.', '[이야기 기타 비용]': '급식·체험', '[이야기 기타 비용 안내]': '급식은 월별, 숲 체험은 학기별로 따로 안내합니다.',
      '[이야기 질문 1]': '학년 중간에도 입학할 수 있나요?', '[이야기 답 1]': '자리가 있으면 가능합니다. 먼저 견학을 신청해 주세요.',
      '[이야기 질문 2]': '숲 수업은 비 오는 날에도 하나요?', '[이야기 답 2]': '안전한 날씨에는 우비를 입고, 그렇지 않으면 실내 공방에서 수업합니다.',
      '[이야기 질문 3]': '부모 참여가 꼭 필요한가요?', '[이야기 답 3]': '한 달에 한 번 학교 살림 모임에 함께해 주시기를 부탁드립니다.',
      '[이야기 첫걸음 이야기]': '첫 주에는 숲길 산책과 짧은 수업으로 천천히 시작합니다. 담임 교사가 매일 저녁 가정에 하루 이야기를 전합니다.',
      '[이야기 신청 안내]': '견학·상담 신청 양식의 예시입니다. 미리보기에서는 보내지지 않습니다.',
      '[학교가 믿는 것을 한 문장으로]': '아이는 이미 배우는 사람입니다',
      '[다가오는 행사 — 예: 5월 12일 학교 여는 날]': '5월 12일 · 학교 여는 날',
      '[행사 한 줄 안내]': '오전 10시, 숲길 산책과 수업 둘러보기. 가족 누구나 오세요.',
      '[사진으로 보는 우리 학교]': '사진으로 보는 숲속의 한 해',
      '[사진 이름 1]': '봄 숲길', '[사진 이름 2]': '여름 텃밭', '[사진 이름 3]': '가을 공방', '[사진 이름 4]': '겨울 도서실', '[사진 이름 5]': '숲 관찰 시간',
      // 126차(가상 예시): 걸어온 길·학교의 하루
      '[이야기 연혁 1]': '2012년', '[이야기 연혁 1 내용]': '학부모 열두 가정이 숲 학교 모임을 시작했습니다.',
      '[이야기 연혁 2]': '2015년', '[이야기 연혁 2 내용]': '숲길면 옛 분교 건물을 고쳐 학교 문을 열었습니다.',
      '[이야기 연혁 3]': '2021년', '[이야기 연혁 3 내용]': '마을 공방과 텃밭을 함께 쓰는 배움터로 넓혔습니다.',
      '[이야기 하루 1]': '08:40 아침 숲길', '[이야기 하루 1 내용]': '숲길을 함께 걸으며 오늘의 질문을 나눕니다.',
      '[이야기 하루 2]': '09:30 모둠 프로젝트', '[이야기 하루 2 내용]': '학년이 섞인 모둠으로 주제 탐구를 이어 갑니다.',
      '[이야기 하루 3]': '12:10 함께 짓는 점심', '[이야기 하루 3 내용]': '당번이 밥을 짓고 모두 둘러앉아 먹습니다.',
      '[이야기 하루 4]': '13:30 손으로 배우기', '[이야기 하루 4 내용]': '악기·목공·텃밭 가운데 하나를 고릅니다.',
      '[이야기 하루 5]': '15:40 둥글게 마무리', '[이야기 하루 5 내용]': '오늘 배운 것과 내일의 질문을 이야기합니다.',
      '[학교를 처음 만나는 분께 드리는 두 문장]': '우리는 아이의 질문에서 수업을 시작합니다. 숲과 마을이 교실이고, 어른은 함께 걷는 안내자입니다.',
      '[아침부터 저녁까지, 우리 학교의 하루]': '아침 숲길에서 저녁 나눔까지',
      '[하루 흐름을 이야기처럼]': '아침에는 숲길을 걸으며 하루를 엽니다. 오전에는 학년이 섞인 모둠으로 프로젝트를 하고, 점심은 함께 지은 밥을 나눕니다. 오후에는 악기·목공·텃밭 가운데 하나를 고르고, 하루 끝에는 둥글게 앉아 배운 것을 이야기합니다.',
      '[학교를 세운 마음을 담은 한마디]': '빨리 가르치기보다, 깊이 배우게 하고 싶었습니다.',
      '[가치 1]': '질문', '[가치 2]': '관계', '[가치 3]': '돌봄',
      '[설명]': ['정답보다 좋은 질문을 귀하게 여깁니다.', '학생·교사·가정이 서로 이름을 부르는 공동체를 만듭니다.', '자연과 이웃을 돌보는 일을 배움으로 삼습니다.'],
      '[배움의 방식]': '주제로 엮는 배움',
      '[수업이 어떻게 이루어지는지]': '한 학기에 하나의 큰 주제(예: 물, 씨앗, 마을)를 정하고, 읽기·셈하기·관찰·만들기를 그 주제 안에서 함께 배웁니다.',
      '[학년·과정]': ['1–2학년 · 감각과 발견', '3–4학년 · 질문과 탐구', '5–6학년 · 연결과 실천'],
      '[주요 배움]': ['이야기와 놀이로 읽기·셈하기의 기초를 다집니다.', '숲과 마을을 관찰하고, 작은 실험과 기록으로 질문을 키웁니다.', '탐구 보고서와 발표로 배운 것을 정리하고 마을에 나눕니다.'],
      '[만들며 배우는 제목]': '생각은 손끝에서 자랍니다', '[만들며 배우는 설명]': '나무를 다듬고 씨앗을 심는 동안 길이와 시간을 배우고, 친구와 도구를 나누며 협력하는 법을 익힙니다.',
      '[철학 사진 제목]': '교실의 문을 열면, 숲입니다', '[철학 사진 설명]': '날씨와 계절이 바뀔 때마다 교과서도 달라집니다. 어제와 다른 숲길에서 질문을 발견하고, 스스로 답을 찾아가는 시간을 지켜 줍니다.',
      '[공동체 일정]': ['매달 둘째 토요일', '한 달에 한 번', '학기 마지막 주'], '[공동체 활동]': ['학교 여는 날 · 가족과 숲길을 걷고 교실을 둘러봅니다.', '학교 살림 모임 · 가정과 교사가 함께 다음 달을 준비합니다.', '배움 나눔 날 · 학생의 발견과 작품을 이웃에게 소개합니다.'],
      '[학부모·교사·학생이 함께하는 방식]': '한 달에 한 번 가정과 교사가 함께 학교 살림을 의논하고, 학기 끝에는 학생이 배운 것을 가족 앞에서 발표합니다.',
      '[견학·상담 안내]': '매달 둘째 토요일 오전에 학교 둘러보기를 엽니다. 000-000-0000 · hello@example.org로 원하는 날짜와 방문 인원을 알려 주세요.',
    },
  },
  admissions: {
    school: '새솔아카데미',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'admissions-hero' }, { at: ['home', 'blocks', 2, 'items', 0, 'asset'], name: 'admissions-class' }, { at: ['home', 'blocks', 2, 'items', 1, 'asset'], name: 'admissions-books' }, { at: ['home', 'blocks', 2, 'items', 2, 'asset'], name: 'admissions-mentor' }],
    text: {
      ...contact('새솔아카데미', '000-000-0000', 'admissions@example.org', '가상시 새솔구 미래로 30', '작은 학급, 깊은 배움'),
      // 107차(가상 예시)
      '[입학 바로가기 설명 1]': '작은 학급과 두 언어 수업', '[입학 바로가기 설명 2]': '기초·심화 과정', '[입학 바로가기 설명 3]': '절차·학비·질문', '[입학 바로가기 설명 4]': '학교 소식과 설명회',
      '[입학 숫자 띠 제목]': '작은 학급이 만드는 차이',
      '[입학 숫자 1]': '15명', '[입학 숫자 1 설명]': '한 반 최대 학생 수', '[입학 숫자 2]': '2개', '[입학 숫자 2 설명]': '수업 언어(국어·영어)',
      '[입학 숫자 3]': '1:1', '[입학 숫자 3 설명]': '9학년부터 진로 멘토', '[입학 숫자 4]': '12년', '[입학 숫자 4 설명]': '1~12학년 한 캠퍼스',
      '[공개에 동의한 분의 말만 싣습니다]': '예시 글입니다. 실제로는 공개에 동의한 분의 말만 싣습니다.',
      '[입학 말한 사람 1]': '학부모 · 4학년', '[입학 목소리 1]': '선생님이 아이의 질문 하나하나를 기억해 주세요.',
      '[입학 말한 사람 2]': '졸업생 · 2025년', '[입학 목소리 2]': '멘토와 함께 세운 진로 계획이 대학 선택의 기준이 됐어요.',
      '[입학 말한 사람 3]': '학부모 · 8학년', '[입학 목소리 3]': '두 언어로 배우면서도 기초가 탄탄해졌습니다.',
      '[입학 행사 1 날짜]': '9.13', '[입학 행사 1]': '1차 입학 설명회', '[입학 행사 1 안내]': '오전 10시 강당, 학교 둘러보기 포함',
      '[입학 행사 2 날짜]': '10.11', '[입학 행사 2]': '2차 입학 설명회', '[입학 행사 2 안내]': '수업 참관과 Q&A',
      '[입학 행사 3 날짜]': '11.01', '[입학 행사 3]': '원서 접수 시작', '[입학 행사 3 안내]': '온라인 접수, 11월 말 마감',
      '[Admissions quick link 1]': 'Small classes, two languages', '[Admissions quick link 2]': 'Foundation and advanced courses', '[Admissions quick link 3]': 'Steps, fees and FAQ', '[Admissions quick link 4]': 'News and open days',
      '[Admissions stats title]': 'What small classes make possible',
      '[Admissions number 1]': '15', '[Admissions number 1 label]': 'students per class at most', '[Admissions number 2]': '2', '[Admissions number 2 label]': 'teaching languages',
      '[Admissions number 3]': '1:1', '[Admissions number 3 label]': 'career mentor from grade 9', '[Admissions number 4]': '12', '[Admissions number 4 label]': 'grades on one campus',
      '[Only words shared with consent]': 'Sample text. In practice we only share words with the speaker\'s consent.',
      '[Admissions speaker 1]': 'Parent · grade 4', '[Admissions voice 1]': 'Teachers remember every question my child asks.',
      '[Admissions speaker 2]': 'Graduate · 2025', '[Admissions voice 2]': 'The plan I made with my mentor guided my university choice.',
      '[Admissions speaker 3]': 'Parent · grade 8', '[Admissions voice 3]': 'Learning in two languages, the basics still grew strong.',
      '[Admissions event 1 date]': '9.13', '[Admissions event 1]': 'First open day', '[Admissions event 1 note]': '10 am in the hall, with a campus tour',
      '[Admissions event 2 date]': '10.11', '[Admissions event 2]': 'Second open day', '[Admissions event 2 note]': 'Class visits and Q&A',
      '[Admissions event 3 date]': '11.01', '[Admissions event 3]': 'Applications open', '[Admissions event 3 note]': 'Online, closing end of November',
      '[School name]': 'Saesol Academy',
      // 115차: 영어 화면용 예시(가상)
      '[One line about the school]': 'Small classes, deep learning', '[Address]': '30 Mirae-ro, Saesol-gu, Example City', '[Phone]': '000-000-0000', '[Email]': 'admissions@example.org',
      '[Difference 1]': 'Small classes', '[Difference 2]': 'Two-language lessons', '[Difference 3]': 'Career mentoring',
      '[One fact that shows it]': 'Every class has 15 students or fewer.',
      '[Evidence]': ['Theme lessons run in both Korean and English.', 'From grade 9, each student meets a mentor every term.'],
      '[A graduate or parent story]': '“For the first time, asking questions became fun”',
      '[A real story, names only with permission]': 'Sample text. Real stories are shared with names only when graduates or parents give permission.',
      '[Number of students]': '180', '[Students per teacher]': '9',
      '[Description]': ['from grade 1 to grade 12', 'counting teachers who teach and counsel', 'Foundations of reading, maths and inquiry', 'Career exploration and a graduation project'],
      '[Course 1]': 'Foundation (grades 1–6)', '[Course 2]': 'Advanced (grades 7–12)',
      '[How to enquire]': 'Phone, email or the enquiry form', '[Schedule]': 'Visits and meetings every Wednesday afternoon',
      '[Documents · assessment]': 'Application, school record copy, student interview', '[Results · enrolment]': 'Result within two weeks of the interview; enrolment confirmed on payment',
      '[Tuition]': 'Term tuition', '[Amount · payment]': 'Sample only · paid before term starts (actual fees from school documents)',
      '[Other costs]': 'Meals and trips', '[Boarding, meals, trips]': 'Meals are billed monthly and trips each term.',
      '[Question]': 'Can my child join mid-term?', '[Answer]': 'Yes, if a place is available. Please contact us first.',
      '[One line about booking]': 'Leave your details to book a visit or a meeting. Our admissions team will contact you.',
      '[Contact · visiting days]': 'Admissions 000-000-0000 · visits on Wednesday afternoons',
      '[신청 안내 한 줄]': '견학이나 상담을 원하시면 남겨 주세요. 입학 담당이 연락드립니다.',
      '[우리 학교를 고르는 이유 한 문장]': '한 반 열다섯 명, 한 명도 놓치지 않습니다',
      '[Why families choose us]': 'Fifteen students per class, no one left behind',
      '[차별점 1]': '작은 학급', '[차별점 2]': '두 언어 수업', '[차별점 3]': '진로 멘토링',
      '[근거가 되는 사실 한 줄]': '모든 학급이 15명 이하입니다.',
      '[근거]': ['국어·영어로 주제 수업을 함께 진행합니다.', '9학년부터 담당 멘토와 학기마다 진로 상담을 합니다.'],
      '[졸업생·학부모 이야기]': '“처음으로 질문하는 게 즐거워졌어요”',
      '[실제 이야기 — 이름은 허락받은 경우만]': '예시 글입니다. 실제 이야기는 졸업생·학부모의 허락을 받아 이름과 함께 싣습니다.',
      '[학생 수]': '180명', '[교사 1인당 학생]': '9명',
      '[설명]': ['1학년부터 12학년까지', '수업·상담을 맡는 교사 기준', '읽기·셈하기·탐구의 기초', '진로 탐색과 졸업 프로젝트'],
      '[과정 1]': '기초 과정(1~6학년)', '[과정 2]': '심화 과정(7~12학년)',
      '[문의 방법]': '전화·메일·문의 양식',
      '[일정]': '매주 수요일 오후 견학·상담',
      '[서류·전형]': '지원서, 생활기록 사본, 학생 면담',
      '[발표·등록]': '면담 뒤 2주 안에 결과 안내, 등록금 납부로 확정',
      '[수업료]': '학기 수업료', '[금액·납부]': '예시 금액 · 학기 시작 전 납부(실제 금액은 학교 자료대로)',
      '[기타 비용]': '급식·체험학습', '[기숙사·급식·체험 등]': '급식은 월별, 체험학습은 학기별로 따로 안내합니다.',
      '[질문]': '학기 중에도 입학할 수 있나요?', '[답]': '자리가 있으면 가능합니다. 먼저 문의해 주세요.',
      '[연락처·견학 가능 요일]': '입학 담당 000-000-0000 · 견학은 매주 수요일 오후',
    },
  },
  project: {
    school: '두레프로젝트학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'project-hero' }, { at: ['projects', 'blocks', 0, 'items', 0, 'asset'], name: 'project-river' }, { at: ['projects', 'blocks', 0, 'items', 1, 'asset'], name: 'project-market' }, { at: ['projects', 'blocks', 0, 'items', 2, 'asset'], name: 'project-work-6' },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ at: ['home', 'blocks', 2, 'items', n - 1, 'asset'], name: `project-work-${n}` })),
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ at: ['works', 'blocks', 0, 'items', n - 1, 'asset'], name: `project-work-${n}` })),
      { at: ['how-we-learn', 'blocks', 0, 'asset'], name: 'project-hero' }, { at: ['admission', 'blocks', 4, 'asset'], name: 'project-market' },
      ...['project-river', 'project-market', 'project-work-6'].flatMap((name, n) => [{ at: ['how-we-learn', 'blocks', 2, 'items', n, 'asset'], name }, { at: ['home', 'blocks', 5, 'items', n, 'asset'], name }])],
    text: {
      ...contact('두레프로젝트학교', '000-000-0000', 'project@example.org', '가상시 두레읍 마당길 3', '질문에서 시작해 세상에 내놓는 배움'),
      // 107차(가상 예시)
      '[프로젝트 바로가기 설명 1]': '질문 → 탐구 → 산출 → 나눔', '[프로젝트 바로가기 설명 2]': '이번 학기 프로젝트 목록', '[프로젝트 바로가기 설명 3]': '공개 허가 받은 작품 기록', '[프로젝트 바로가기 설명 4]': '견학·상담·지원 순서',
      '[프로젝트 숫자 띠 제목]': '한 해 동안 학생들이 한 일',
      '[프로젝트 숫자 1]': '24개', '[프로젝트 숫자 1 설명]': '한 해 동안 마친 프로젝트', '[프로젝트 숫자 2]': '9명', '[프로젝트 숫자 2 설명]': '함께한 마을 멘토',
      '[프로젝트 숫자 3]': '2번', '[프로젝트 숫자 3 설명]': '학기마다 여는 발표회', '[프로젝트 숫자 4]': '100%', '[프로젝트 숫자 4 설명]': '공개 허가를 받고 싣는 작품',
      '[프로젝트 행사 1 날짜]': '6.14', '[프로젝트 행사 1]': '상반기 발표회', '[프로젝트 행사 1 안내]': '마을회관에서 프로젝트 결과를 발표해요',
      '[프로젝트 행사 2 날짜]': '6.28', '[프로젝트 행사 2]': '작품 전시 주간', '[프로젝트 행사 2 안내]': '학교 공방을 전시장으로 열어요',
      '[프로젝트 행사 3 날짜]': '9.06', '[프로젝트 행사 3]': '새 학기 질문 모으기', '[프로젝트 행사 3 안내]': '마을 어른들과 다음 질문을 찾아요',
      '[프로젝트 문의 방법]': '전화·메일·문의 양식', '[프로젝트 견학 일정]': '발표회 주간과 매주 금요일 오후', '[프로젝트 지원 서류·면담]': '지원서와 관심 주제 면담', '[프로젝트 결과·등록]': '면담 뒤 2주 안에 안내',
      '[프로젝트 수업료]': '학기 수업료', '[프로젝트 수업료 안내]': '예시 금액은 싣지 않습니다. 실제 금액은 학교 자료대로 안내합니다.', '[프로젝트 기타 비용]': '재료·현장 학습', '[프로젝트 기타 비용 안내]': '프로젝트 재료비와 현장 학습비는 학기별로 안내합니다.',
      '[프로젝트 질문 1]': '교과 공부는 어떻게 하나요?', '[프로젝트 답 1]': '읽기·수학·과학은 프로젝트 안에서, 기초는 따로 시간을 두어 익힙니다.',
      '[프로젝트 질문 2]': '작품 사진은 어떻게 공개되나요?', '[프로젝트 답 2]': '학생과 보호자가 허락한 작품만 홈페이지에 싣습니다.',
      '[프로젝트 질문 3]': '멘토는 어떤 분들인가요?', '[프로젝트 답 3]': '마을에서 일하는 연구자·상인·장인이 분야별로 함께합니다.',
      '[프로젝트 첫걸음 이야기]': '새로 온 학생은 첫 달에 선배 프로젝트 모둠에 들어가 질문을 찾는 법부터 함께 익힙니다.',
      '[프로젝트 신청 안내]': '견학·상담 신청 양식의 예시입니다. 미리보기에서는 보내지지 않습니다.',
      '[이번 학기 결과물]': '이번 학기, 학생들이 만든 것',
      '[학생·보호자 공개 허가를 받은 작품만 싣습니다]': '학생·보호자 공개 허가를 받은 작품만 싣습니다. 분야를 눌러 골라 보세요.',
      '[작품 이름 1]': '하천 수질 지도', '[작품 이름 2]': '마을 장터 가계부', '[작품 이름 3]': '골목 벽화 시안', '[작품 이름 4]': '빗물 저금통 시제품', '[작품 이름 5]': '어르신 인터뷰 영상', '[작품 이름 6]': '나무 의자 만들기',
      '[분야 1]': '과학', '[분야 2]': '사회', '[분야 3]': '예술',
      '[이름 · 맡은 분야]': ['김가상 · 환경 과학', '이예시 · 지역 경제', '박샘플 · 목공과 디자인', '김가상 · 환경 과학', '이예시 · 지역 경제', '박샘플 · 목공과 디자인'],
      '[한 줄 소개]': ['하천 조사를 20년 해 온 마을 연구자', '협동조합에서 장터를 꾸리는 멘토', '마을 공방을 운영하는 목수', '하천 조사를 20년 해 온 마을 연구자', '협동조합에서 장터를 꾸리는 멘토', '마을 공방을 운영하는 목수'],
      '[학년 1]': '5~6학년', '[학년 2]': '3~4학년',
      '[문제를 찾고, 탐구하고, 만들어 나눕니다]': '우리 마을의 문제를 찾고, 탐구하고, 만들어 나눕니다',
      '[학생이 질문을 찾는 방법]': '마을 걷기와 인터뷰로 풀고 싶은 질문을 고릅니다.',
      '[자료·현장·전문가]': '자료 조사, 현장 방문, 전문가 만남으로 답을 찾습니다.',
      '[만드는 것]': '지도·영상·제품·제안서처럼 쓸모 있는 결과물을 만듭니다.',
      '[발표·전시]': '학기 끝 발표회에서 마을 분들께 보여 드리고 의견을 듣습니다.',
      '[학교의 설명]': '배운 것을 실제 문제에 써 볼 때 지식은 오래 남습니다. 학생은 프로젝트를 고르고 계획하며, 스스로 정한 일에 책임지는 법을 배웁니다.',
      '[주차]': ['01–03주 · 발견', '04–10주 · 탐구', '11–14주 · 제작', '15주 · 나눔'],
      '[활동]': ['마을을 걸으며 질문을 찾고 함께 풀 문제를 정합니다.', '자료와 현장을 오가며 가설을 시험하고 작은 시제품을 만듭니다.', '멘토와 친구의 의견을 듣고 결과물을 고쳐 만듭니다.', '발표회에서 과정을 설명하고 다음 탐구의 질문을 남깁니다.'],
      '[프로젝트 이름]': ['마을 하천 지도', '학교 텃밭 장터', '모두를 위한 나무 의자'],
      '[프로젝트 확장 설명]': '누구나 편하게 앉으려면 어떤 모양이어야 할까? · 치수 조사와 의자 시제품 · 5~6학년',
      '[질문 · 결과물 · 참여 학년]': '우리 동네 하천은 왜 냄새가 날까? · 수질 지도와 구청 제안서 · 5~6학년',
      '[설명]': '텃밭 작물로 장터를 열고 수익과 비용을 직접 계산합니다 · 3~4학년',
      '[학생·보호자 공개 허가를 받은 작품만 올립니다]': '지어낸 작품과 AI 예시 사진입니다. 실제 학생 작품은 학생·보호자의 공개 허가를 받은 뒤 올립니다.',
      '[작품 설명 1]': '세 지점의 물을 관찰하고 색으로 정리한 하천 지도. 같은 장소를 다시 찾아 계절에 따른 차이를 기록했습니다.',
      '[작품 설명 2]': '씨앗값부터 판매 금액까지, 텃밭 장터의 수입과 지출을 함께 정리했습니다.',
      '[작품 설명 3]': '이웃의 이야기를 듣고 골목에 어울리는 색과 형태를 그려 본 벽화 시안입니다.',
      '[작품 설명 4]': '버려진 통으로 만든 빗물 모으기 장치. 모은 물은 텃밭을 돌보는 데 씁니다.',
      '[작품 설명 5]': '마을의 오랜 기억을 묻는 인터뷰 프로젝트. 촬영 전에 질문과 공개 범위를 함께 정했습니다.',
      '[작품 설명 6]': '앉는 사람의 키와 자세를 살피고, 직접 치수를 재어 만든 첫 번째 나무 의자입니다.',
    },
  },
  mission: {
    school: '등불학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'mission-hero' }, { at: ['home', 'blocks', 2, 'asset'], name: 'mission-village' }],
    text: {
      ...contact('등불학교', '000-000-0000', 'partner@example.org', '가상시 등불마을 언덕길 5', '배움으로 마을을 밝히는 학교'),
      // 107차(가상 예시)
      '[사명 바로가기 설명 1]': '우리가 믿고 고백하는 것', '[사명 바로가기 설명 2]': '후원·봉사·기도', '[사명 바로가기 설명 3]': '후원금이 쓰이는 곳', '[사명 바로가기 설명 4]': '마을 소식과 기도 편지',
      '[사명 숫자 띠 제목]': '함께 켜 온 등불',
      '[사명 숫자 1]': '60명', '[사명 숫자 1 설명]': '함께 배우는 마을 아이들', '[사명 숫자 2]': '8명', '[사명 숫자 2 설명]': '마을에 사는 교사',
      '[사명 숫자 3]': '2시간 → 10분', '[사명 숫자 3 설명]': '학교까지 걷는 시간', '[사명 숫자 4]': '120가정', '[사명 숫자 4 설명]': '정기 후원으로 함께하는 가정',
      '[사명 행사 1 날짜]': '3.02', '[사명 행사 1]': '새 학년 개학 예배', '[사명 행사 1 안내]': '함께 기도해 주세요',
      '[사명 행사 2 날짜]': '7.20', '[사명 행사 2]': '여름 봉사 주간', '[사명 행사 2 안내]': '영어 캠프·시설 보수 봉사자 모집',
      '[사명 행사 3 날짜]': '12.15', '[사명 행사 3]': '후원자 초청의 날', '[사명 행사 3 안내]': '한 해 재정 보고와 감사 모임',
      '[공개에 동의한 분의 말만 싣습니다]': '예시 글입니다. 실제로는 공개에 동의한 분의 말만 싣습니다.',
      '[사명 말한 사람 1]': '후원자 · 5년째', '[사명 목소리 1]': '기도 편지에 아이들 이름이 하나씩 늘어 가는 게 기쁨입니다.',
      '[사명 말한 사람 2]': '봉사자 · 여름 캠프', '[사명 목소리 2]': '가르치러 갔는데 오히려 배우고 돌아왔어요.',
      '[사명 말한 사람 3]': '교사', '[사명 목소리 3]': '아이들이 마을에서 처음으로 책을 끝까지 읽은 날을 잊지 못합니다.',
      '[Mission quick link 1]': 'What we believe', '[Mission quick link 2]': 'Give, serve, pray', '[Mission quick link 3]': 'Where gifts go', '[Mission quick link 4]': 'Village news and prayer letters',
      '[Mission stats title]': 'Lamps lit together',
      '[Mission number 1]': '60', '[Mission number 1 label]': 'village children learning with us', '[Mission number 2]': '8', '[Mission number 2 label]': 'teachers living in the village',
      '[Mission number 3]': '2 h → 10 min', '[Mission number 3 label]': 'walk to school', '[Mission number 4]': '120', '[Mission number 4 label]': 'families giving monthly',
      '[Mission event 1 date]': '3.02', '[Mission event 1]': 'New year service', '[Mission event 1 note]': 'Please pray with us',
      '[Mission event 2 date]': '7.20', '[Mission event 2]': 'Summer service week', '[Mission event 2 note]': 'Volunteers for English camp and repairs',
      '[Mission event 3 date]': '12.15', '[Mission event 3]': 'Partners\' day', '[Mission event 3 note]': 'Annual report and thanksgiving',
      '[Only words shared with consent]': 'Sample text. In practice we only share words with the speaker\'s consent.',
      '[Mission speaker 1]': 'Partner · five years', '[Mission voice 1]': 'Each prayer letter brings a few more names. That is my joy.',
      '[Mission speaker 2]': 'Volunteer · summer camp', '[Mission voice 2]': 'I went to teach and came back having learned more.',
      '[Mission speaker 3]': 'Teacher', '[Mission voice 3]': 'I will never forget the day the children first finished a whole book.',
      '[School name]': 'Lamplight School',
      // 115차: 영어 화면용 예시(가상)
      '[One line about the school]': 'A school that lights the village through learning', '[Address]': '5 Hill Road, Lamplight Village, Example City', '[Phone]': '000-000-0000', '[Email]': 'partner@example.org',
      '[The children and village we serve]': 'Learning alongside 60 children in a mountain village',
      '[Who, where and why]': 'In a village two hours\' walk from the nearest school, we teach reading, maths and life skills, so children can stand on their own whether they stay or leave.',
      '[Mission statement]': 'Because we believe every child is made in the image of God, we bring learning close to the village.',
      '[Belief 1]': 'Every child is precious', '[Description]': 'We value each child, whatever their background or circumstances.',
      '[Account · how]': 'A fixed monthly amount by standing order (account details from school documents).',
      '[Volunteering needed]': 'Holiday English camp, making materials, repairs',
      '[How to receive prayer letters]': 'Ask by email and we will send a prayer letter each month.',
      '[Use 1]': 'Teacher living costs', '[Share · note]': 'Sample share · the actual financial report comes from school documents.',
      '[Contact person]': 'Partnerships 000-000-0000 · partner@example.org',
      '[학교의 사명 한 문장]': '배움이 닿지 않는 마을에 배움의 등불을 켭니다',
      '[Our mission]': 'Lighting a lamp of learning where schooling is out of reach',
      '[이 학교가 섬기는 아이들과 마을]': '산골 마을 아이들 60명과 함께합니다',
      '[누구를, 어디에서, 왜]': '가까운 학교까지 두 시간을 걸어야 하는 마을의 아이들에게 읽기·셈하기와 생활 기술을 가르칩니다. 아이들이 마을에 남아도, 떠나도 스스로 설 수 있도록 돕습니다.',
      '[사명 선언문]': '우리는 모든 아이가 하나님의 형상으로 지음받았다고 믿기에, 배움의 기회를 마을 가까이 가져갑니다.',
      '[고백 1]': '모든 아이는 존귀합니다',
      '[설명]': '배경과 형편에 관계없이 아이 한 명 한 명을 귀하게 여깁니다.',
      '[계좌·방법]': '매달 정해진 금액을 자동 이체로 후원합니다(계좌는 학교 자료대로).',
      '[필요한 봉사]': '방학 영어 캠프, 교재 만들기, 시설 보수',
      '[기도 제목 받는 방법]': '메일로 신청하시면 달마다 기도 편지를 보내 드립니다.',
      '[쓰임 1]': '교사 생활비',
      '[비율·설명]': '예시 비율 · 실제 재정 보고는 학교 자료대로 싣습니다.',
      '[담당자 연락처]': '후원 담당 000-000-0000 · partner@example.org',
    },
  },
  international: {
    school: 'Mapleglen International School',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'international-hero' }, { at: ['home', 'blocks', 2, 'items', 0, 'asset'], name: 'international-early' }, { at: ['home', 'blocks', 2, 'items', 1, 'asset'], name: 'international-primary' }, { at: ['home', 'blocks', 2, 'items', 2, 'asset'], name: 'international-secondary' }],
    text: {
      '[School name]': 'Mapleglen International School', '[학교 이름]': '메이플글렌 국제학교', '[ชื่อโรงเรียน]': 'โรงเรียนนานาชาติเมเปิลเกลน',
      '[One sentence about the school]': 'A small international school where every child is known by name',
      '[학교 소개 한 문장]': '모든 아이의 이름을 아는 작은 국제학교',
      '[แนะนำโรงเรียนหนึ่งประโยค]': 'โรงเรียนนานาชาติขนาดเล็กที่รู้จักเด็กทุกคน',
      '[Early years]': 'Early years', '[유아]': '유아', '[Primary]': 'Primary', '[초등]': '초등', '[Secondary]': 'Secondary', '[중등]': '중등',
      '[Ages · programme]': ['Ages 3–5 · play-based learning', 'Ages 6–11 · inquiry units in English', 'Ages 12–18 · subject courses and capstone project'],
      '[One line about the school]': 'Known by name, ready for the world',
      '[Address]': '12 Example Road, Example City', '[Phone]': '000-000-0000', '[Email]': 'admissions@example.org',
      '[Stage]': 'Early years → Primary → Secondary',
      '[Programme · accreditation]': 'Sample programme names · accreditation details go here from school documents',
      '[How]': 'Email or the enquiry form', '[Tour days]': 'Tuesdays and Thursdays, 9–11 am',
      '[Documents · assessment]': 'Application form, previous reports, a short English conversation',
      '[Enrolment]': 'Offer letter and enrolment within two weeks',
      '[Fee]': 'Annual tuition', '[Amount · terms]': 'Sample figure · paid per term (actual fees from school documents)',
      '[Boarding / day students]': 'Day students',
      '[Daily life, activities, care]': 'School runs 8:00–15:30. Clubs include football, music and coding. A pastoral tutor meets each student weekly.',
      // 107차(sample)
      '[Quick link 1]': 'Early years to secondary', '[Quick link 2]': 'Enquire, visit, apply, join', '[Quick link 3]': 'Clubs, care and daily life', '[Quick link 4]': 'Stories from our community',
      '[At a glance title]': 'A small school with a wide world',
      '[Number 1]': '320', '[Number 1 label]': 'students aged 3–18', '[Number 2]': '28', '[Number 2 label]': 'nationalities', '[Number 3]': '1:9', '[Number 3 label]': 'teacher to student', '[Number 4]': '3', '[Number 4 label]': 'school languages',
      '[Event 1 date]': '10.04', '[Event 1]': 'Open morning', '[Event 1 note]': 'Campus tour and classroom visits',
      '[Event 2 date]': '11.08', '[Event 2]': 'Admissions webinar', '[Event 2 note]': 'Ask our admissions team online',
      '[Event 3 date]': '12.12', '[Event 3]': 'Winter concert', '[Event 3 note]': 'Families welcome',
    },
  },
  kinder: {
    school: '햇살숲 유치원',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'kinder-hero' },
      ...[1, 2, 3].map((n) => ({ at: ['home', 'blocks', 2, 'items', n - 1, 'asset'], name: `kinder-class-${n}` })),
      ...[1, 2, 3].map((n) => ({ at: ['classes', 'blocks', 0, 'items', n - 1, 'asset'], name: `kinder-class-${n}` })),
      { at: ['classes', 'blocks', 1, 'asset'], name: 'kinder-play' },
      { at: ['daily', 'blocks', 1, 'asset'], name: 'story-season-5' }, { at: ['admission', 'blocks', 4, 'asset'], name: 'kinder-class-1' }],
    text: {
      ...contact('햇살숲 유치원', '000-000-0000', 'hello-kids@example.org', '가상시 햇살동 놀이터길 8', '놀이로 배우고 햇살 속에 자라요'),
      // 107차(가상 예시)
      '[유치원 바로가기 설명 1]': '만 3·4·5세 반 소개', '[유치원 바로가기 설명 2]': '하루 일과와 급식', '[유치원 바로가기 설명 3]': '상담부터 적응까지', '[유치원 바로가기 설명 4]': '가정통신문과 소식',
      '[유치원 행사 1 날짜]': '5.05', '[유치원 행사 1]': '어린이날 놀이 잔치', '[유치원 행사 1 안내]': '마당에서 온 가족 놀이',
      '[유치원 행사 2 날짜]': '5.20', '[유치원 행사 2]': '텃밭 모종 심기', '[유치원 행사 2 안내]': '반별로 작은 화분을 가져가요',
      '[유치원 행사 3 날짜]': '5.28', '[유치원 행사 3]': '학부모 상담 주간', '[유치원 행사 3 안내]': '담임 선생님과 15분 상담',
      '[공개에 동의한 분의 말만 싣습니다]': '예시 글입니다. 실제로는 공개에 동의한 분의 말만 싣습니다.',
      '[유치원 말한 사람 1]': '꽃잎반 학부모', '[유치원 목소리 1]': '아이가 아침마다 먼저 신발을 신고 기다려요.',
      '[유치원 말한 사람 2]': '새싹반 학부모', '[유치원 목소리 2]': '첫 주에 함께 머물 수 있어서 마음이 놓였어요.',
      '[유치원 말한 사람 3]': '열매반 학부모', '[유치원 목소리 3]': '놀이 이야기를 사진과 함께 들려주셔서 하루가 보여요.',
      '[유치원 이름]': '햇살숲 유치원',
      '[신청 안내 한 줄]': '방문 상담 신청 양식의 예시입니다. 미리보기에서는 실제로 보내지지 않습니다.',
      '[아이들이 웃으며 자라는 곳]': '오늘도 마음껏 놀고, 쑥쑥 자라요',
      '[처음 오신 가정께 드리는 두 문장]': '햇살숲 유치원은 놀이가 곧 배움인 곳입니다. 아이 한 명 한 명의 속도에 맞춰 함께 자랍니다.',
      '[반 이름 · 나이 1]': '새싹반 · 만 3세', '[반 이름 · 나이 2]': '꽃잎반 · 만 4세', '[반 이름 · 나이 3]': '열매반 · 만 5세',
      '[반 한 줄 소개]': ['처음 만나는 단체 생활을 천천히', '친구와 함께 놀이를 만들어요', '초등학교 갈 준비를 즐겁게'],
      '[하루 모습·담임·정원]': ['오전 바깥 놀이와 낮잠 · 담임 2명 · 정원 12명', '역할 놀이와 동화 · 담임 2명 · 정원 15명', '프로젝트 놀이와 글자 놀이 · 담임 2명 · 정원 18명'],
      '[아이들의 하루]': '햇살 가득한 하루',
      '[시간 1]': '9:00', '[활동 1]': '등원하고 인사 나누기', '[시간 2]': '10:00', '[활동 2]': '바깥 놀이와 텃밭',
      '[시간 3]': '12:00', '[활동 3]': '점심과 양치', '[시간 4]': '13:30', '[활동 4]': '쉼과 동화 시간', '[시간 5]': '15:30', '[활동 5]': '간식 먹고 하원',
      '[질문 1]': '처음 몇 주는 어떻게 적응하나요?', '[답 1]': '첫 주는 보호자와 함께 짧게 머물고, 아이 속도에 맞춰 시간을 늘립니다.',
      '[질문 2]': '알레르기가 있어도 괜찮나요?', '[답 2]': '입학 상담 때 알려 주시면 식단과 간식을 따로 준비합니다.',
      '[방문 상담 요일·연락처]': '화·목 오후 2시에 방문 상담을 엽니다. 000-000-0000',
      '[놀이로 배워요]': '놀이가 곧 배움이에요', '[놀이 중심 배움의 방식]': '아이들이 고른 놀이에서 셈·말·관계를 함께 배웁니다. 교사는 놀이를 넓혀 주는 사람입니다.',
      '[급식·간식·알레르기·투약 안내]': '오늘의 점심 · 잡곡밥, 채소 된장국, 두부구이, 제철 과일\n오후 간식 · 찐 고구마와 우유\n\n식단은 가상 예시입니다. 점심과 간식은 원 안에서 조리합니다. 알레르기는 상담 때 미리 확인하고 대체식을 안내합니다. 투약은 보호자의 요청서에 따라 확인합니다.',
      '[상담 방법]': '전화·메일로 상담 날짜를 정해요', '[둘러보기 일정]': '화·목 오후 2시 교실 둘러보기', '[서류]': '입학 신청서와 건강 기록', '[첫 주 적응 안내]': '보호자와 함께 짧게 시작해요',
      '[교육비]': '월 교육비', '[금액·지원]': '월 280,000원 · 지원 자격과 지원액은 상담 때 안내합니다(가상 예시)' , '[기타 비용]': '급식·차량·특별활동', '[급식·차량·특별활동]': '항목별로 따로 안내합니다.',
      '[연락처·상담 가능 시간]': '000-000-0000 · hello-kids@example.org · 평일 오전 9시~오후 5시',
      '[입학 적응 이야기]': '첫날부터 모든 것을 잘할 필요는 없어요. 좋아하는 놀이를 함께 찾고, 보호자와 머무는 시간을 조금씩 줄여 갑니다. 아이의 작은 신호를 가정과 나누며 시작합니다.',
    },
  },
  single: {
    school: '작은씨앗 배움모임',
    images: [{ at: ['home', 'blocks', 1, 'items', 0, 'asset'], name: 'single-study' }, { at: ['home', 'blocks', 1, 'items', 1, 'asset'], name: 'single-outing' }],
    text: {
      ...contact('작은씨앗 배움모임', '000-000-0000', 'seed@example.org', '가상시 씨앗동 공부방길 2', '여섯 가정이 함께 꾸리는 배움 모임'),
      // 107차(가상 예시)
      '[모임 행사 1 날짜]': '매주 화·목', '[모임 행사 1]': '함께 배우는 날', '[모임 행사 1 안내]': '오전 10시, 공부방',
      '[모임 행사 2 날짜]': '5.17', '[모임 행사 2]': '농장 나들이', '[모임 행사 2 안내]': '도시락을 챙겨 오세요',
      '[모임 행사 3 날짜]': '5.31', '[모임 행사 3]': '처음 오는 가정 모임', '[모임 행사 3 안내]': '둘러보고 이야기 나누는 시간',
      '[학교·모임 이름]': '작은씨앗 배움모임',
      '[우리는 누구인가요]': '함께 배우는 여섯 가정',
      '[두세 문장 소개]': '집에서 배우는 아이들이 일주일에 두 번 모여 함께 공부하고 놉니다. 부모가 돌아가며 수업을 맡고, 필요한 분야는 마을 선생님을 모십니다.',
      '[활동 1]': '함께 배우는 날', '[활동 2]': '바깥 배움',
      '[설명]': ['화·목 오전, 글쓰기·수학·과학 모둠 수업', '한 달에 한 번 박물관·농장·도서관 나들이'],
      '[연락 방법]': 'seed@example.org로 메일을 보내 주시면 모임 날 함께 둘러보실 수 있게 안내합니다.',
    },
  },
};

const TOKEN = /\[[^\]]+\]/g;

/**
 * 예시 그림 파일. 선생님 쪽 AI로 만든 사진풍 그림(.jpg)이 오기 전에는 같은 이름의 자리 그림(.svg)을 쓴다.
 * 사진풍 그림을 넣으면 그 이름을 이 목록에 더한다(docs/design/template-image-prompts.md).
 */
export const SAMPLE_PHOTOS = new Set<string>(["story-hero", "story-day", "story-learning", "story-season-1", "story-season-2", "story-season-3", "story-season-4", "story-season-5", "project-hero", "project-river", "project-market", "project-work-1", "project-work-2", "project-work-3", "project-work-4", "project-work-5", "project-work-6", "kinder-hero", "kinder-class-1", "kinder-class-2", "kinder-class-3", "kinder-play"]);
const SAMPLE_PHOTO_ALT: Record<string, string> = {
  "story-hero": "아침 햇살이 비치는 숲길과 작은 학교 건물",
  "story-day": "숲길을 함께 걷는 아이들의 뒷모습",
  "story-learning": "나뭇잎과 돋보기, 관찰 도구가 놓인 배움의 책상",
  "story-season-1": "벚꽃이 핀 봄날의 숲길",
  "story-season-2": "여름 텃밭의 채소와 물뿌리개",
  "story-season-3": "가을빛이 드는 목공 작업실",
  "story-season-4": "눈 내린 풍경이 보이는 겨울 도서실",
  "story-season-5": "나누어 먹을 음식이 차려진 공동체 식탁",
  "project-hero": "공작실에서 모형을 만드는 학생들의 손",
  "project-river": "하천과 마을 모형 옆에 놓인 물 관찰 도구",
  "project-market": "텃밭에서 기른 채소를 진열한 작은 장터",
  "project-work-1": "색으로 표시한 하천 수질 지도와 실험 도구",
  "project-work-2": "장터 수입과 지출을 기록할 공책과 계산기",
  "project-work-3": "자연을 그린 학생 벽화 시안과 물감",
  "project-work-4": "텃밭 옆에 설치한 빗물 모으기 시제품",
  "project-work-5": "마을 인터뷰를 준비한 카메라와 빈 의자",
  "project-work-6": "작업실에서 완성한 나무 의자",
  "kinder-hero": "따뜻한 햇살 아래 놀이터에서 노는 아이들의 뒷모습",
  "kinder-class-1": "쿠션과 그림책, 나무 블록이 놓인 새싹반 교실",
  "kinder-class-2": "작은 나무 부엌과 장난감이 놓인 역할 놀이 공간",
  "kinder-class-3": "크레용으로 그림을 그리는 아이들의 손",
  "kinder-play": "텃밭에 작은 모종을 심는 아이들의 손"
};
/** 그림 이름 → 블록 검사를 통과하는 고정 UUID(예시 전용, 학교 그림과 겹치지 않는 대역) */
const sampleId = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `5a3e0000-0000-4000-8000-${h.toString(16).padStart(12, '0').slice(-12)}`;
};
const SAMPLE_FILES = new Map<string, string>();
/** 미리보기가 쓰는 그림 주소: 예시 그림이면 정적 파일, 아니면 빈 값 */
export function sampleAssetUrl(id: string) {
  return SAMPLE_FILES.get(id) ?? '';
}
function sampleFile(name: string) {
  const id = sampleId(name);
  SAMPLE_FILES.set(id, `/site-templates/img/${name}.${SAMPLE_PHOTOS.has(name) ? 'jpg' : 'svg'}`);
  return id;
}

/** 템플릿 쪽 전체를 쪽 순서대로 훑어 안내 자리를 예시 값으로 바꾼 사본을 돌려준다(원본 템플릿은 그대로) */
export function samplePages(t: SiteTemplate): Record<string, Content> {
  const sample = TEMPLATE_SAMPLES[t.key];
  const used = new Map<string, number>();
  const pick = (token: string): string => {
    const v = sample?.text[token];
    if (v === undefined) return token;
    if (typeof v === 'string') return v;
    const i = used.get(token) ?? 0;
    used.set(token, i + 1);
    return v[Math.min(i, v.length - 1)];
  };
  const fill = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key === 'href' ? v : v.replace(TOKEN, pick);
    if (Array.isArray(v)) return v.map((x) => fill(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)]));
    return v;
  };
  const out: Record<string, Content> = {};
  for (const p of t.pages) out[p.key] = fill(p.content) as Content;
  for (const img of sample?.images ?? []) {
    const [pageKey, ...path] = img.at;
    let node: unknown = out[String(pageKey)];
    for (const k of path.slice(0, -1)) node = (node as Record<string | number, unknown> | undefined)?.[k];
    if (node && typeof node === 'object') {
      const target = node as Record<string | number, unknown>;
      target[path[path.length - 1]] = sampleFile(img.name);
      if (path[path.length - 1] === 'asset' && SAMPLE_PHOTO_ALT[img.name]) target.alt = { ko: `${SAMPLE_PHOTO_ALT[img.name]} (AI 예시 사진)` };
    }
  }
  return out;
}

/** 안내 자리 `[ … ]` 목록(시험·진행표용) */
export function placeholders(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') { for (const m of v.matchAll(TOKEN)) out.push(m[0]); }
  else if (Array.isArray(v)) v.forEach((x) => placeholders(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => placeholders(x, out));
  return out;
}

/** 89차: 미리보기용 소식 3개(가상). 미리보기는 DB를 읽지 않으므로 소식 구역이 비지 않게 채운다 */
export function sampleNews(): { key: string; title: Record<string, string>; summary: Record<string, string>; published_at: string }[] {
  return [
    { key: 'open-day', title: { ko: '새 학기 학부모 설명회 안내', en: 'Parent information evening', th: 'ประชุมผู้ปกครองภาคเรียนใหม่' },
      summary: { ko: '학교 한 해 계획을 함께 나눕니다.', en: 'An overview of the year ahead.', th: 'แนะนำแผนการเรียนตลอดปี' }, published_at: '2026-03-04T09:00:00Z' },
    { key: 'showcase', title: { ko: '학생 발표회가 열립니다', en: 'Student showcase this Friday', th: 'นิทรรศการผลงานนักเรียน' },
      summary: { ko: '한 학기 동안 배운 것을 보여 드립니다.', en: 'Come and see what students made this term.', th: 'ชมผลงานของนักเรียนตลอดภาคเรียน' }, published_at: '2026-06-20T09:00:00Z' },
    { key: 'library', title: { ko: '새 도서관 문을 열었습니다', en: 'Our new library is open', th: 'ห้องสมุดใหม่เปิดแล้ว' },
      summary: { ko: '방과 후에도 책을 빌릴 수 있습니다.', en: 'Open after school every weekday.', th: 'เปิดให้ยืมหนังสือหลังเลิกเรียน' }, published_at: '2026-09-01T09:00:00Z' },
  ];
}

/** 미리보기의 소식 링크도 읽을 수 있는 예시 상세로 연결한다. 운영 소식·DB와 무관하다. */
export function sampleNewsPage(key?: string): Content | null {
  const article = sampleNews().find((n) => n.key === key);
  if (article) return { title: article.title, summary: article.summary, blocks: [{ type: 'text', text: {
    ko: '가상 학교의 예시 소식입니다. 학생과 가정이 함께 배움의 과정을 나누는 날을 준비하고 있습니다. 자세한 일정과 참여 방법은 학교의 실제 소식으로 바꾸어 안내해 주세요.',
    en: 'This is a fictional school announcement. Students and families are preparing to share their learning. Replace this sample with the school’s actual dates and participation details.',
    th: 'นี่คือข่าวตัวอย่างของโรงเรียนสมมติ นักเรียนและครอบครัวกำลังเตรียมแบ่งปันการเรียนรู้ โปรดแทนที่ด้วยกำหนดการและรายละเอียดจริงของโรงเรียน',
  } }], head: { link: { label: { ko: '소식 목록', en: 'All news', th: 'ข่าวทั้งหมด' }, href: '/news' } } };
  return key === 'all' ? { title: { ko: '학교 소식', en: 'School news', th: 'ข่าวโรงเรียน' }, blocks: [{ type: 'news_list', count: 3, style: 'list' }] } : null;
}
