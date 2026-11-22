'use strict';

const exampleDay = '2026-11-20';
const academicKey = 'school-platform-academics-round-02';
const sections = [
  ['home','학사 홈'],['setup','학기 설정'],['roster','학생·교직원'],
  ['activities','수업·활동'],['attendance','출결'],['calendar','일정']
];
const demoAcademic = {
  activeTerm: 1,
  terms: [{id:1,name:'2026학년도 2학기',start:'2026-11-02',end:'2027-03-12',mode:'class'}],
  students: [
    {id:1,term:1,name:'예시 학생 A',group:'초등 1학년'},
    {id:2,term:1,name:'예시 학생 B',group:'초등 1학년'},
    {id:3,term:1,name:'예시 학생 C',group:'초등 2학년'},
    {id:4,term:1,name:'예시 학생 D',group:'초등 2학년'}
  ],
  staff: [{id:1,name:'예시 교사 A'},{id:2,name:'예시 교사 B'}],
  activities: [{id:1,term:1,name:'그림책 읽기 프로젝트',teacher:1,members:[1,2,3]}],
  events: [
    {id:1,term:1,name:'어린이 북페어',date:'2026-11-27',public:true},
    {id:2,term:1,name:'행사 준비 회의',date:'2026-11-23',public:false}
  ],
  attendance: {}
};
function readAcademic() {
  try { return JSON.parse(localStorage.getItem(academicKey)) || structuredClone(demoAcademic); }
  catch { return structuredClone(demoAcademic); }
}
const academic = readAcademic();
let academicTab = 'home';
let attendanceDate = exampleDay;
let attendanceScope = '';
let rosterTab = 'students';
let publicView = false;

const term = () => academic.terms.find(item => item.id === academic.activeTerm);
const inTerm = items => items.filter(item => item.term === academic.activeTerm);
const nextAcademicId = items => Math.max(0,...items.map(item => item.id)) + 1;
const modes = {class:'학년·학급 중심',project:'선택수업·프로젝트 중심',mixed:'혼합형'};
const attendanceStatuses = { '':'미입력', present:'출석', late:'지각', absent:'결석', excused:'인정' };
const controls = (action,label,variant='secondary') => '<button class="' + variant + '" type="button" data-academic="' + action + '">' + label + '</button>';
const openSection = (tab,label,variant) => controls('go-' + tab,label,variant);
const option = (value,label,selected) => '<option value="' + escape(value) + '"' + (selected ? ' selected' : '') + '>' + escape(label) + '</option>';

function saveAcademic(message) {
  try { localStorage.setItem(academicKey,JSON.stringify(academic)); }
  catch { notice('브라우저 저장이 제한되어 현재 화면에만 반영됩니다.'); render(); return; }
  render();
  if (message) notice(message);
}
function rosterInScope() {
  const students = inTerm(academic.students);
  if (attendanceScope.startsWith('a:')) {
    const activity = inTerm(academic.activities).find(item => 'a:' + item.id === attendanceScope);
    return activity ? students.filter(item => activity.members.includes(item.id)) : [];
  }
  return attendanceScope.startsWith('g:') ? students.filter(item => item.group === attendanceScope.slice(2)) : [];
}
function attendanceOptions() {
  const groups = [...new Set(inTerm(academic.students).map(item => item.group).filter(Boolean))];
  const groupOptions = groups.map(group => ['g:'+group,group+' · 일일 출결']);
  const activityOptions = inTerm(academic.activities).map(item => ['a:'+item.id,item.name+' · 수업 출결']);
  return term().mode === 'class' ? [...groupOptions,...activityOptions] : [...activityOptions,...groupOptions];
}
const attendanceKey = () => JSON.stringify([academic.activeTerm,attendanceDate,attendanceScope]);
const sortedEvents = () => inTerm(academic.events).slice().sort((a,b) => a.date.localeCompare(b.date));
function termDate() {
  const current = term();
  return exampleDay >= current.start && exampleDay <= current.end ? exampleDay : current.start;
}
function eventList(items,editable) {
  if (!items.length) return '<p class="academic-empty">표시할 일정이 없습니다.</p>';
  return '<div class="academic-list">' + items.map(item => '<article><div><h3>' + escape(item.name) + '</h3><small>' + escape(item.date) + '</small></div>' + (editable ? '<div class="actions"><span class="pill ' + (item.public ? 'green' : 'muted') + '">' + (item.public ? '홈페이지 공개' : '교직원만') + '</span><button class="secondary" data-academic="event-visibility" data-id="' + item.id + '">' + (item.public ? '공개 해제' : '홈페이지에 공개') + '</button></div>' : '') + '</article>').join('') + '</div>';
}
function academicHome() {
  const current = term();
  return '<section class="academic-hero"><h2>' + escape(current.name) + '</h2><p>' + escape(modes[current.mode]) + ' · ' + escape(current.start) + ' ~ ' + escape(current.end) + '</p>' + openSection('setup','학기 설정') + '</section>' +
    '<div class="academic-stats">' +
    '<button class="card pad" data-academic="go-roster">학생 명단<strong>' + inTerm(academic.students).length + '명</strong></button>' +
    '<button class="card pad" data-academic="go-activities">수업·활동<strong>' + inTerm(academic.activities).length + '개</strong></button>' +
    '<button class="card pad" data-academic="go-attendance">출결<strong>기록하기</strong></button></div>' +
    '<section class="card pad"><div class="between"><h2>학기 일정</h2>' + openSection('calendar','일정 열기') + '</div>' + eventList(sortedEvents().slice(0,3),false) + '</section>';
}
function academicSetup() {
  const current = term();
  return '<section class="card pad"><div class="between"><h2>학기 설정</h2>' + controls('add-term','새 학기','primary') + '</div>' +
    '<div class="academic-controls"><label>조회 학기<select data-academic-field="term">' + academic.terms.map(item => option(item.id,item.name,item.id === current.id)).join('') + '</select></label></div>' +
    '<form id="academic-mode"><div class="academic-controls"><label>운영 방식<select name="mode">' + Object.entries(modes).map(([key,label]) => option(key,label,key === current.mode)).join('') + '</select></label><button class="primary">운영 방식 저장</button></div></form>' +
    '<p class="sub">' + escape(current.start) + '부터 ' + escape(current.end) + '까지</p></section>';
}
function academicRoster() {
  const studentView = rosterTab === 'students';
  const rows = (studentView ? inTerm(academic.students) : academic.staff).map(item => '<tr><td>' + escape(item.name) + '</td><td>' + escape(studentView ? (item.group || '미배정') : '교직원') + '</td></tr>').join('');
  return '<section class="card pad"><div class="between"><h2>학생·교직원</h2>' + controls(studentView ? 'add-student' : 'add-staff',studentView ? '학생 등록' : '교직원 등록','primary') + '</div>' +
    '<div class="academic-scope">' + ['students','staff'].map((tab,i) => '<button class="secondary" data-academic="roster-' + tab + '" aria-pressed="' + (rosterTab === tab) + '">' + ['학생','교직원'][i] + '</button>').join('') + '</div>' +
    (rows ? '<div class="academic-table"><table class="matrix"><thead><tr><th scope="col">이름</th><th scope="col">' + (studentView ? '소속' : '구분') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="academic-empty">등록된 명단이 없습니다.</p>') + '</section>';
}
function academicActivities() {
  const items = inTerm(academic.activities);
  return '<section class="card pad"><div class="between"><h2>수업·활동</h2>' + controls('add-activity','수업·활동 개설','primary') + '</div>' +
    (items.length ? '<div class="academic-list">' + items.map(item => '<article><div><h3>' + escape(item.name) + '</h3><small>담당 ' + escape(academic.staff.find(s => s.id === item.teacher)?.name || '미배정') + ' · 참여 ' + item.members.length + '명</small></div><button class="secondary" data-academic="edit-members" data-id="' + item.id + '">참여 명단</button></article>').join('') + '</div>' : '<p class="academic-empty">개설된 수업·활동이 없습니다.</p>') + '</section>';
}
function academicAttendance() {
  const scopes = attendanceOptions();
  if (!scopes.some(([scope]) => scope === attendanceScope)) attendanceScope = scopes[0]?.[0] || '';
  const records = academic.attendance[attendanceKey()] || {};
  const students = rosterInScope();
  return '<section class="card pad"><h2>출결 기록</h2><div class="academic-controls"><label>날짜<input type="date" data-academic-field="date" min="' + escape(term().start) + '" max="' + escape(term().end) + '" value="' + escape(attendanceDate) + '"></label><label>출결 대상<select data-academic-field="scope"' + (scopes.length ? '' : ' disabled') + '>' +
    (scopes.length ? scopes.map(([key,label]) => option(key,label,key === attendanceScope)).join('') : option('','대상 없음',true)) + '</select></label></div>' +
    (students.length ? '<form id="academic-attendance"><div class="academic-table"><table class="matrix"><thead><tr><th scope="col">학생</th><th scope="col">소속</th><th scope="col">상태</th></tr></thead><tbody>' + students.map(item =>
      '<tr><td>' + escape(item.name) + '</td><td>' + escape(item.group || '미배정') + '</td><td><select aria-label="' + escape(item.name) + ' 출결" name="student-' + item.id + '">' + Object.entries(attendanceStatuses).map(([value,label]) => option(value,label,value === (records[item.id] || ''))).join('') + '</select></td></tr>').join('') +
      '</tbody></table></div><div class="actions"><button class="primary">출결 저장</button></div></form>' : '<p class="academic-empty">출결 대상에 학생을 등록하거나 참여 명단을 설정해 주세요.</p>') + '</section>';
}
function academicCalendar() {
  return '<section class="card pad"><div class="between"><h2>학사일정</h2>' + controls('add-event','일정 등록','primary') + '</div>' +
    '<div class="academic-scope"><button class="secondary" data-academic="all-events" aria-pressed="' + !publicView + '">교직원 화면</button><button class="secondary" data-academic="public-events" aria-pressed="' + publicView + '">홈페이지 미리보기</button></div>' +
    eventList(sortedEvents().filter(item => !publicView || item.public),!publicView) + '</section>';
}
function renderAcademics() {
  const views = {home:academicHome,setup:academicSetup,roster:academicRoster,activities:academicActivities,attendance:academicAttendance,calendar:academicCalendar};
  main.innerHTML = header('학사 운영','학기와 명단을 준비하고 수업·출결·일정을 관리합니다.') + '<div class="academics"><nav class="academic-menu" aria-label="학사 메뉴">' +
    sections.map(([id,label]) => '<button type="button" data-academic="go-' + id + '"' + (id === academicTab ? ' aria-current="page"' : '') + '>' + label + '</button>').join('') + '</nav>' + views[academicTab]() + '</div>';
}

function academicForm(title,kind,fields,button='저장',id='') {
  showDialog(title,'<form id="academic-' + kind + '" data-id="' + id + '">' + fields + '<p class="alert" role="alert"></p><div class="actions"><button class="primary">' + button + '</button></div></form>');
}
const field = (label,element) => '<label class="field">' + label + element + '</label>';
const nameField = label => field(label,'<input type="text" name="name" required maxlength="80">');
const dateField = (label,name,value='',bound=false) => field(label,'<input type="date" name="' + name + '" value="' + escape(value) + '" required' + (bound ? ' min="' + escape(term().start) + '" max="' + escape(term().end) + '"' : '') + '>');
function addActivityForm() {
  const choices = [option('','담당자를 선택하세요',true),...academic.staff.map(item => option(item.id,item.name,false))];
  academicForm('수업·활동 개설','new-activity',nameField('수업·활동 이름') + field('담당 교직원','<select name="teacher" required>' + choices.join('') + '</select>'),'개설');
}
function membersForm(id) {
  const activity = inTerm(academic.activities).find(item => item.id === id);
  if (!activity) return;
  const fields = inTerm(academic.students).map(item => '<label><input type="checkbox" name="members" value="' + item.id + '"' + (activity.members.includes(item.id) ? ' checked' : '') + '> ' + escape(item.name) + ' · ' + escape(item.group || '미배정') + '</label>').join('');
  academicForm('참여 명단','members','<fieldset class="academic-checks"><legend>' + escape(activity.name) + '</legend>' + (fields || '<p>등록된 학생이 없습니다.</p>') + '</fieldset>','명단 저장',id);
}
document.addEventListener('click',event => {
  const button = event.target.closest('[data-academic]');
  if (!button) return;
  const action = button.dataset.academic;
  if (action.startsWith('go-')) { academicTab = action.slice(3); render(); return; }
  if (action.startsWith('roster-')) { rosterTab = action.slice(7); render(); return; }
  if (action === 'add-term') academicForm('새 학기','new-term',nameField('학기 이름') + dateField('시작일','start') + dateField('종료일','end'),'학기 만들기');
  if (action === 'add-student') academicForm('학생 등록','new-student',nameField('학생 이름') + field('소속 학급·그룹','<input type="text" name="group" maxlength="40">'),'학생 등록');
  if (action === 'add-staff') academicForm('교직원 등록','new-staff',nameField('교직원 이름'),'교직원 등록');
  if (action === 'add-activity') addActivityForm();
  if (action === 'edit-members') membersForm(Number(button.dataset.id));
  if (action === 'add-event') academicForm('일정 등록','new-event',nameField('일정 이름') + dateField('날짜','date',termDate(),true) + '<p class="sub">등록 후 홈페이지 공개 여부를 선택할 수 있습니다.</p>','일정 등록');
  if (action === 'public-events' || action === 'all-events') { publicView = action === 'public-events'; render(); }
  if (action === 'event-visibility') {
    const item = inTerm(academic.events).find(entry => entry.id === Number(button.dataset.id));
    if (item) { item.public = !item.public; saveAcademic(item.public ? '홈페이지 공개 일정에 반영했습니다.' : '교직원 일정으로 변경했습니다.'); }
  }
});
document.addEventListener('change',event => {
  const target = event.target;
  if (target.dataset.academicField === 'term') {
    academic.activeTerm = Number(target.value);
    attendanceScope = '';
    attendanceDate = termDate();
    saveAcademic();
  }
  if (target.dataset.academicField === 'date') {
    if (target.value && target.validity.valid) { attendanceDate = target.value; render(); }
    else target.value = attendanceDate;
  }
  if (target.dataset.academicField === 'scope') { attendanceScope = target.value; render(); }
});
document.addEventListener('submit',event => {
  const form = event.target;
  if (!form.id.startsWith('academic-')) return;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const value = key => String(data.get(key) || '');
  const invalid = message => { form.querySelector('.alert').textContent = message; };
  if (form.id.startsWith('academic-new-') && !name) { invalid('이름을 입력해 주세요.'); return; }
  switch(form.id) {
    case 'academic-mode':
      if (!Object.hasOwn(modes,value('mode'))) return;
      term().mode = value('mode'); attendanceScope = '';
      saveAcademic('운영 방식을 저장했습니다.'); return;
    case 'academic-new-term':
      if (value('start') > value('end')) { invalid('종료일은 시작일 이후여야 합니다.'); return; }
      academic.activeTerm = nextAcademicId(academic.terms);
      academic.terms.push({id:academic.activeTerm,name,start:value('start'),end:value('end'),mode:'class'});
      attendanceDate = termDate(); attendanceScope = ''; break;
    case 'academic-new-student':
      academic.students.push({id:nextAcademicId(academic.students),term:academic.activeTerm,name,group:value('group').trim()}); break;
    case 'academic-new-staff':
      academic.staff.push({id:nextAcademicId(academic.staff),name}); break;
    case 'academic-new-activity':
      if (!academic.staff.some(item => item.id === Number(value('teacher')))) { invalid('담당 교직원을 선택해 주세요.'); return; }
      academic.activities.push({id:nextAcademicId(academic.activities),term:academic.activeTerm,name,teacher:Number(value('teacher')),members:[]}); break;
    case 'academic-members': {
      const activity = inTerm(academic.activities).find(item => item.id === Number(form.dataset.id));
      if (!activity) return;
      const selected = data.getAll('members').map(Number);
      activity.members = inTerm(academic.students).filter(item => selected.includes(item.id)).map(item => item.id); break;
    }
    case 'academic-attendance': {
      const records = {...academic.attendance[attendanceKey()]};
      for (const student of rosterInScope()) {
        const status = value('student-' + student.id);
        if (Object.hasOwn(attendanceStatuses,status)) records[student.id] = status;
      }
      academic.attendance[attendanceKey()] = records;
      saveAcademic('출결을 저장했습니다.'); return;
    }
    case 'academic-new-event':
      if (value('date') < term().start || value('date') > term().end) { invalid('학기 기간 안의 날짜를 선택해 주세요.'); return; }
      academic.events.push({id:nextAcademicId(academic.events),term:academic.activeTerm,name,date:value('date'),public:false});
      publicView = false; break;
    default: return;
  }
  dialog.close();
  saveAcademic('저장했습니다.');
});
attendanceDate = termDate();
