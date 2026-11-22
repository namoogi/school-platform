'use strict';

const categories = [
  {id:'calendar',label:'학년도·기간',prompt:'학교의 기간은 어떻게 나뉘며, 집중 기간은 정규 학기와 어떤 관계인가요?',modules:'기간 등록 · 적용일 및 기간 중첩 확인',hints:[[/1\s*학기.*2\s*학기|2\s*학기제/,'정규 두 학기가 있는 것으로 보입니다.'],[/3\s*텀|3\s*학기제/,'세 개 기간을 운영하는 것으로 보입니다.'],[/집중\s*기간|집중\s*과정/,'별도 집중 기간 또는 과정이 있는 것으로 보입니다.']]},
  {id:'curriculum',label:'교육과정·수강',prompt:'학급 수업과 선택수업은 어떻게 편성하나요? 다른 학년이 같은 수업에 참여할 수 있나요?',modules:'수업 개설 · 소속 및 참여 배정',hints:[[/선택\s*수업|수강\s*신청/,'학생이 수업을 선택하는 과정이 있는 것으로 보입니다.'],[/학년\s*혼합|혼합\s*학년/,'여러 학년이 같은 수업에 참여하는 것으로 보입니다.'],[/학급별|학급\s*편성/,'학급 단위 편성이 있는 것으로 보입니다.']]},
  {id:'schedule',label:'시간표·수업일',prompt:'시간표는 어떤 주기로 반복되나요? 휴일·보강 때 주기나 교시가 어떻게 바뀌나요?',modules:'반복 슬롯 배치 · 회차 생성 · 일정 예외 처리',hints:[[/A\s*\/\s*B|A주.*B주/i,'A/B 주기가 있는 것으로 보입니다.'],[/블록/,'블록 수업이 있는 것으로 보입니다.'],[/고정\s*교시|주간\s*시간표/,'주간 또는 고정 교시가 있는 것으로 보입니다.'],[/\d+\s*일\s*순환|Day\s*[1-9]/i,'순환 일자 표기가 있는 것으로 보입니다.']]},
  {id:'attendance',label:'출결',prompt:'출결의 원기록은 일일·교시·활동 중 무엇인가요? 정정과 마감은 누가 하나요?',modules:'회차 출결 기록 · 정정 이력 · 마감',hints:[[/일일\s*출결/,'일일 출결을 기록하는 것으로 보입니다.'],[/교시별\s*출결|수업별\s*출결/,'교시나 수업별 기록이 있는 것으로 보입니다.'],[/활동\s*(회차)?\s*출결|프로젝트\s*(회차)?\s*출결/,'활동별 출결을 기록하는 것으로 보입니다.']]},
  {id:'assessment',label:'평가·성적표·학생부',prompt:'어떤 평가를 기록하고 무엇을 공식 문서에 표시하나요? 미응시와 면제는 어떻게 표시하나요?',modules:'평가 기록 · 문서 필드 연결 · 서식 출력',hints:[[/점수|원점수/,'수치 평가 항목이 있는 것으로 보입니다.'],[/루브릭|서술/,'루브릭 또는 서술 기록이 있는 것으로 보입니다.'],[/성적표|학생부|생활기록/,'공식 출력 서식이 있는 것으로 보입니다.']]},
  {id:'staff',label:'교직원·업무 권한',prompt:'누가 어느 학생의 기록을 입력·열람·승인하나요? 겸임이나 대리 승인 범위가 있나요?',modules:'업무 역할 할당 · 범위별 권한 · 승인 이력',hints:[[/담임|멘토/,'담임 또는 멘토 역할이 있는 것으로 보입니다.'],[/교과\s*교사|수업\s*담당/,'수업 단위 담당자가 있는 것으로 보입니다.'],[/승인자|교무\s*승인|발급\s*담당/,'승인 또는 발급 직무가 있는 것으로 보입니다.']]}
];
const samples = [
  {name:'학사 운영계획.csv',kind:'텍스트 파일',text:'분류,운영 방식\n정규 기간,1학기 및 2학기\n여름,집중 기간 운영\n교육과정,학년 혼합 선택수업\n생활,일일 출결'},
  {name:'시간표 · 시트 붙여넣기',kind:'시트 값',text:'항목\t운영 방식\n시간표\tA/B 주간 편성\n활동\t90분 블록\n출결\t프로젝트 회차 출결'},
  {name:'성적표·업무분장.txt',kind:'텍스트 파일',text:'학기 성적표: 루브릭과 교사 서술\n멘토: 학생 관찰 입력\n교무 승인자: 성적표 확인'}
];
const storeKey = 'school-platform-round-05-profiles';
const panel = document.querySelector('#panel');
const profile = document.querySelector('#profile');
const notice = document.querySelector('#notice');
const escapeText = input => String(input).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let sources = [];
let analyzed = false;
let findings = {};
let answers = {};
let workingAnswers = {};
let page = 'intake';
let versions = [];
let timer;
let sequence = 1;
let ingesting = false;
try { versions = JSON.parse(localStorage.getItem(storeKey)) || []; } catch {}
if (!Array.isArray(versions)) versions = [];

function say(text) {
  notice.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => { notice.textContent = ''; },4200);
}
const badge = (label,color='') => '<span class="tag ' + color + '">' + label + '</span>';
const button = (run,label,kind='secondary') => '<button type="button" data-run="' + run + '" class="' + kind + '">' + label + '</button>';
function changeSources(list) {
  sources = list;
  analyzed = false;
  findings = {};
  answers = {};
  workingAnswers = {};
  render();
}
function attach(items) {
  changeSources([...sources,...items.map(item => ({...item,id:sequence++}))]);
}
function intake() {
  return '<div class="grid"><section class="card"><h2>학교 자료 추가</h2><p class="muted">학사력, 교육과정, 시간표, 성적표·학생부 빈 서식, 업무분장</p><p class="hint-text">시안에는 가상 자료 또는 비식별 자료를 사용해 주세요.</p><div class="intake-fields">' +
    '<form id="attach-files"><label>파일 첨부<input class="file-button" name="files" type="file" multiple required accept=".txt,.csv,.tsv,.pdf,.xlsx,.docx"></label><p class="hint-text">TXT·CSV·TSV는 읽을 수 있습니다. PDF·XLSX·DOCX는 등록만 시연합니다. 파일별 최대 2MB.</p><div class="actions"><button class="secondary"' + (ingesting ? ' disabled' : '') + '>파일 추가</button></div></form>' +
    '<form id="paste-sheet"><label>시트 이름<input name="label" type="text" maxlength="80" required placeholder="예: 2027 교육과정 편제 / 수강계획 탭"></label><label class="field">시트 범위 또는 행 설명<input name="range" type="text" maxlength="80" placeholder="예: A1:F20"></label><label>시트에서 복사한 셀<textarea name="text" required maxlength="80000" placeholder="시트에서 셀을 복사해 붙여넣으세요."></textarea></label><div class="actions"><button class="secondary">시트 값 추가</button></div></form>' +
    '<form id="link-sheet"><label>Google Sheets 주소<input name="url" type="url" maxlength="500" required placeholder="https://docs.google.com/spreadsheets/d/…"></label><p class="hint-text">주소는 등록할 수 있습니다. 시안에서 분석하려면 셀 값을 붙여넣으세요.</p><div class="actions"><button class="secondary">시트 주소 등록</button></div></form></div></section>' +
    '<section class="card sticky"><h2>등록 자료</h2>' + (sources.length ? '<ul class="source-list">' + sources.map(item => '<li><div><strong>' + escapeText(item.name) + '</strong><div class="ref">' + escapeText(item.kind) + ' · ' + (item.text ? '분석 가능' : '내용 읽기 대기') + '</div></div><button type="button" class="link-button" data-remove="' + item.id + '" aria-label="' + escapeText(item.name) + ' 제거">제거</button></li>').join('') + '</ul>' : '<p class="muted">등록한 자료가 없습니다.</p>') +
    '<div class="actions"><button type="button" class="primary" data-run="analyze"' + (sources.some(item => item.text) && !ingesting ? '' : ' disabled') + '>자료 분석 및 질문 만들기</button></div>' +
    (analyzed ? '<p class="hint-text">자료를 추가하거나 삭제하면 추정과 관리자 답변을 다시 검토합니다.</p>' : '') + '</section></div>';
}
function analyze() {
  const lines = sources.filter(item => item.text).flatMap(item => item.text.split(/\r?\n/).map((text,i) => ({item,text:text.trim(),line:i+1})).filter(line => line.text));
  findings = Object.fromEntries(categories.map(category => {
    const matched = category.hints.flatMap(([pattern,guess]) => {
      const hits = lines.filter(line => pattern.test(line.text)).slice(0,2);
      return hits.map(hit => ({guess,source:hit.item.name,range:hit.item.range,line:hit.line,excerpt:hit.text.slice(0,220)}));
    });
    return [category.id,matched];
  }));
  if (!analyzed) answers = {};
  analyzed = true;
  page = 'review';
  render();
}
function showQuestion(category) {
  const evidence = findings[category.id];
  const answer = answers[category.id];
  const suggestions = [...new Set(evidence.map(entry => entry.guess))];
  const periodDisagreement = category.id === 'calendar' && suggestions.includes(category.hints[0][1]) && suggestions.includes(category.hints[1][1]);
  return '<section class="card"><div class="between"><h2>' + category.label + '</h2>' + (answer ? badge(answer.none ? '해당 없음' : '관리자 확인','green') : badge('답변 필요','amber')) + '</div>' +
    (suggestions.length ? '<p class="status-line"><strong>자료에서 추정</strong> ' + suggestions.map(escapeText).join(' ') + '</p>' : '<p class="status-line muted">읽을 수 있는 자료에서 단서를 찾지 못했습니다.</p>') +
    (periodDisagreement ? '<p class="callout">자료마다 기간 수가 다르게 나타납니다. 각 규칙이 적용되는 과정과 연도를 확인해 주세요.</p>' : '') +
    evidence.map(entry => '<blockquote class="quote">“' + escapeText(entry.excerpt) + '”<cite>' + escapeText(entry.source) + (entry.range ? ' · ' + escapeText(entry.range) : '') + ' · 입력 ' + entry.line + '행</cite></blockquote>').join('') +
    '<p><strong>관리자에게 묻습니다</strong> ' + category.prompt + '</p><form class="question" data-question="' + category.id + '"><label>학교의 실제 운영 규칙<textarea name="answer" maxlength="800" placeholder="적용 대상, 기간, 예외를 함께 적어 주세요.">' + escapeText(workingAnswers[category.id] ?? answer?.text ?? '') + '</textarea></label><div class="actions"><button class="primary" name="decision" value="confirmed">이 답변 확인</button><button class="secondary" name="decision" value="none">해당 없음</button>' + (answer ? button('reopen-' + category.id,'확인 다시 열기') : '') + '</div></form></section>';
}
function review() {
  if (!analyzed) return '<section class="card"><h2>자료 분석 후 확인을 시작합니다</h2><div class="actions">' + button('intake','자료 첨부 열기') + '</div></section>';
  return '<div class="grid"><div class="question-list">' + categories.map(showQuestion).join('') + '</div><section class="card sticky"><h2>관리자 확인 현황</h2><p>' + Object.keys(answers).length + ' / ' + categories.length + '개 확인</p><p class="muted">추정만으로 제도를 확정하지 않습니다. 확인된 답변으로 모듈 연결안을 검토합니다.</p><div class="actions">' + button('modules','기본 모듈 연결 보기','primary') + '</div></section></div>';
}
function modules() {
  const ready = categories.every(item => Object.hasOwn(answers,item.id)) && categories.some(item => answers[item.id] && !answers[item.id].none);
  const rows = categories.map(item => {
    const answer = answers[item.id];
    return '<tr><th scope="row">' + item.label + '</th><td>' + (answer?.none ? '해당 없음' : answer ? escapeText(answer.text) : '관리자 확인 대기') + '</td><td>' + (answer?.text ? item.modules : '연결 대기') + '</td></tr>';
  });
  return '<div class="grid"><section class="card"><h2>기본 기능 모듈 연결안</h2><div class="table-wrap"><table class="module-table"><thead><tr><th scope="col">영역</th><th scope="col">학교가 확인한 제도</th><th scope="col">필요한 기본 기능</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div><p class="hint-text">실제 연결에는 구조화된 설정, 데이터 매핑, 표본 검증과 적용 승인이 필요합니다.</p></section>' +
    '<section class="card sticky"><h2>제도 프로필</h2><p class="muted">관리자 확인을 마치면 시안 연결안을 저장할 수 있습니다.</p><div class="actions"><button type="button" class="primary" data-run="save"' + (ready ? '' : ' disabled') + '>시안 연결안 저장</button></div>' +
    (versions.length ? '<ol class="version-list">' + versions.map((stamp,i) => '<li><details><summary>프로필 v' + (i+1) + ' · ' + escapeText(stamp.date) + '</summary><dl>' + categories.map(item => '<div><dt>' + item.label + '</dt><dd>' + (stamp.answers?.[item.id]?.none ? '해당 없음' : escapeText(stamp.answers?.[item.id]?.text || '')) + '</dd></div>').join('') + '</dl></details></li>').join('') + '</ol>' : '<p class="hint-text">저장한 버전이 없습니다.</p>') +
    '<div class="actions"><a class="secondary" href="academic-module-design-r05.md" download>설계 명세 내려받기</a></div></section></div>';
}
function render() {
  profile.innerHTML = '<div class="summary"><strong>학교 제도 프로필</strong>' + badge('등록 자료 ' + sources.length + '개') + badge('관리자 확인 ' + Object.keys(answers).length + ' / ' + categories.length,'green') + (versions.length ? badge('저장 버전 ' + versions.length + '개') : '') + '</div>';
  for (const control of document.querySelectorAll('[data-page]')) {
    if (control.dataset.page === page) control.setAttribute('aria-current','step');
    else control.removeAttribute('aria-current');
  }
  panel.innerHTML = {intake,review,modules}[page]();
}
function saveVersion() {
  if (!categories.every(item => Object.hasOwn(answers,item.id)) || !Object.values(answers).some(item => item.text)) return;
  const snapshot = {answers:structuredClone(answers),sources:sources.map(({name,kind}) => ({name,kind})),date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())};
  if (JSON.stringify(versions.at(-1)) === JSON.stringify(snapshot)) { say('이미 같은 답변으로 저장했습니다.'); return; }
  versions.push(snapshot);
  try { localStorage.setItem(storeKey,JSON.stringify(versions)); say('시안 연결안을 이 브라우저에 저장했습니다.'); }
  catch { say('현재 화면에만 저장했습니다. 브라우저 저장을 사용할 수 없습니다.'); }
  render();
}
document.querySelector('#sample').addEventListener('click',() => {
  if (sources.some(item => item.sample)) { say('예시 자료가 이미 등록되어 있습니다.'); return; }
  page = 'intake';
  attach(samples.map(item => ({...item,sample:true})));
  say('예시 자료 세 개를 등록했습니다.');
});
document.addEventListener('click',event => {
  const control = event.target.closest('button');
  if (!control) return;
  if (control.dataset.page) { page = control.dataset.page; render(); return; }
  if (control.dataset.remove) { changeSources(sources.filter(item => item.id !== Number(control.dataset.remove))); return; }
  const run = control.dataset.run;
  if (!run) return;
  if (run === 'analyze') analyze();
  else if (run === 'save') saveVersion();
  else if (run.startsWith('reopen-')) { delete answers[run.slice(7)]; render(); }
  else { page = run; render(); }
});
async function addFiles(files) {
  if (ingesting) return;
  ingesting = true;
  render();
  const accepted = files.filter(file => /\.(txt|csv|tsv|pdf|xlsx|docx)$/i.test(file.name) && file.size <= 2*1024*1024);
  const results = await Promise.allSettled(accepted.map(async file => {
    const readable = /\.(txt|csv|tsv)$/i.test(file.name);
    return {name:file.name,kind:readable ? '텍스트 파일' : '첨부 파일',text:readable ? await file.text() : ''};
  }));
  const added = results.filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
  ingesting = false;
  if (added.length) attach(added);
  else render();
  if (added.length !== files.length) say('형식, 읽기 오류 또는 파일 크기 제한으로 일부 자료를 추가하지 못했습니다.');
}
panel.addEventListener('input',event => {
  const key = event.target.form?.dataset.question;
  if (key && event.target.name === 'answer') workingAnswers[key] = event.target.value;
});
panel.addEventListener('submit',async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const field = key => String(data.get(key) ?? '').trim();
  if (form.id === 'attach-files') await addFiles(data.getAll('files').filter(file => file.name));
  if (form.id === 'paste-sheet') {
    if (!field('text') || !field('label')) { say('시트 이름과 셀 값을 입력해 주세요.'); return; }
    attach([{name:field('label'),kind:'시트 값',range:field('range'),text:field('text')}]);
  }
  if (form.id === 'link-sheet') {
    const url = field('url');
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:[/?#]|$)/.test(url)) { say('Google Sheets 문서 주소를 입력해 주세요.'); return; }
    attach([{name:'Google Sheets · ' + new URL(url).pathname.split('/')[3].slice(0,12),kind:'시트 주소',text:''}]);
  }
  if (form.dataset.question && analyzed) {
    const none = event.submitter?.value === 'none';
    if (!none && !field('answer')) { say('학교의 운영 규칙을 입력해 주세요.'); return; }
    answers[form.dataset.question] = {text:none ? '' : field('answer'),none};
    render();
    say(none ? '해당 없음으로 저장했습니다.' : '관리자 답변을 확인했습니다.');
  }
});
render();
