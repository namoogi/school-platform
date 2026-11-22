'use strict';
(() => {
  const schools = {
    dreamy: {name:'드리미학교', mode:'self', linked:false, budget:30000},
    rung: {name:'룽아룬숙사학교', mode:'managed', linked:false, budget:30000}
  };
  const workers = ['졸업생 A · 홈페이지·디자인', '졸업생 B · 번역·검수'];
  const status = {
    new:'접수됨', offered:'수락 대기', accepted:'작업 중', submitted:'검수 대기',
    revision:'수정 요청', approved:'검수 완료 · 지급 대기', paid:'지급 확인'
  };
  const content = document.getElementById('s12-content');
  const message = document.getElementById('s12-status');
  const tabs = Array.from(document.querySelectorAll('.s12-tabs button'));
  const tasks = [{
    id:1, school:'rung', title:'태국어 가정통신문 모바일 줄바꿈 수정', category:'홈페이지·표시',
    schoolNote:'공지 제목이 좁은 화면에서 잘립니다. 공개 예정 문구를 확인해 주세요.', stage:'new'
  }];
  let role='school', schoolId='rung', workerId=0, focusId=1;
  const money = value => Number(value).toLocaleString('ko-KR')+'원';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const option = (value,label,selected) => '<option value="'+esc(value)+'" '+(selected?'selected':'')+'>'+esc(label)+'</option>';
  const action = (value,label) => '<button type="button" class="s12-action" data-action="'+value+'">'+label+'</button>';
  function list(items){
    return items.length ? items.map(task => {
      const title=role==='worker'?task.offerTitle:task.title;
      const label=role==='school'&&['approved','paid'].includes(task.stage)?'완료':status[task.stage];
      return
      '<button type="button" class="s12-task" data-task="'+task.id+'" aria-pressed="'+(task.id===focusId)+'"><strong>'+esc(title)+'</strong><span>'+schools[task.school].name+' · '+label+'</span></button>';
    }).join('') : '<p class="s12-muted">이 화면에 표시할 요청이 없습니다.</p>';
  }
  function schoolView(){
    const school=schools[schoolId];
    const own=tasks.filter(t=>t.school===schoolId);
    const modes=[['self','학교 자체 Anthropic 연결','학교가 Claude Console을 연결하고 API 사용료를 직접 부담합니다.'],['managed','운영팀에 요청','운영팀이 디자인·수정·검수를 맡습니다. 학교는 진행 상황을 봅니다.']];
    const offering=school.mode==='self' ? '<h3>학교 Console 연결</h3><p class="s12-muted">'+(school.linked?'모의 연결 완료 · 학교 직접 결제':'연결 전 · Claude Platform 조직 관리자가 승인')+'</p><form id="s12-link"><label>시안용 월 API 한도 (원)<input type="number" name="limit" min="1000" max="10000000" step="1000" value="'+school.budget+'" required></label><div class="s12-actions"><button class="s12-primary" type="submit">'+(school.linked?'예산 변경 시험':'연결 시험')+'</button>'+(school.linked?action('unlink','연결 해제 시험'):'')+'</div></form>' :
      '<h3>개선 요청 접수</h3><p class="s12-muted">요청에 필요한 공개 정보나 가상 예시를 적어 주세요.</p><form id="s12-request"><label>업무 유형<select name="category"><option>홈페이지·표시</option><option>번역·문구</option><option>비식별 시안·테스트</option><option>교무 권한이 필요한 업무</option></select></label><label>요청 제목<input name="title" maxlength="90" required></label><label>수정할 내용<textarea name="summary" maxlength="360" rows="3" required></textarea></label><button class="s12-primary" type="submit">요청 접수</button></form>';
    const selected=own.find(t=>t.id===focusId);
    return '<div class="s12-grid"><div><label class="s12-switch">학교<select id="s12-school">'+Object.entries(schools).map(([id,s])=>option(id,s.name,id===schoolId)).join('')+'</select></label><fieldset class="s12-modes"><legend>학교 기본 지원 방식</legend>'+modes.map(([id,title,detail])=>'<label><input type="radio" name="service" value="'+id+'" '+(id===school.mode?'checked':'')+'><span><strong>'+title+'</strong><small>'+detail+'</small></span></label>').join('')+'</fieldset><div class="s12-form">'+offering+'</div></div><div><h2>우리 학교 요청</h2>'+list(own)+(selected?'<div class="s12-form"><h3>'+esc(selected.title)+'</h3><p>'+esc(selected.schoolNote)+'</p><p class="s12-muted">학교 청구 방식 · 관리 서비스 기본 포함 (예시)</p>'+(['approved','paid'].includes(selected.stage)?'<p class="s12-submitted"><strong>검수한 결과</strong> '+esc(selected.work)+'</p>':'')+'</div>':'')+'</div></div>';
  }
  function operatorForm(task){
    if(task.stage!=='new')return '';
    if(task.category==='교무 권한이 필요한 업무')return '<p class="s12-restricted">운영 책임자 검토 · 학교 권한이 필요한 업무는 작업자 배정 대상에서 제외합니다.</p>';
    return '<form id="s12-offer"><label>담당 작업자<select name="worker">'+workers.map((name,i)=>option(i,name,i===0)).join('')+'</select></label><label>작업자에게 표시할 제목<input name="offerTitle" maxlength="90" placeholder="예: 공지 문구 배치 수정" required></label><label>작업자에게 전달할 범위<textarea rows="3" name="scope" maxlength="280" required></textarea></label><div class="s12-fields"><label>납기<input type="date" name="due" value="2026-11-30" required></label><label>작업 보수 (원)<input type="number" name="pay" min="1" max="100000000" step="1" required></label></div><label class="s12-check"><input type="checkbox" name="approvedMaterial" required>배정 범위에 학생 원본·학교 계정이 없음을 확인</label><button class="s12-primary" type="submit">작업 제안</button></form>';
  }
  function operationView(){
    const task=tasks.find(t=>t.id===focusId)||tasks[0];
    focusId=task.id;
    const controls=task.stage==='submitted' ?
      '<form id="s12-revise"><label>수정할 내용<textarea rows="2" name="feedback" maxlength="240" required></textarea></label><div class="s12-actions"><button type="submit" class="s12-action">수정 요청</button>'+action('approve','검수 승인')+'</div></form>' :
      task.stage==='approved' ? action('pay','지급 확인 시험') : '';
    return '<div class="s12-grid"><div><h2>전체 학교 요청</h2>'+list(tasks)+'</div><div><h2>'+esc(task.title)+'</h2><p class="s12-muted">'+task.category+' · '+status[task.stage]+'</p><p>'+esc(task.schoolNote)+'</p><div class="s12-form">'+(task.stage==='new'?operatorForm(task):workSummary(task)+(task.work?'<p class="s12-submitted"><strong>작업자 제출</strong> '+esc(task.work)+'</p>':'')+controls)+'</div></div></div>';
  }
  function workSummary(task){
    return '<dl class="s12-summary"><div><dt>작업자</dt><dd>'+workers[task.worker]+'</dd></div><div><dt>작업 범위</dt><dd>'+esc(task.scope)+'</dd></div><div><dt>납기</dt><dd>'+esc(task.due)+'</dd></div><div><dt>작업 보수</dt><dd>'+money(task.pay)+'</dd></div></dl>';
  }
  function workerView(){
    const assigned=tasks.filter(t=>t.worker===workerId);
    const task=assigned.find(t=>t.id===focusId)||assigned[0];
    if(task)focusId=task.id;
    const controls=task?.stage==='offered' ? '<div class="s12-actions">'+action('accept','작업 수락')+action('decline','제안 거절')+'</div>' :
      ['accepted','revision'].includes(task?.stage)?'<form id="s12-submit"><label>제출 내용<textarea rows="3" name="work" maxlength="280" required></textarea></label><button type="submit" class="s12-primary">검수 요청</button></form>':'';
    return '<div class="s12-grid"><div><label class="s12-switch">가상 작업자<select id="s12-worker">'+workers.map((name,i)=>option(i,name,workerId===i)).join('')+'</select></label><h2>내 배정</h2>'+list(assigned)+'</div><div>'+(!task?'':'<h2>'+esc(task.offerTitle)+'</h2><p class="s12-muted">'+status[task.stage]+'</p><div class="s12-form">'+workSummary(task)+(task.feedback?'<p class="s12-submitted"><strong>검수 의견</strong> '+esc(task.feedback)+'</p>':'')+controls+'</div>')+'</div></div>';
  }
  function render(note='',focus=false){
    for(const button of tabs)button.setAttribute('aria-pressed',String(button.dataset.role===role));
    content.innerHTML=({school:schoolView,operator:operationView,worker:workerView})[role]();
    message.textContent=note;
    if(focus){message.tabIndex=-1;message.focus({preventScroll:true});}
  }
  for(const button of tabs)button.addEventListener('click',()=>{role=button.dataset.role;render();});
  content.addEventListener('change',event=>{
    const input=event.target;
    if(input.id==='s12-school'){schoolId=input.value;render();document.getElementById(input.id).focus();}
    if(input.id==='s12-worker'){workerId=Number(input.value);render();document.getElementById(input.id).focus();}
    if(input.name==='service'){
      schools[schoolId].mode=input.value;render('이 학교의 기본 방식을 변경했습니다.');
      content.querySelector('[name="service"]:checked').focus();
    }
  });
  const transitions={
    accept:['worker','offered','accepted','작업을 수락했습니다.'],
    decline:['worker','offered','new','제안을 거절했습니다. 운영팀 요청 목록으로 돌아갑니다.'],
    approve:['operator','submitted','approved','검수를 승인했습니다. 지급 대기 상태입니다.'],
    pay:['operator','approved','paid','지급 확인 상태를 기록했습니다.']
  };
  content.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.task){
      focusId=Number(button.dataset.task);render();content.querySelector('[data-task="'+focusId+'"]').focus();return;
    }
    const action=button.dataset.action;
    if(action==='unlink'&&role==='school'){schools[schoolId].linked=false;render('이 학교의 모의 연결을 해제했습니다.',true);return;}
    const task=tasks.find(t=>t.id===focusId), next=transitions[action];
    if(!task||!next||next[0]!==role||task.stage!==next[1])return;
    if(role==='worker'&&task.worker!==workerId)return;
    task.stage=next[2];
    if(action==='decline')delete task.worker;
    render(next[3],true);
  });
  content.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.target, data=new FormData(form);
    for(const input of form.querySelectorAll('input[type="text"],input:not([type]),textarea')){
      if(input.required&&!input.value.trim()){
        input.setCustomValidity('내용을 입력해 주세요.');input.reportValidity();input.setCustomValidity('');return;
      }
    }
    const read=key=>String(data.get(key)??'').trim();
    const task=tasks.find(t=>t.id===focusId);
    if(form.id==='s12-link'){
      Object.assign(schools[schoolId],{linked:true,budget:Number(read('limit'))});
      render('이 학교의 모의 연결과 예산을 저장했습니다.',true);
    }else if(form.id==='s12-request'){
      focusId=tasks.length+1;
      tasks.unshift({id:focusId,school:schoolId,title:read('title'),category:read('category'),schoolNote:read('summary'),stage:'new'});
      render('운영팀에 예시 요청을 접수했습니다.',true);
    }else if(form.id==='s12-offer'&&task?.stage==='new'&&task.category!=='교무 권한이 필요한 업무'){
      Object.assign(task,{worker:Number(read('worker')),offerTitle:read('offerTitle'),scope:read('scope'),due:read('due'),pay:Number(read('pay')),stage:'offered'});
      render('작업자 화면에 예시 제안을 표시했습니다.',true);
    }else if(form.id==='s12-submit'&&task?.worker===workerId&&['accepted','revision'].includes(task.stage)){
      Object.assign(task,{work:read('work'),stage:'submitted'});
      render('운영 책임자에게 검수 요청이 표시됩니다.',true);
    }else if(form.id==='s12-revise'&&task?.stage==='submitted'){
      Object.assign(task,{feedback:read('feedback'),stage:'revision'});render('작업자에게 수정 요청을 표시했습니다.',true);
    }
  });
  render();
})();
