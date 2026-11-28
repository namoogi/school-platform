/**
 * 127차 ADR 0043 3단계(5 AI 맞춤): 템플릿으로 만든 학교 사본을 학교 구독 AI가 학교 자료에 맞추도록 붙여 넣을 지시문.
 * 절차는 docs/agents/grade-intake.md 그대로다(받을 자료 → 매핑표 → 견본 고르기 → 학교 사본 새 판 → 미리 계산 → 사람 확정).
 * 지금 학교 작업 토큰으로 학사 쪽에서 쓸 수 있는 것은 '학사 꾸러미' 정의뿐이다. 척도·계산식·학기 구조·출력 프로필은
 * AI가 초안(바꿀 값과 '왜')을 만들고 학교 관리자가 화면에서 새 판으로 저장한다: 학기 구조·척도·성적 정책·계산식 판(/grades)·출력 프로필(/records)·숨김.
 * 128차에 맞춤 척도·정책 전체·계산식·출력 프로필 편집 화면이 생겨 '관제를 거쳐 저장' 묶음이 없어졌다.
 * 견본 목록은 지시문 안에 넣는다(학교 AI의 작업 토큰은 /api/calc-rules 를 읽지 못한다, Codex 220번 PR 검토).
 * (ADR 0032·0040, 플랫폼 서버는 유료 분석을 하지 않음)
 * 순수 함수: 화면(복사 버튼)과 단위 시험(tests/template-ai-guide.test.ts)이 같이 쓴다. 지시문은 AI에게 주는 글이라 한국어 하나로 둔다(AI 연결 글과 같음).
 */
import { PRESETS } from './calc/expr';

export const GRADE_INTAKE_URL = 'https://github.com/namoogi/school-platform/blob/main/docs/agents/grade-intake.md';

export type GuideInput = {
  schoolName: string;
  /** 예: https://onschools.vercel.app (끝 / 없이) */
  baseUrl: string;
  template: { key: string; version: number; title: string };
  scheme: string | null;
  levels: string[];
  periods: string[];
  /** 지금 판의 척도 내용(구간 코드·하한·평점·이수) */
  scales: { code: string; kind: string; version: number; bands: { code: string; min: number | null; points?: number; earns_credit?: boolean }[] }[];
  /** 지금 성적 정책 판(없으면 null) */
  policy: { version: number; policy: Record<string, unknown> } | null;
  calcSamples: string[];
  outputs: string[];
  /** 학교가 저장한 계산식 판(코드별 최신) */
  calcRules: { code: string; version: number; spec: unknown }[];
  /** 학교가 저장한 출력 프로필(코드별 최신) */
  outputProfiles: { code: string; format: string; version: number; settings: Record<string, unknown> }[];
  hidden: string[];
};

const HIDE_KO: Record<string, string> = { rank: '석차', gpa: '평점(GPA)', rank_grade: '석차등급', period_attendance: '교시 출결' };
const SCHEME_KO: Record<string, string> = { kr: '한국식', us: '미국식', custom: '커스텀' };
const list = (xs: string[]) => (xs.length ? xs.join(', ') : '없음');

export function buildTemplateGuideText(i: GuideInput): string {
  const base = i.baseUrl.replace(/\/+$/, '');
  const L: string[] = [];
  L.push(`너는 지금부터 "${i.schoolName}"의 학사 설정을 학교 자료에 맞추는 일을 돕는다. 아래 규칙을 지켜라.`);
  L.push('');
  L.push('## 지금 학교 사본 (템플릿에서 시작)');
  L.push(`- 템플릿: ${i.template.title} (${i.template.key} ${i.template.version}판)`);
  L.push(`- 학년 체계: ${i.scheme ? SCHEME_KO[i.scheme] ?? i.scheme : '정하지 않음'} · 학교급: ${list(i.levels)}`);
  L.push(`- 학기 구조: ${list(i.periods)}`);
  if (!i.scales.length) L.push('- 척도: 없음');
  else {
    L.push('- 척도(지금 판, 구간 = 코드:하한[/평점][/이수 아님]):');
    for (const sc of i.scales) L.push(`  - ${sc.code} ${sc.version}판 (${sc.kind}): ${sc.bands.map((b) => `${b.code}:${b.min ?? '-'}${b.points != null ? `/${b.points}` : ''}${b.earns_credit === false ? '/이수 아님' : ''}`).join(' ') || '구간 없음'}`);
  }
  L.push(`- 성적 정책: ${i.policy ? `${i.policy.version}판 ${JSON.stringify(i.policy.policy)}` : '없음(기본값)'}`);
  L.push(`- 템플릿의 계산식 견본: ${list(i.calcSamples)} · 템플릿의 발행 서식: ${list(i.outputs)}`);
  if (!i.calcRules.length) L.push('- 학교 계산식 판: 없음(아직 저장 안 함, 마감 때 견본을 고름)');
  else {
    L.push('- 학교 계산식 판(지금 판, 고칠 때 이 식에서 시작):');
    for (const r of i.calcRules) L.push(`  - ${r.code} ${r.version}판: ${JSON.stringify(r.spec)}`);
  }
  if (!i.outputProfiles.length) L.push('- 학교 출력 프로필: 없음(기본 표기)');
  else {
    L.push('- 학교 출력 프로필(지금 판):');
    for (const o of i.outputProfiles) L.push(`  - ${o.code} (${o.format}) ${o.version}판: ${JSON.stringify(o.settings)}`);
  }
  L.push(`- 숨기는 구획: ${list(i.hidden.map((h) => HIDE_KO[h] ?? h))}`);
  L.push('');
  L.push('## 할 일 (순서대로)');
  L.push(`절차 전체: ${GRADE_INTAKE_URL}`);
  L.push('1. 나에게 학교 자료를 달라고 한다: 빈 성적표·학생부 양식, 학업성적관리규정(평가 규칙), 한 과목 평가 계획, 계산된 결과 몇 줄(이름·점수는 가린 것).');
  L.push('2. 매핑표를 만든다: 영역·반영비율·만점, 합계 계산과 반올림, 성취도 구간 이름, P/F, 이수 기준, 석차·평점 사용 여부, 서술 칸 글자 수, 출력 칸 순서. 칸마다 근거(규정 조항·양식 위치)를 적고, 자료에 없으면 "학교 확인 필요"로 둔다.');
  L.push('3. 위 학교 사본과 다른 점만 고른다. 계산식은 아래 \'계산식 견본\'에서 가장 가까운 것을 골라 고친다. 척도와 계산식은 같은 구간으로 짝지어 고른다.');
  L.push('4. 바꿀 값을 초안으로 정리해 나에게 보여 준다. 각 항목에 "지금 값 → 바꿀 값 · 왜(규정 조항)"를 한 줄씩 적는다. 저장은 학교 관리자가 아래 화면에서 새 판으로 한다(지금 작업 토큰으로는 이 값들을 쓸 수 없다). 화면마다 \'왜\' 칸이 필수이니 규정 조항을 함께 준다.');
  L.push(`   - 학기 구조: ${base}/academics?tab=terms`);
  L.push(`   - 척도: ${base}/grades '척도' — 정해진 견본 추가, 또는 '구간 고치기'·'맞춤 척도 새로 만들기'에 구간 JSON 배열을 붙여 넣는다. 한 구간 = {"code":"A","min":90,"points":4,"earns_credit":true,"label":{"ko":"A","en":"A"}} (points·label은 생략 가능, 이수 아님은 earns_credit:false).`);
  L.push(`   - 성적 정책: ${base}/grades '성적 정책' — 자릿수 세 칸, 또는 '정책 전체 고치기(JSON)'에 정책 객체 전체를 붙여 넣는다. 받는 칸: score_digits·final_digits(0~4), stats{sd:"population"|"sample",digits}, narrative_limits{서술 종류:글자 수}, attendance{day_absent_ratio,chronic_ratio,min_attendance_ratio(0~1)}, requests{due_days}. 지금 판에서 바꿀 칸만 고친 전체를 준다.`);
  L.push(`   - 계산식 판: ${base}/grades '계산식 판' — 고칠 식이나 견본에서 시작해 식(spec) JSON을 붙여 넣는다. 화면이 저장 전에 경계 점수 89.5·59.5·39.5(평가 항목 하나 total, 출석 100%)로 미리 계산해 보여 주고, 식에 문제가 없을 때만 저장된다.`);
  L.push(`   - 출력 프로필: ${base}/records '출력 프로필' — 서식을 고르고 설정 JSON 객체를 붙여 넣는다. 서식별 칸: 자체 학생부 char_limits{subject_detail:세특 글자 수}·note, 미국 성적증명서 gpa_scale, 학교 소개서 description·gpa_policy·scale_code, ปพ.1 학교 사본 bands[{min,grade}]·note, 영어권 학업 기록 note. 발행할 때 그 프로필을 고른다.`);
  L.push(`   - 숨기는 구획: ${base}/academics/templates`);
  L.push('   JSON은 화면 칸에 그대로 붙여 넣을 수 있게 항목마다 한 덩어리로 따로 준다.');
  L.push('5. 경계값(89.5, 59.5, 39 같은 점수)으로 미리 계산해 학교가 준 결과와 맞는지 보여 준다. 다르면 고치지 말고 질문으로 남긴다.');
  L.push('6. 학교가 따로 쌓고 싶은 기록(봉사 시간·독서·상담 등)이 있으면, 학사 꾸러미 토큰으로 정의를 만든다(AI 연결 글의 "학사 꾸러미" 규칙). 켜기는 학교 관리자가 한다.');
  L.push('');
  L.push('## 계산식 견본 (플랫폼 기본, 코드 — 설명)');
  for (const [code, p] of Object.entries(PRESETS)) L.push(`- ${code}${i.calcSamples.includes(code) ? ' (이 템플릿 견본)' : ''} — ${p.note}`);
  const mine = i.calcSamples.filter((c) => PRESETS[c]);
  if (mine.length) {
    L.push('이 템플릿 견본의 식(spec, 고칠 때 이 모양 그대로):');
    for (const c of mine) L.push(`- ${c}: ${JSON.stringify(PRESETS[c].spec)}`);
  }
  L.push('');
  L.push('## 지킬 것');
  L.push('- 실제 학생 이름·점수·연락처를 저장소·대화 기록·예시에 남기지 않는다. 예시는 합성 숫자로 바꾼다.');
  L.push('- 자료에 없는 규칙을 지어내지 않는다. 모르면 비워 두고 나에게 묻는다.');
  L.push('- 기본판(템플릿)은 고치지 않는다. 학교 사본만 새 판으로 바꾸고, 판은 고치지 않고 쌓는다(보고 고친 판 번호 base_version, 그 사이 새 판이 생겼으면 409).');
  L.push('- 학교가 이미 고친 값과 부딪치면 학교 값을 지키고 질문으로 남긴다.');
  L.push('- 플랫폼에 유료 분석을 요청하지 않는다. 분석은 너(학교 구독 AI)가 한다.');
  return L.join('\n');
}
