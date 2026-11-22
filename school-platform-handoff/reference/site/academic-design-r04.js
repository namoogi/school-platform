'use strict';

const scenarios = {
  class: {
    name:'학급·교과 중심 학교', term:'2학기제', schedule:'주간 고정 교시', grading:'교과 점수', record:'학기별 성적표', group:'초등 6학년', staff:'담임 · 교과교사 · 교무 승인자', attendance:'일일 + 교시별',
    sources:[['학사 운영계획','1쪽 · 학기 구분'],['주간 시간표','2쪽 · 교시표'],['성적표 빈 양식','1쪽 · 미평가 표시'],['교직원 업무분장','1쪽 · 교과·담임']],
    issue:'미응시 과목의 성적표 표기 확정', conflict:'성적표 예시에는 공란, 평가계획에는 미응시라는 표기가 있습니다.', choices:['미응시로 표시','공란으로 표시'], sample:'수학', note:'학급 일일 출결과 교과 출결을 각각 기록합니다.'
  },
  project: {
    name:'선택수업·프로젝트 중심 학교', term:'2학기 + 집중 기간', schedule:'프로젝트 블록', grading:'루브릭 + 서술', record:'활동기록 + 서술형 성적표', group:'혼합 학년 프로젝트', staff:'멘토 · 수업 담당 · 기록 승인자', attendance:'일일 + 활동 회차별',
    sources:[['선택수업 안내','3쪽 · 집중 기간과 블록'],['프로젝트 평가계획','2쪽 · 루브릭'],['활동기록 양식','1쪽 · 공식 표기'],['교직원 업무분장','2쪽 · 멘토 역할']],
    issue:'활동기록에 사용할 공식 표기명 확정', conflict:'수강 안내와 활동기록 양식에서 같은 프로젝트를 서로 다른 이름으로 표시합니다.', choices:['지역탐구 프로젝트로 표시','탐구활동으로 표시'], sample:'지역탐구 프로젝트', note:'프로젝트 참여 명단을 기준으로 블록 회차별 출결을 기록합니다.'
  },
  international: {
    name:'3텀·순환 시간표 학교', term:'3텀제', schedule:'6일 순환 시간표', grading:'성취수준 + 수치', record:'텀별 성적표 + 누적 기록', group:'Middle School 과정', staff:'어드바이저 · 교과교사 · 과정 책임자', attendance:'교시별',
    sources:[['Academic Calendar','1쪽 · 세 개 텀'],['Rotation timetable','1쪽 · Day 1–6'],['성적표 빈 양식','2쪽 · 점수·수준'],['교직원 업무분장','1쪽 · 과정 책임자']],
    issue:'휴일 뒤 순환일 계산 방식 확정', conflict:'시간표는 6일 순환을 보여주지만, 휴일을 순환일로 셀지는 자료에 명시되어 있지 않습니다.', choices:['휴일은 순환일에서 제외','휴일도 순환일에 포함'], sample:'Science', note:'휴일 전 수업일은 Day 2입니다.'
  }
};
const storeKey = 'school-platform-round-04-design';
const panel = document.querySelector('#panel');
const profile = document.querySelector('#profile');
const picker = document.querySelector('#scenario');
const notice = document.querySelector('#notice');
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const engines = [
  ['학적·학사력','term','기간 구조'],['수강·교육과정','group','기본 편성'],['시간표','schedule','편성 방식'],
  ['출결','attendance','기록 단위'],['평가·이수','grading','평가 척도'],['성적표·학생부','record','출력 구성'],['조직·권한','staff','업무 역할']
];
let selected = 'class';
let workflow = 'analysis';
let drafts = {};
try {
  const saved = JSON.parse(localStorage.getItem(storeKey));
  if (saved?.drafts) drafts = saved.drafts;
  if (Object.hasOwn(scenarios,saved?.selected)) selected = saved.selected;
} catch {}
picker.value = selected;

function draft() {
  return drafts[selected] ??= {decision:'', fields:{}, scopes:{}, checked:false, versions:[]};
}
const scenario = () => scenarios[selected];
const values = () => ({...scenario(), ...draft().fields});
const badge = (text,color='') => '<span class="tag ' + color + '">' + text + '</span>';
const button = (page,label,style='secondary') => '<button type="button" class="' + style + '" data-page="' + page + '">' + label + '</button>';
const selectOptions = (options,chosen) => options.map(([value,label]) => '<option value="' + escapeText(value) + '"' + (chosen === value ? ' selected' : '') + '>' + escapeText(label) + '</option>').join('');
let timer;
function say(text) {
  notice.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => { notice.textContent = ''; },4500);
}
function save(message) {
  try { localStorage.setItem(storeKey,JSON.stringify({selected,drafts})); }
  catch { if (message) message = '현재 화면에만 반영했습니다. 브라우저 저장을 사용할 수 없습니다.'; }
  render();
  if (message) say(message);
}
function summary() {
  const model = values();
  const data = draft();
  profile.innerHTML = '<div class="summary"><strong>' + model.name + '</strong>' + badge(model.term) + badge(model.schedule) +
    (data.decision ? badge('검토 항목 해결','green') : badge('담당자 확인 1건','amber')) +
    (data.versions.length ? badge('v' + data.versions.length + ' 저장','green') : '') + '</div>';
}
function analysis() {
  const model = scenario();
  const data = draft();
  return '<div class="grid"><section class="card"><div class="between"><h2>담당자가 결정할 항목</h2>' + (data.decision ? badge('확정','green') : badge('확인 필요','amber')) + '</div>' +
    '<div class="item"><h3>' + model.issue + '</h3><p>' + model.conflict + '</p></div>' +
    '<form id="decision"><label class="field">학교 확인 결과<select name="decision" required>' + selectOptions([['','확인한 규칙을 고르세요'],...model.choices.map(text => [text,text])],data.decision) +
    '</select></label><div class="actions"><button class="primary">규칙 확정</button>' + button('mapping','엔진 연결 보기') + '</div></form></section>' +
    '<section class="card"><h2>분석에 사용한 자료</h2><div class="evidence">' + model.sources.map(([file,position]) => '<div><h3>' + file + '</h3><p class="ref">' + position + '</p></div>').join('') + '</div></section></div>';
}
function mapping() {
  const model = values();
  const choices = {
    term:['2학기제','2학기 + 집중 기간','3텀제'].map(value => [value,value]),
    schedule:['주간 고정 교시','블록 + A/B 주간','프로젝트 블록','6일 순환 시간표'].map(value => [value,value]),
    grading:['교과 점수','루브릭 + 서술','성취수준 + 수치'].map(value => [value,value]),
    attendance:[[scenario().attendance,scenario().attendance],['일일','일일'],['일일 + 교시별','일일 + 교시별'],['일일 + 활동 회차별','일일 + 활동 회차별'],['교시별','교시별']],record:[[scenario().record,scenario().record],['학기별 성적표','학기별 성적표'],['활동기록 + 서술형 성적표','활동기록 + 서술형 성적표'],['텀별 성적표 + 누적 기록','텀별 성적표 + 누적 기록']]};
  for (const key of Object.keys(choices)) choices[key] = [...new Map(choices[key]).entries()];
  return '<section class="card"><div class="between"><h2>기본 엔진 연결</h2>' + badge('가상 규칙 7개') + '</div><form id="mapping"><div class="table-wrap"><table><thead><tr><th scope="col">기본 엔진</th><th scope="col">학교 규칙</th><th scope="col">적용 범위</th></tr></thead><tbody>' +
    engines.map(([label,key,field]) => '<tr><th scope="row">' + label + '</th><td>' + (choices[key] ? '<select aria-label="' + field + '" name="' + key + '">' + selectOptions(choices[key],model[key]) + '</select>' : escapeText(model[key])) +
      '</td><td>' + (choices[key] ? '<select aria-label="' + label + ' 적용 범위" name="' + key + '-scope">' + selectOptions([['all','학교 공통'],['program',scenario().group]],draft().scopes[key] || 'all') + '</select>' : (key === 'group' ? escapeText(model.group) : '학교 공통')) + '</td></tr>').join('') +
    '</tbody></table></div><div class="actions"><button class="primary">연결 저장</button>' + button('simulation','표본 검증 열기') + '</div></form><p class="muted">지원 범위를 벗어나는 규칙은 <a href="round-04-admin.html#requests" target="_blank" rel="noopener" title="새 탭에서 열기">개선 요청 판</a>에서 검토합니다.</p></section>';
}
function simulation() {
  const model = values();
  const data = draft();
  const sampleName = selected === 'project' && data.decision === scenario().choices[1] ? '탐구활동' : model.sample;
  const sampleResult = {
    '교과 점수':'86점','루브릭 + 서술':'성취 3 · 교사 서술','성취수준 + 수치':'Level 4 · 86점'
  }[model.grading];
  let derived = data.decision || '표본 출력 대기';
  if (selected === 'international' && data.decision) derived = data.decision === scenario().choices[0] ? '휴일 다음 수업일 · Day 3' : '휴일 다음 수업일 · Day 4';
  return '<div class="grid"><section class="card"><h2>표본 검증</h2><dl><div><dt>기간·시간표</dt><dd>' + model.term + ' · ' + model.schedule + '</dd></div><div><dt>출결 기록 단위</dt><dd>' + escapeText(model.attendance) + '</dd></div><div><dt>예외 규칙 적용 결과</dt><dd>' + escapeText(derived) + '</dd></div></dl>' +
    '<p class="muted">' + model.note + '</p>' + (data.decision ? '<form id="verification"><label class="check"><input type="checkbox" name="verified" required' + (data.checked ? ' checked' : '') + '> 모의 출력과 학교 규칙이 일치함을 확인했습니다.</label><div class="actions"><button class="primary">검증 완료</button>' + button('release','프로필 적용 보기') + '</div></form>' : '<p class="callout">자료 분석에서 미확정 규칙을 먼저 확인해 주세요.</p><div class="actions">' + button('analysis','자료 분석 열기') + '</div>') +
    '</section><section class="card"><h2>문서 출력 예시</h2><div class="report"><small>가상 학생 A · ' + model.group + '</small><p><strong>' + escapeText(model.record) + '</strong></p><p>' + escapeText(sampleName) + ' / ' + escapeText(sampleResult) + '</p></div><p class="muted">문서 형식과 데이터 연결을 확인하는 예시입니다.</p></section></div>';
}
function release() {
  const data = draft();
  return '<div class="grid"><section class="card"><h2>프로필 적용</h2><p class="muted">학교에서 확인한 규칙과 엔진 연결을 적용일과 함께 저장합니다.</p>' +
    (!data.checked ? '<p class="callout">담당자 확인과 표본 검증을 마치면 적용할 수 있습니다.</p>' : '') +
    '<form id="release"><label class="field">적용 예정일<input type="date" name="effective" required value="2027-01-01"></label><div class="actions"><button class="primary"' + (data.checked ? '' : ' disabled') + '>시안 프로필 승인·저장</button></div></form></section>' +
    '<section class="card"><h2>저장 버전</h2>' + (data.versions.length ? '<ol class="version-list">' + data.versions.map((version,i) => '<li>v' + (i+1) + ' · ' + escapeText(version.effective) + '<p class="ref">' + escapeText(version.decision) + '</p></li>').join('') + '</ol>' : '<p class="muted">저장된 버전이 없습니다.</p>') +
    '<div class="actions"><a href="academic-engine-design-r04.md" class="secondary" download>설계 명세 내려받기</a></div></section></div>';
}
function render() {
  summary();
  for (const button of document.querySelectorAll('.steps [data-page]')) {
    if (button.dataset.page === workflow) button.setAttribute('aria-current','step');
    else button.removeAttribute('aria-current');
  }
  panel.innerHTML = {analysis,mapping,simulation,release}[workflow]();
}
picker.addEventListener('change',() => { selected = picker.value; workflow = 'analysis'; save(); });
document.addEventListener('click',event => {
  const target = event.target.closest('[data-page]');
  if (!target) return;
  workflow = target.dataset.page;
  render();
});
panel.addEventListener('submit',event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const data = draft();
  switch(event.target.id) {
    case 'decision': {
      const choice = form.get('decision');
      if (!scenario().choices.includes(choice)) return;
      if (data.decision !== choice) data.checked = false;
      data.decision = choice;
      save('학교 규칙을 확정했습니다.'); break;
    }
    case 'mapping': {
      const keys = ['term','schedule','attendance','grading','record'];
      const fields = Object.fromEntries(keys.map(key => [key,form.get(key)]));
      const scopes = Object.fromEntries(keys.map(key => [key,form.get(key + '-scope')]));
      if (JSON.stringify(data.fields) !== JSON.stringify(fields) || JSON.stringify(data.scopes) !== JSON.stringify(scopes)) data.checked = false;
      data.fields = fields;
      data.scopes = scopes;
      save('엔진 연결을 저장했습니다.'); break;
    }
    case 'verification':
      if (!data.decision || !form.get('verified')) return;
      data.checked = true;
      save('표본 검증을 완료했습니다.'); break;
    case 'release': {
      const effective = form.get('effective');
      if (!data.decision || !data.checked || !effective) return;
      const version = {effective,decision:data.decision,fields:{...data.fields},scopes:{...data.scopes}};
      if (JSON.stringify(data.versions.at(-1)) === JSON.stringify(version)) { say('이미 같은 설정과 적용일로 저장했습니다.'); return; }
      data.versions.push(version);
      save('시안 프로필 v' + data.versions.length + '을 저장했습니다.'); break;
    }
  }
});
render();
