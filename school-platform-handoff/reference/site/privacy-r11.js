'use strict';
(() => {
  const byId=id=>document.getElementById(id);
  const scenarios={
    exchange:{name:'교류학교 작품 공유',kind:'지정 수신처에 제공',flow:'우리 학교 → 국내 교류학교 교사',question:'다른 학교 교사가 학생의 작품을 수업에 활용합니다.',action:'참여를 선택한 학생의 작품만 해당 학교의 지정 교사에게 학기 말까지 열어 줍니다. 공개 전시나 다른 학교의 재사용을 원하면 범위를 다시 정합니다.',basis:'제17조·제18조·제22조·제22조의2',detail:'교사용 수업안은 학생 이름·얼굴·목소리와 파일 속 작성자 정보를 지우고, 남은 내용으로도 학생을 알아볼 수 없는지 확인한 뒤 공유합니다. 학생 작품의 전시·복제에 필요한 저작권 이용 허락도 별도로 확인합니다.'},
    service:{name:'학사·모바일 운영',kind:'학교 지시를 따르는 처리위탁',flow:'학교 → 운영사 → 승인된 재수탁자',question:'학교가 성적표 보관과 모바일 알림 발송을 맡깁니다.',action:'학교가 맡긴 업무 범위와 접근할 필드를 계약에 적습니다. 처리방침에서 업무·수탁자·재수탁자를 공개하고, 수탁자 교육·감독과 재위탁 시 위탁자 동의를 관리합니다.',basis:'제26조·시행령 제28조',detail:'학교가 자체적으로 학생 정보를 처리할 적법한 근거도 먼저 확인합니다. 운영사는 후원 결제·자사 마케팅·개발 테스트에 학교의 학생 명단을 함께 사용하지 않도록 권한을 분리합니다.'},
    transcript:{name:'해외 대학 Transcript',kind:'제3자 제공과 국외 이전',flow:'한국 학교 → 해외 대학 입학처',question:'대학이 입학 심사를 위해 학생의 성적을 직접 받습니다.',action:'제출 대학과 전송 경로를 특정하고, 국내 제공 근거와 국외 이전 근거를 각각 기록합니다. 법정 학생부인지 학교 자체 성적표인지 확인한 뒤 필요한 과목·학점·기간만 선별합니다.',basis:'제17조·제18조·제28조의8 / 초·중등교육법 제30조의6',detail:'학생 본인이 성적표를 발급받아 제출하는 경로와 학교가 입학처로 직접 송부하는 경로를 구분합니다. 입학처가 학교의 직접 송부를 요구하는지도 확인합니다. 아래 예시는 학교생활기록에 해당하며 상급학교 선발 등 법정 예외가 확인되지 않아 동의를 근거로 택한 경우입니다. 이 예시는 학교의 운영 기준으로 미성년 학생과 보호자 모두에게 두 가지 동의 내용을 나눠 안내합니다.'},
    ai:{name:'AI 분석·개발 요청',kind:'계약과 처리 경로 확인',flow:'학교 → 운영사 → 분석 API 또는 클라우드',question:'학교 양식의 열 이름만 보내도 학기·평가 척도를 분석할 수 있나요?',action:'첫 분석에는 빈 양식·합성 자료·열 이름을 우선 사용합니다. 원문이 필요하면 공급사가 지시 범위에서 처리하는지, 자체 학습·재이용 여부, 처리·보관·로그·지원접속 국가와 삭제 조건을 확인합니다.',basis:'제17조·제23조·제26조·제28조의8',detail:'미확정 항목이 있으면 실제 학생 자료 입력을 보류합니다. 유료 API 또는 학교 자체 계정 여부만으로 분류하지 않습니다. 개선 요청과 GitHub·Claude 개발 세션에는 가상 재현 자료를 쓰고, 시트는 필요한 탭·열만 읽습니다. 이름만 가리는 것으로 자유로운 외부 전송이 허용되지는 않습니다.'},
    sponsor:{name:'후원자 비용·성과 보고',kind:'학생정보 제공 없이 운영',flow:'후원자 → 이용료 결제 / 학교 → 운영 요약',question:'후원자는 어느 학교의 무슨 서비스를 지원했는지 알고 싶습니다.',action:'기본 보고서는 학교명, 지원 기간, 이용 서비스, 학교 단위 운영 성과로 구성합니다. 소규모 학급의 특징·정확한 인원·사진·작품 설명을 조합해 학생을 알아볼 수 있으면 합치거나 생략합니다.',basis:'제17조·제18조·제58조의2',detail:'비용 대납은 학생 명단·성적·상담 기록의 열람 근거가 되지 않습니다. 개인 사례나 선교편지를 제공하려면 수령자·목적·정보·기간과 민감정보 포함 여부를 새로 판단합니다. 후원자의 결제·영수증 정보는 학생 기록과 분리합니다.'},
    exhibit:{name:'홈페이지 공개 전시',kind:'불특정 다수에게 공개',flow:'학교 → 학교 홈페이지 방문자',question:'작품 사진에 학생 얼굴이나 이름표가 보입니다.',action:'교내 열람, 지정 교류학교, 인터넷 공개를 서로 다른 선택으로 둡니다. 홈페이지 게시 동의에는 채널·대상 자료·게시 기간과 거부권을 알리고, 단체 사진은 식별 가능한 사람별로 범위를 확인합니다.',basis:'제15조·제17조·제18조·제22조 / 교육부 사진 공개 FAQ',detail:'미동의 학생의 사진은 제외하거나 식별할 수 없도록 편집합니다. 선택을 거절해도 수업 참여와 평가는 유지합니다. 작품 속 서명·음성·파일 위치 정보와 공개 후 복제 가능성도 점검합니다.'},
    family:{name:'학부모·보호자 열람',kind:'열람 자격과 범위 확인',flow:'학교 → 학생 또는 확인된 보호자 계정',question:'보호자 계정으로 연결된 자녀의 어떤 기록을 볼 수 있나요?',action:'학생 본인의 열람, 법정대리인의 권리 행사, 보호자에게 별도로 제공하는 서비스를 구분합니다. 관계·권한·학생 나이·자료 성격을 확인한 뒤 자녀별로 발행한 자료만 표시합니다.',basis:'제17조·제35조·제38조 / 초·중등교육법 제30조의6 해당 여부',detail:'연락처 등록만으로 학생부 전체 열람을 열지 않습니다. 교사용 상담·건강·제3자 기록은 기본 발행 목록에서 제외하고 보호자 관계나 접근 권한이 바뀌면 연결을 재검토합니다.'}
  };
  const cases=byId('pp-choices'), panel=byId('pp-detail'), example=byId('pp-example');
  const key=new URLSearchParams(location.search).get('case');
  let selected=Object.hasOwn(scenarios,key)?key:'exchange';
  const trial={};
  function caseInfo(){
    const s=scenarios[selected];
    panel.innerHTML='<p class="pp-type">'+s.kind+'</p><h2>'+s.question+'</h2><p class="pp-flow">'+s.flow+'</p><p>'+s.action+'</p><p>'+s.detail+'</p><p class="pp-basis">검토 근거　'+s.basis+'</p>';
  }
  for(const [id,s] of Object.entries(scenarios)){
    const button=document.createElement('button');button.type='button';button.textContent=s.name;button.dataset.case=id;cases.append(button);
  }
  function state(){
    if(!trial[selected])trial[selected]={age:selected==='transcript'?'minor':'child',checks:new Set(),phase:'draft'};
    return trial[selected];
  }
  function requirements(s){
    const overseas=selected==='transcript';
    const people=overseas&&s.age!=='adult'?['student','guardian']:s.age==='child'?['guardian']:['student'];
    const terms=overseas?['share','overseas']:['share'];
    const list=[];
    for(const person of people)for(const type of terms)list.push({id:person+'-'+type,text:(person==='student'?'학생 본인':'법정대리인')+' · '+(type==='share'?'제3자 제공':'국외 이전')+' 동의 확인'});
    if(people.includes('guardian'))list.unshift({id:'identity',text:'법정대리인 자격 및 본인 확인'});
    return list;
  }
  function notice(){
    const abroad=selected==='transcript';
    const lines=abroad?[
      ['제공받는 자','예시 대학 입학처 · 미국 (가상 기관)'],['이용 목적','해당 학생의 입학 지원 심사'],['제공 항목','영문 성명, 재학 기간, 선택한 학기의 과목·성적·학점'],['보유·이용 기간','이 예시 대학은 2027년 8월 31일까지 보유 후 파기한다고 가정합니다.'],['거부권과 영향','동의를 거절할 수 있습니다. 거절하면 이 경로로 성적표를 보내지 않습니다. 다른 제출 방식의 인정 여부는 대학에 확인합니다.']
    ]:[
      ['제공받는 자','가온배움학교 (가상 국내 교류학교)'],['이용 목적','두 학교가 함께하는 수리 수업에서 학생 작품을 열람하고 피드백 제공'],['제공 항목','작품 파일, 학생이 정한 표시 이름. 연락처·성적·사진 제외'],['보유·이용 기간','공동 수업이 끝나는 2026년 12월 31일까지, 이후 공유 종료 및 수령본 삭제'],['거부권과 영향','동의를 거절할 수 있습니다. 작품은 교류학교에 공개되지 않으며 교내 수업과 성적 평가에는 영향이 없습니다.']
    ];
    const extra=abroad?'<h4>국외 이전 안내 · 별도 동의</h4><p>위 성적 항목을 미국의 예시 대학 입학처(admissions@example.invalid)에 학교 승인 직후 1회, 대학의 보안 제출창으로 전송한다고 가정합니다. 이용 목적과 보유 기간은 위 표와 같습니다. 포털에서 거절하거나 학교 담당자에게 전송 전 중단을 요청할 수 있습니다. 거절하면 학교 직접 전송이 중단됩니다.</p>':'<h4>어린이에게 보여줄 말</h4><p>함께 수업하는 다른 학교 선생님이 네 작품을 보고 의견을 줄 수 있어. 보여주고 싶지 않아도 우리 학교 수업에는 그대로 참여할 수 있어.</p>';
    return '<details class="pp-notice"><summary>학생·보호자에게 보여줄 고지문 예시</summary><dl>'+lines.map(([l,v])=>'<div><dt>'+l+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'+extra+'</details>';
  }
  function renderTrial(){
    if(!['exchange','transcript'].includes(selected)){example.innerHTML='';return;}
    const s=state(),req=requirements(s),complete=req.every(x=>s.checks.has(x.id));
    const overseas=selected==='transcript';
    const active=s.phase==='ready';
    const phase={draft:'확인 대기',ready:'모의 검토 완료',refused:'동의 거절 · 제공 보류',withdrawn:'동의 철회 · 후속 제공 중지'}[s.phase];
    example.innerHTML='<h3>동의 절차 미리보기</h3><p class="pp-muted">가상 사례입니다. 서명 수집·학생 정보 저장·외부 발송은 이루어지지 않습니다.</p>'+notice()+
      '<label class="pp-age">사례의 학생 연령<select id="pp-age">'+[['child','만 14세 미만'],['minor','만 14세 이상 미성년'],['adult','성년']].map(([val,text])=>'<option value="'+val+'" '+(s.age===val?'selected':'')+'>'+text+'</option>').join('')+'</select></label>'+
      '<p class="pp-hint">'+(overseas?'법정 학교생활기록의 직접 송부 예시입니다. 제공 동의와 국외 이전 동의를 각각 확인합니다.':'국내 일반 작품 공유 예시입니다. 선택 동의의 주체가 연령에 따라 달라집니다.')+'</p>'+
      '<fieldset><legend>가상의 증빙으로 확인할 항목</legend>'+req.map(x=>'<label><input type="checkbox" data-consent="'+x.id+'" '+(s.checks.has(x.id)?'checked':'')+' '+(active?'disabled':'')+'>'+x.text+'</label>').join('')+'</fieldset>'+
      '<div class="pp-actions">'+(active?'<button type="button" data-action="withdraw">철회 시험</button>':'<button class="pp-primary" type="button" data-action="approve" '+(complete?'':'disabled')+'>모의 검토 완료</button><button type="button" data-action="refuse">거절 시험</button>')+'</div><p class="pp-state" role="status">'+phase+'</p>';
  }
  function render(){
    for(const b of cases.children)b.setAttribute('aria-pressed',String(b.dataset.case===selected));
    caseInfo();renderTrial();
  }
  cases.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selected=b.dataset.case;render();});
  example.addEventListener('change',e=>{
    const s=state();
    if(e.target.id==='pp-age'){s.age=e.target.value;s.checks.clear();s.phase='draft';renderTrial();byId('pp-age').focus();return;}
    if(!e.target.hasAttribute('data-consent'))return;
    if(e.target.checked)s.checks.add(e.target.dataset.consent);else s.checks.delete(e.target.dataset.consent);
    s.phase='draft';const approve=example.querySelector('[data-action="approve"]');
    if(approve)approve.disabled=!requirements(s).every(x=>s.checks.has(x.id));
    example.querySelector('.pp-state').textContent='확인 대기';
  });
  example.addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    const s=state();
    if(action==='approve'&&requirements(s).every(x=>s.checks.has(x.id)))s.phase='ready';
    if(action==='refuse'||action==='withdraw'){s.phase=action==='refuse'?'refused':'withdrawn';s.checks.clear();}
    renderTrial();const msg=example.querySelector('.pp-state');msg.tabIndex=-1;msg.focus({preventScroll:true});
  });
  render();
})();
