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
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'notice-hero' }, { at: ['home', 'blocks', 3, 'items', 0, 'asset'], name: 'notice-calendar' }, { at: ['home', 'blocks', 3, 'items', 1, 'asset'], name: 'notice-lunch' }, { at: ['home', 'blocks', 3, 'items', 2, 'asset'], name: 'notice-way' }],
    text: {
      ...contact('물빛초등학교', '000-000-0000', 'office@example.org', '가상시 물빛구 배움로 12', '서로 배우고 함께 자라는 마을 학교'),
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
    },
  },
  story: {
    school: '숲속이야기학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'story-hero' }, { at: ['home', 'blocks', 1, 'asset'], name: 'story-day' }, { at: ['learning', 'blocks', 0, 'asset'], name: 'story-learning' },
      ...[1, 2, 3, 4, 5].map((n) => ({ at: ['home', 'blocks', 2, 'items', n - 1, 'asset'], name: `story-season-${n}` }))],
    text: {
      ...contact('숲속이야기학교', '000-000-0000', 'hello@example.org', '가상시 숲길면 오솔길 7', '숲에서 묻고, 함께 답을 찾는 학교'),
      '[학교가 믿는 것을 한 문장으로]': '아이는 이미 배우는 사람입니다',
      '[다가오는 행사 — 예: 5월 12일 학교 여는 날]': '5월 12일 · 학교 여는 날',
      '[행사 한 줄 안내]': '오전 10시, 숲길 산책과 수업 둘러보기. 가족 누구나 오세요.',
      '[사진으로 보는 우리 학교]': '사진으로 보는 숲속의 한 해',
      '[사진 이름 1]': '봄 숲길', '[사진 이름 2]': '여름 텃밭', '[사진 이름 3]': '가을 공방', '[사진 이름 4]': '겨울 도서실', '[사진 이름 5]': '함께 짓는 밥',
      '[학교를 처음 만나는 분께 드리는 두 문장]': '우리는 아이의 질문에서 수업을 시작합니다. 숲과 마을이 교실이고, 어른은 함께 걷는 안내자입니다.',
      '[아침부터 저녁까지, 우리 학교의 하루]': '아침 숲길에서 저녁 나눔까지',
      '[하루 흐름을 이야기처럼]': '아침에는 숲길을 걸으며 하루를 엽니다. 오전에는 학년이 섞인 모둠으로 프로젝트를 하고, 점심은 함께 지은 밥을 나눕니다. 오후에는 악기·목공·텃밭 가운데 하나를 고르고, 하루 끝에는 둥글게 앉아 배운 것을 이야기합니다.',
      '[학교를 세운 마음을 담은 한마디]': '빨리 가르치기보다, 깊이 배우게 하고 싶었습니다.',
      '[가치 1]': '질문', '[가치 2]': '관계', '[가치 3]': '돌봄',
      '[설명]': ['정답보다 좋은 질문을 귀하게 여깁니다.', '학생·교사·가정이 서로 이름을 부르는 공동체를 만듭니다.', '자연과 이웃을 돌보는 일을 배움으로 삼습니다.'],
      '[배움의 방식]': '주제로 엮는 배움',
      '[수업이 어떻게 이루어지는지]': '한 학기에 하나의 큰 주제(예: 물, 씨앗, 마을)를 정하고, 읽기·셈하기·관찰·만들기를 그 주제 안에서 함께 배웁니다.',
      '[학년·과정]': '1~3학년 · 4~6학년',
      '[주요 배움]': '이야기와 놀이로 읽기·셈하기의 기초를 다집니다 · 탐구 보고서와 발표로 배운 것을 정리합니다',
      '[학부모·교사·학생이 함께하는 방식]': '한 달에 한 번 가정과 교사가 함께 학교 살림을 의논하고, 학기 끝에는 학생이 배운 것을 가족 앞에서 발표합니다.',
      '[견학·상담 안내]': '매달 둘째 토요일 오전에 학교 둘러보기를 엽니다. 전화나 메일로 신청해 주세요.',
    },
  },
  admissions: {
    school: '새솔아카데미',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'admissions-hero' }, { at: ['home', 'blocks', 1, 'items', 0, 'asset'], name: 'admissions-class' }, { at: ['home', 'blocks', 1, 'items', 1, 'asset'], name: 'admissions-books' }, { at: ['home', 'blocks', 1, 'items', 2, 'asset'], name: 'admissions-mentor' }],
    text: {
      ...contact('새솔아카데미', '000-000-0000', 'admissions@example.org', '가상시 새솔구 미래로 30', '작은 학급, 깊은 배움'),
      '[School name]': 'Saesol Academy',
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
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'project-hero' }, { at: ['projects', 'blocks', 0, 'items', 0, 'asset'], name: 'project-river' }, { at: ['projects', 'blocks', 0, 'items', 1, 'asset'], name: 'project-market' },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ at: ['home', 'blocks', 1, 'items', n - 1, 'asset'], name: `project-work-${n}` }))],
    text: {
      ...contact('두레프로젝트학교', '000-000-0000', 'project@example.org', '가상시 두레읍 마당길 3', '질문에서 시작해 세상에 내놓는 배움'),
      '[이번 학기 결과물]': '이번 학기, 학생들이 만든 것',
      '[학생·보호자 공개 허가를 받은 작품만 싣습니다]': '학생·보호자 공개 허가를 받은 작품만 싣습니다. 분야를 눌러 골라 보세요.',
      '[작품 이름 1]': '하천 수질 지도', '[작품 이름 2]': '마을 장터 가계부', '[작품 이름 3]': '골목 벽화 시안', '[작품 이름 4]': '빗물 저금통 시제품', '[작품 이름 5]': '어르신 인터뷰 영상', '[작품 이름 6]': '나무 의자 만들기',
      '[분야 1]': '과학', '[분야 2]': '사회', '[분야 3]': '예술',
      '[이름 · 맡은 분야]': ['김가상 · 환경 과학', '이예시 · 지역 경제', '박샘플 · 목공과 디자인'],
      '[한 줄 소개]': ['하천 조사를 20년 해 온 마을 연구자', '협동조합에서 장터를 꾸리는 멘토', '마을 공방을 운영하는 목수'],
      '[학년 1]': '5~6학년', '[학년 2]': '3~4학년',
      '[문제를 찾고, 탐구하고, 만들어 나눕니다]': '우리 마을의 문제를 찾고, 탐구하고, 만들어 나눕니다',
      '[학생이 질문을 찾는 방법]': '마을 걷기와 인터뷰로 풀고 싶은 질문을 고릅니다.',
      '[자료·현장·전문가]': '자료 조사, 현장 방문, 전문가 만남으로 답을 찾습니다.',
      '[만드는 것]': '지도·영상·제품·제안서처럼 쓸모 있는 결과물을 만듭니다.',
      '[발표·전시]': '학기 끝 발표회에서 마을 분들께 보여 드리고 의견을 듣습니다.',
      '[학교의 설명]': '배운 것을 실제 문제에 써 볼 때 지식은 오래 남습니다. 학생은 프로젝트를 고르고 계획하며, 스스로 정한 일에 책임지는 법을 배웁니다.',
      '[주차]': '1~3주 · 4~10주 · 11~14주 · 15주',
      '[활동]': '질문 찾기 → 탐구와 시제품 → 고쳐 만들기 → 발표회',
      '[프로젝트 이름]': ['마을 하천 지도', '학교 텃밭 장터'],
      '[질문 · 결과물 · 참여 학년]': '우리 동네 하천은 왜 냄새가 날까? · 수질 지도와 구청 제안서 · 5~6학년',
      '[설명]': '텃밭 작물로 장터를 열고 수익과 비용을 직접 계산합니다 · 3~4학년',
      '[학생·보호자 공개 허가를 받은 작품만 올립니다]': '학생·보호자 공개 허가를 받은 작품만 올립니다.',
    },
  },
  mission: {
    school: '등불학교',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'mission-hero' }, { at: ['home', 'blocks', 1, 'asset'], name: 'mission-village' }],
    text: {
      ...contact('등불학교', '000-000-0000', 'partner@example.org', '가상시 등불마을 언덕길 5', '배움으로 마을을 밝히는 학교'),
      '[School name]': 'Lamplight School',
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
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'international-hero' }, { at: ['home', 'blocks', 1, 'items', 0, 'asset'], name: 'international-early' }, { at: ['home', 'blocks', 1, 'items', 1, 'asset'], name: 'international-primary' }, { at: ['home', 'blocks', 1, 'items', 2, 'asset'], name: 'international-secondary' }],
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
    },
  },
  kinder: {
    school: '햇살숲 유치원',
    images: [{ at: ['home', 'blocks', 0, 'asset'], name: 'kinder-hero' },
      ...[1, 2, 3].map((n) => ({ at: ['home', 'blocks', 1, 'items', n - 1, 'asset'], name: `kinder-class-${n}` })),
      ...[1, 2, 3].map((n) => ({ at: ['classes', 'blocks', 0, 'items', n - 1, 'asset'], name: `kinder-class-${n}` })),
      { at: ['classes', 'blocks', 1, 'asset'], name: 'kinder-play' }],
    text: {
      ...contact('햇살숲 유치원', '000-000-0000', 'hello-kids@example.org', '가상시 햇살동 놀이터길 8', '놀이로 배우고 햇살 속에 자라요'),
      '[유치원 이름]': '햇살숲 유치원',
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
      '[급식·간식·알레르기·투약 안내]': '점심과 간식은 원 안에서 조리합니다. 알레르기·투약은 상담 때 알려 주세요.',
      '[상담 방법]': '전화·메일로 상담 날짜를 정해요', '[둘러보기 일정]': '화·목 오후 2시 교실 둘러보기', '[서류]': '입학 신청서와 건강 기록', '[첫 주 적응 안내]': '보호자와 함께 짧게 시작해요',
      '[교육비]': '월 교육비', '[금액·지원]': '예시 금액 · 정부 지원 안내(실제 금액은 자료대로)', '[기타 비용]': '급식·차량·특별활동', '[급식·차량·특별활동]': '항목별로 따로 안내합니다.',
      '[연락처·상담 가능 시간]': '000-000-0000 · 평일 오전 9시~오후 5시',
    },
  },
  single: {
    school: '작은씨앗 배움모임',
    images: [{ at: ['home', 'blocks', 1, 'items', 0, 'asset'], name: 'single-study' }, { at: ['home', 'blocks', 1, 'items', 1, 'asset'], name: 'single-outing' }],
    text: {
      ...contact('작은씨앗 배움모임', '000-000-0000', 'seed@example.org', '가상시 씨앗동 공부방길 2', '여섯 가정이 함께 꾸리는 배움 모임'),
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
export const SAMPLE_PHOTOS = new Set<string>([]);
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
    if (node && typeof node === 'object') (node as Record<string | number, unknown>)[path[path.length - 1]] = sampleFile(img.name);
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
