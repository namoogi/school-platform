/**
 * 46차 'AI 연결' (ADR 0022): 학교 관리자가 자기 AI(Codex·Claude Code·기타) 대화창에 그대로 붙여 넣을 글.
 * 지시문 + 토큰을 한 덩어리로 만든다. 토큰이 있으면 정확히 한 번(환경 변수로 넣는 줄) 들어가고,
 * 없으면(이미 발급한 토큰은 원문이 없다) 환경 변수 SCHOOL_AGENT_TOKEN 에 있다고 안내한다.
 * 순수 함수: 화면(AgentTokenClient)과 단위 시험(tests/agent-connect.test.ts)이 같이 쓴다.
 */
export type AiKind = 'codex' | 'claude-code' | 'other';
export const AI_LABEL: Record<AiKind, string> = { codex: 'Codex', 'claude-code': 'Claude Code', other: '기타 AI' };
export const GUIDE_URL = 'https://github.com/namoogi/school-platform/blob/main/docs/agents/README.md';

const KIND_KO: Record<string, string> = { story: '성품 동화', page: '쪽', news: '소식', package: '학사 꾸러미' };
/** 공개 주소에서 종류별 경로 (SiteRenderer 경로와 같은 모양) */
const pathOf = (kind: string, key: string) =>
  kind === 'page' ? (key === 'home' ? '' : `/p/${key}`) : kind === 'news' ? `/news/${key}` : `/stories/${key}`;

/** 권한별 '할 수 있는 일' — 순서는 권한 목록 순서 */
const CAN: Record<string, string> = {
  read: '맡은 항목의 목록과 최신 판을 읽는다 (GET /api/agent/entries/<종류>[/<주소>]).',
  upload: '그림(PNG·JPG·WEBP 5MB 이하)과 웹용 PDF(4MB 이하)를 올린다 (POST /api/agent/assets?name=<파일 이름>).',
  create: '새 항목을 만든다 (POST /api/agent/entries/<종류>, { key, content }).',
  edit: '새 판(내용·구조)을 저장하고 항목 정보를 고친다 (POST …/<주소>/versions, { content, note, base_version }).',
  archive: '공개 중이 아닌 항목을 보관한다 (POST …/<주소>/archive).',
  publish: '내가 "공개해"라고 할 때만 공개하거나 공개를 내린다 (POST …/<주소>/publish · /unpublish).',
};
const CANNOT: Record<string, string> = {
  read: '읽기', upload: '파일 올리기', create: '새 항목 만들기', edit: '고치기(새 판)', archive: '보관', publish: '공개·공개 내림',
};

export type ConnectInput = {
  ai: AiKind;
  schoolName: string;
  /** 예: https://onschools.vercel.app (끝 / 없이) */
  baseUrl: string;
  /** 홈페이지 주소 이름(public_slug). 아직 없으면 null */
  publicSlug: string | null;
  kinds: string[];
  /** null 이면 고른 종류 모두 */
  keys: string[] | null;
  perms: string[];
  expiresAt: string | null;
  /** 발급 직후에만 있다. 없으면 환경 변수 안내 */
  token?: string | null;
};

function day(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildConnectText(i: ConnectInput): string {
  const base = i.baseUrl.replace(/\/+$/, '');
  const site = i.publicSlug ? `${base}/s/${i.publicSlug}` : null;
  const kinds = i.kinds.map((k) => KIND_KO[k] ?? k).join('·');
  const auto = i.perms.includes('autopublish');
  const L: string[] = [];

  const site_ = i.kinds.some((k) => k !== 'package');
  const job = site_ && i.kinds.includes('package') ? '홈페이지·학사 꾸러미' : site_ ? '홈페이지' : '학사 꾸러미';
  L.push(`너는 지금부터 "${i.schoolName}" ${job} 작업을 돕는다. 아래 규칙을 지켜라.`);
  L.push('');
  L.push('## 맡은 범위');
  L.push(`- 학교: ${i.schoolName}${site ? ` (공개 홈페이지 ${site})` : ''}`);
  L.push(`- 종류: ${kinds}`);
  if (i.keys && i.keys.length) {
    L.push('- 주소(이것만):');
    for (const k of i.keys) {
      const kind = i.kinds.length === 1 ? i.kinds[0] : null;
      L.push(`  - ${k}${site && kind ? ` → ${site}${pathOf(kind, k)}` : ''}`);
    }
  } else {
    L.push(`- 주소: 위 종류의 모든 항목`);
  }
  L.push(`- 기한: ${i.expiresAt ? `${day(i.expiresAt)}까지` : '무기한(학교 관리자가 폐기하면 바로 멈춤)'}`);
  L.push('');

  L.push('## 할 수 있는 일');
  for (const p of Object.keys(CAN)) if (i.perms.includes(p)) L.push(`- ${CAN[p]}`);
  if (auto) {
    L.push('- **자동 공개 토큰이다. 새 항목·새 판을 저장하면 바로 방문자에게 공개된다.**');
    L.push('  - 그래서 저장하기 전에 무엇을(어느 항목, 바뀌는 내용·그림) 저장할지 나에게 보여 주고 "저장해"라는 답을 받은 뒤 저장한다.');
    L.push('  - 잘못 올렸으면 이전 판으로 다시 공개(POST …/publish { version })하거나 공개를 내린다.');
  }
  L.push('');
  if (i.kinds.includes('page')) {
    L.push('## 템플릿 빈 칸 (쪽)');
    L.push('- 템플릿으로 시작한 쪽은 meta.template 이 있다. GET /api/agent/templates 로 빈 칸 경로·안내를 읽고, 안내 자리 [ … ]가 남은 칸만 학교 자료로 채워 새 판(시안)으로 저장한다.');
    L.push('- 내가 학교 자료(소개서·안내문)나 옛 홈페이지 주소를 주면 그것을 읽어 채운다. 옛 홈페이지는 공개된 쪽만 읽는다.');
    L.push('- 자료에 없는 사실(연도·숫자·이름·연락처)은 지어내지 말고 안내 자리를 그대로 둔다.');
    L.push('');
  }
  if (i.kinds.includes('package')) {
    L.push('## 학사 꾸러미 (정의 만들기)');
    L.push('- 학교가 원하는 기록(예: 봉사 시간·독서·상담)을 기록 유형·양식·목록·출력·흐름 정의로 쓴다. 정의마다 새 판을 저장하면 서버 검사기가 오류·확인 목록(issues)을 돌려준다.');
    L.push('  - 정의 저장: POST /api/agent/definitions { kind: record_type|form|view|output|flow, code, spec, why, base_version }');
    L.push('  - 꾸러미 저장: POST /api/agent/packages { code, title, members: [{ kind, code }], why, base_version }');
    L.push('  - 읽기: GET /api/agent/packages · 미리보기(합성 자료): GET /api/agent/packages/<code>/preview');
    L.push('- 칸에는 개인정보 등급(directory·internal·sensitive·restricted)을 꼭 적는다. 학생·수업은 정해진 열로만 잇고, 자료 칸에 이름·메일·식별자를 두지 않는다.');
    L.push('- 꾸러미를 켜는 것은 학교 관리자다(/packages). 검사를 통과하고 미리보기를 확인한 뒤 나에게 켜 달라고 말한다. 실제 기록을 쓰지 않는다.');
    L.push('');
  }
  L.push('## 할 수 없는 일 (서버가 거부한다)');
  const missing = Object.keys(CANNOT).filter((p) => !i.perms.includes(p)).map((p) => CANNOT[p]);
  if (missing.length) L.push(`- 이 토큰에 없는 권한: ${missing.join(', ')}`);
  L.push('- 되살리기, 홈페이지 설정, 구성원, 다른 학교, 맡은 범위 밖 항목');
  if (!i.perms.includes('publish')) L.push('- 공개: 공개는 학교 관리자가 /site에서 한다. 저장한 판은 시안으로 남는다.');
  L.push('- 실제 학생 이름·사진·사실(날짜·연락처·수치)을 지어내지 않는다. 모르면 비워 두고 나에게 묻는다.');
  L.push('');

  L.push('## 연결');
  L.push(`- API 기본 주소: ${base}`);
  L.push('- 모든 요청에 머리 x-agent-token 을 붙인다. 로그인 쿠키는 보내지 않는다.');
  if (i.token) {
    L.push('- 토큰은 아래 한 줄로 환경 변수에 넣고, 그 뒤로는 $SCHOOL_AGENT_TOKEN 으로만 쓴다:');
    L.push(`  export SCHOOL_AGENT_TOKEN='${i.token}'`);
  } else {
    L.push('- 토큰은 환경 변수 SCHOOL_AGENT_TOKEN 에 있다(학교 관리자가 넣어 둔다). 없으면 나에게 넣어 달라고 한다.');
  }
  L.push(`- 확인: curl -s -H "x-agent-token: $SCHOOL_AGENT_TOKEN" ${base}/api/agent/me`);
  if (i.ai === 'codex') L.push(`- Codex 클라우드라면 환경의 인터넷 허용 목록에 ${new URL(base).host} 를 넣어야 한다.`);
  if (i.ai === 'claude-code') L.push(`- Claude Code 클라우드 세션이라면 환경의 네트워크 허용 목록에 ${new URL(base).host} 가 있어야 한다.`);
  if (i.ai === 'other') L.push('- 인터넷 요청(curl 등)을 보낼 수 있는 AI여야 한다. 못 하면 그렇다고 나에게 말한다.');
  L.push('- 토큰 값을 화면·로그·파일·커밋·다른 대화에 다시 쓰지 않는다.');
  L.push('');

  L.push('## 고치는 순서');
  L.push('1. 최신 판을 읽는다 (latest.version, latest.content).');
  L.push('2. 그 위에 고쳐, 읽은 판 번호를 base_version 으로 함께 보낸다.');
  L.push('3. 409가 오면 그 사이 누가 새 판을 만든 것이다. 다시 읽고 고친다. 덮어쓰지 않는다.');
  L.push('4. 403·401이면 범위를 넓히려 하지 말고 나에게 알린다.');
  L.push('');
  L.push('## 끝나면');
  L.push(`- 무엇을(어느 항목) 몇 판으로 저장${i.perms.includes('publish') ? '·공개' : ''}했는지, 공개 주소와 함께 알려 준다.`);
  L.push(`- 자세한 API·블록 모양: ${GUIDE_URL}`);
  return L.join('\n');
}
