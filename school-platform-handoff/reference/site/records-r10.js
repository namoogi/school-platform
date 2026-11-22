'use strict';
(() => {
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const models = {
    local: {title:'학기 학습 보고서', questions:[
      {label:'수업마다 다른 평가 척도를 어떻게 표시할까요?', refs:[['평가계획 · 2쪽','생태 탐구는 원점수, 수리 공방은 4단계 루브릭으로 기록한다.'],['성적 집계표 · B2:C3','생태 탐구 88/100 · 수리 공방 발전 단계']], options:['과목별 원척도 표시','서술 기록만 표시']},
      {label:'올해 성적표에 어떤 학기 명칭을 쓸까요?', refs:[['올해 학사력 · 1쪽','Term A / Term B'],['작년 보고서 · 표지','봄학기 / 가을학기']], options:['Term A / Term B','봄학기 / 가을학기']}
    ]},
    kr: {title:'학교생활기록부 검토본', questions:[
      {label:'어느 학교급의 2026학년도 기재요령을 대조할까요?', refs:[['학적 현황 · 예시 2행','학교급 중학교 · 학년 2'],['교육부 기재요령','2026학년도 자료는 초·중·고로 구분되어 있습니다.']], options:['중학교','초등학교','고등학교']},
      {label:'이번 검토본에 어느 영역을 펼칠까요?', refs:[['교과 관찰지 · 4행','토양 온도의 차이를 관찰하고 측정 과정을 설명함.'],['출결 집계 · 2행','수업일수 94일 · 결석일수 1일']], options:['교과 기록과 출결','교과 기록만','출결만']}
    ]},
    en: {title:'Academic Transcript', questions:[
      {label:'어느 학기까지 포함할까요?', refs:[['Term reports · register','2025–26 / Term 1 and Term 2 / final grades on file.']], options:['Term 1 + Term 2','Term 1 only','Term 2 only']},
      {label:'전적교에서 이수한 과목을 포함할까요?', refs:[['Transfer record · row 2','Riverside School · 2024–25 / Term 2 · Visual Arts · B+ · 0.5 credit.']], options:['원 학교와 원성적 포함','재학 중 이수 과목만']}
    ]}
  };
  const defaultRubric = '시작 단계, 발전 단계, 독립 수행, 심화 적용';
  const context = Object.fromEntries(Object.entries(models).map(([key,m]) => [key,{
    title:m.title, answers:[0,0], checked:[false,false], note:true, saved:0, attached:null,rubric:defaultRubric,grade:2
  }]));
  const originals = {local:['평가계획 · 2쪽','성적 집계표 · B2:C3','올해 학사력 · 1쪽','작년 보고서 · 표지'],kr:['학적 현황 · 2행','교과 관찰지 · 4행','출결 집계 · 2행'],en:['Term reports · register','Transfer record · row 2']};
  const storageKey = 'school-record-templates-round10-v1';
  let history = [];
  try { const value=JSON.parse(localStorage.getItem(storageKey)||'[]'); if(Array.isArray(value))history=value.filter(s=>s && Object.hasOwn(models,s.doc) && typeof s.title==='string' && Array.isArray(s.answers) && models[s.doc].questions.every((q,i)=>Number.isInteger(s.answers[i]) && q.options[s.answers[i]])); } catch {}
  const params=new URLSearchParams(location.search);
  let doc=Object.hasOwn(models,params.get('doc'))?params.get('doc'):'local';
  let step=['evidence','review','template'].includes(params.get('step'))?params.get('step'):'review', uploadId = 0, sheetNumber = 0, activeSource = 0;
  const uploads = [];
  const current = () => context[doc];
  const status = text => { el('record-status').textContent = text; };
  const table = (head, rows) => '<table><thead><tr>'+head.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  function renderPaper() {
    const s=current(), a=s.answers;
    let label, meta, body, note, cols, rows;
    if(doc==='local'){
      label='해솔배움학교'; meta='2026학년도　/　'+(a[1]===0?'Term A':'봄학기')+'　/　예시 학생';
      cols=a[0]===0?['수업','원척도 기록','교사 관찰']:['수업','교사 관찰'];
      rows=[['생태 탐구','88 / 100','측정값의 차이를 표로 설명함.'],['수리 공방','발전 단계','수리 후 동작을 재확인함.']];
      if(a[0]===1)rows=rows.map(r=>[r[0],r[2]]);
      body='<h3>수업별 학습 기록</h3>'+table(cols,rows);
      note='원점수와 성취 단계는 각 수업에서 사용한 표현을 따릅니다.';
      if(a[0]===0 && s.rubric.trim()){
        const levels=s.rubric.split(/[,，]/).map(v=>v.trim()).filter(Boolean);
        body+='<p class="rubric-line"><strong>수리 공방 · 척도 범례</strong> '+esc(levels.join(' / '))+'</p>';
        if(!levels.includes('발전 단계'))body+='<p class="issuer">원자료의 ‘발전 단계’가 이 범례에 없습니다. 수업 담당자 대조 필요.</p>';
      }
    } else if(doc==='kr'){
      label='교무부 내부 검토'; meta='2026학년도　/　'+['중학교','초등학교','고등학교'][a[0]]+' '+s.grade+'학년　/　예시 학생';
      body=(a[1]!==2?'<h3>교과학습발달상황 · 발췌</h3>'+table(['교과','관찰 기록'],[['과학','토양 온도의 차이를 관찰하고 측정 과정을 설명함.']]):'')+(a[1]!==1?'<h3>출결상황 · 발췌</h3>'+table(['수업일수','결석일수'],[['94일','1일']]):'');
      note='학교급과 학년도에 맞는 기재요령 및 학교 원자료를 대조할 때 쓰는 일부 항목 예시입니다.';
    } else {
      label='Haesol Learning School'; meta='Student A　/　Academic year 2025–26';
      const termRows=[['Term 1','Environmental Inquiry','88 / 100','0.5'],['Term 2','Design Studio','Proficient','0.5']];
      rows=a[0]===0?termRows:[termRows[a[0]-1]];
      body='<h3>Courses completed</h3>'+table(['Term','Course','Grade','Credit'],rows);
      if(a[1]===0)body+='<h3>Transfer coursework</h3><p class="issuer">Riverside School · 2024–25</p>'+table(['Term','Course','Grade','Credit'],[['Term 2','Visual Arts','B+','0.5']]);
      note='Grades use the original school scales. A cumulative GPA was not reported by the school.';
    }
    if(s.attached){const upload=s.attached;body+='<h3>'+(doc==='en'?'Source excerpt':'첨부 자료 발췌')+'</h3><p class="issuer">'+esc(upload.file)+' · '+(doc==='en'?'first data row':'첫 자료 행')+'</p>'+table(upload.head, [upload.row]);}
    const en=doc==='en';
    el('paper').lang=en?'en':'ko';
    el('paper').innerHTML='<div class="sheet-brand"><span class="seal" aria-hidden="true">H</span><strong>'+label+'</strong></div><h2>'+esc(s.title||models[doc].title)+'</h2><p class="paper-meta">'+meta+'</p>'+body+(s.note?'<p class="paper-note">'+note+'</p>':'')+'<footer><span>'+(en?'Sample · For review':'비식별 예시 · 검토용')+'</span><span>1 / 1</span></footer>';
    el('preview-mark').textContent=s.saved?'양식 v'+s.saved+' · 저장됨':'편집 초안';
    el('confirmed-count').textContent=s.checked.filter(Boolean).length+' / 2 기준 확인';
  }
  function renderQuestions(){
    const s=current();
    el('review-pane').innerHTML='<p class="instruction">예시 자료에서 추정한 기준입니다. 근거를 대조한 뒤 학교의 결정을 확인해 주세요.</p>'+models[doc].questions.map((q,i)=>
      '<fieldset class="question"><legend>'+q.label+'</legend><details class="source-proof"><summary>추정 근거 · '+q.refs.length+'건</summary>'+q.refs.map(([ref,quote])=>'<p><strong>'+esc(ref)+'</strong><span>'+esc(quote)+'</span></p>').join('')+'</details>'+
      q.options.map((o,j)=>'<label class="radio-row"><input type="radio" name="rule-'+i+'" data-rule="'+i+'" value="'+j+'" '+(s.answers[i]===j?'checked':'')+'>'+esc(o)+'</label>').join('')+
      '<button class="confirm" type="button" data-confirm="'+i+'" '+(s.checked[i]?'disabled':'')+'>'+(s.checked[i]?'✓ 기준 확인됨':'이 기준 확인')+'</button></fieldset>').join('')+
      '<button type="button" class="solid" data-next="template">출력 설정으로</button>';
  }
  function renderTemplate(){
    const s=current();
    const gradeField=doc==='kr'?'<label class="input-field">해당 학년<select id="kr-grade">'+Array.from({length:s.answers[0]===1?6:3},(_,i)=>'<option value="'+(i+1)+'" '+(s.grade===i+1?'selected':'')+'>'+(i+1)+'학년</option>').join('')+'</select></label><p class="quiet"><a href="https://star.moe.go.kr/web/contents/m21100.do" target="_blank" rel="noopener">교육부 · 해당 학교급 기재요령 열기</a></p>':'';
    const rubricField=doc==='local'?'<label class="input-field">수리 공방 · 학교 고유 척도<input id="rubric-labels" type="text" maxlength="130" value="'+esc(s.rubric)+'"></label><p class="quiet">학교가 쓰는 단계명을 낮은 단계부터 쉼표로 구분하세요. 범례를 바꿔도 학생의 원기록은 유지합니다.</p>':'';
    el('template-pane').innerHTML='<h3>출력할 양식</h3><label class="input-field">문서 제목<input type="text" id="record-title-input" maxlength="65" value="'+esc(s.title)+'"></label>'+gradeField+rubricField+'<label class="radio-row"><input type="checkbox" id="print-note" '+(s.note?'checked':'')+'>평가·검토 안내문 포함</label><p class="quiet">'+(doc==='en'?'학교 원척도와 학점을 유지합니다. 공식 제출 전에는 원본과 제출처의 요건을 확인하세요.':doc==='kr'?'나이스 기재 전 사용하는 내부 검토 예시입니다. 공식 전송과 학생부 발급에는 연결하지 않았습니다.':'선택한 학기 명칭과 수업별 평가 기준을 미리보기에서 확인하세요.')+'</p><button class="solid" type="button" id="save-record" '+(s.checked.every(Boolean)&&s.title.trim()?'':'disabled')+'>양식 버전 저장</button><p class="quiet">'+(s.checked.every(Boolean)?'제목과 확정한 기준을 이 브라우저에 저장합니다. 첨부 자료는 저장에서 제외합니다.':'기준 두 가지를 확인하면 양식 버전을 저장할 수 있습니다.')+'</p><button class="plain" type="button" data-next="review">기준 다시 보기</button>';
  }
  function renderHistory(){
    const own=history.map((s,i)=>({s,i})).filter(({s})=>s.doc===doc).reverse();
    el('record-history').innerHTML=own.length?own.map(({s,i})=>'<div class="history-row"><span><strong>v'+esc(s.version)+' · '+esc(s.title)+'</strong><small>'+esc(new Date(s.date).toLocaleString('ko-KR'))+'</small></span><button class="plain" type="button" data-restore="'+i+'">양식 열기</button></div>').join(''):'<p class="quiet">이 문서 유형에 저장된 버전이 없습니다.</p>';
  }
  function showStep(next){
    step=next;
    for(const key of ['evidence','review','template'])el(key+'-pane').hidden=step!==key;
    document.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-pressed',String(step===b.dataset.step)));
  }
  function renderSources(){
    el('record-sources').innerHTML=originals[doc].map(s=>'<li>'+esc(s)+' <small>예시 근거</small></li>').join('')+
      uploads.map(u=>'<li>'+esc(u.label)+' <small>'+esc(u.info)+'</small></li>').join('');
    const parsed=uploads.filter(u=>u.head);
    if(!parsed.length){el('mapping-area').innerHTML='';return;}
    const u=parsed.find(u=>u.id===activeSource)||parsed[0];
    const guess = r => u.head.findIndex(v=>r.test(v));
    function select(kind,caption,re){
      const suggested=guess(re);
      return '<label class="input-field">'+caption+'<select data-map="'+kind+'"><option value="">열 선택</option>'+u.head.map((v,i)=>'<option value="'+i+'" '+(i===suggested?'selected':'')+'>'+esc(v||'빈 열')+'</option>').join('')+'</select></label>';
    }
    el('mapping-area').innerHTML='<div class="map-box"><h3>첨부 열 연결</h3><label class="input-field">자료<select id="selected-upload">'+parsed.map(p=>'<option value="'+p.id+'" '+(p===u?'selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label></div>';
    const box=el('mapping-area').firstElementChild;
    box.insertAdjacentHTML('beforeend',select('course','수업명',/수업|과목|course|subject/i)+select('grade','평가 기록',/성적|점수|성취|평가|grade|score|mark|level/i)+'<p class="quiet">열 이름을 보고 제안한 연결입니다. 첫 행을 확인하고 문서에 반영하세요.</p><p id="row-result"></p><button class="plain" id="apply-map" type="button">이 문서에 첫 행 반영</button>');
    updateMappedRow();
  }
  function mappedRow(){
    const picker=el('selected-upload');if(!picker)return null;
    const u=uploads.find(item=>item.id===Number(picker.value));
    const indexes=Array.from(document.querySelectorAll('[data-map]')).map(s=>s.value===''?-1:Number(s.value));
    if(indexes.some(i=>i<0)||indexes[0]===indexes[1])return null;
    return {file:u.label,head:indexes.map(i=>u.head[i]),row:indexes.map(i=>u.row[i]||'')};
  }
  function updateMappedRow(){
    const mapped=mappedRow();
    el('row-result').textContent=mapped?mapped.row.join('　/　'):'수업명과 평가 기록에 서로 다른 열을 선택하세요.';
    el('apply-map').disabled=!mapped;
  }
  function refresh(){
    document.querySelectorAll('[data-doc]').forEach(b=>b.setAttribute('aria-pressed',String(doc===b.dataset.doc)));
    renderQuestions();renderTemplate();renderPaper();renderHistory();renderSources();showStep(step);
  }
  function addSheet(){
    const line=document.createElement('label');
    sheetNumber++; line.className='input-field';line.textContent='시트 주소 '+sheetNumber;
    const input=document.createElement('input');input.type='url';input.placeholder='https://…';line.append(input);el('sheet-inputs').append(line);return input;
  }
  function readRows(text, sep){
    const rows=[];let row=[],field='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"' && (quoted||field==='')){
        if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
      }else if(c===sep && !quoted){row.push(field);field='';}
      else if((c==='\n'||c==='\r')&&!quoted){
        if(c==='\r'&&text[i+1]==='\n')i++;
        row.push(field);if(row.some(v=>v.trim()))rows.push(row);
        row=[];field='';if(rows.length===2)return rows;
      }else field+=c;
    }
    if(!quoted){row.push(field);if(row.some(v=>v.trim()))rows.push(row);}
    return rows;
  }
  async function addFiles(files){
    for(const f of files){
      const item={id:++uploadId,label:f.name,info:'원문 분석 연동 대기'};uploads.push(item);
      if(/\.(csv|tsv)$/i.test(f.name)){
        try {
          const rows=readRows(await f.slice(0,128*1024).text(),/\.tsv$/i.test(f.name)?'\t':',');
          if(rows.length===2&&rows[0].length>1){item.head=rows[0];item.row=rows[1];item.info='열 연결 가능';activeSource=item.id;}
          else item.info='열 제목과 자료 행 확인 필요';
        }catch{item.info='파일을 읽을 수 없음';}
      }
    }
    renderSources();status(files.length+'개 파일을 추가했습니다.');el('record-files').value='';
  }
  const drop=el('record-drop');
  for(const type of ['dragover','dragleave','drop'])drop.addEventListener(type,e=>{
    e.preventDefault();drop.classList.toggle('over',type==='dragover');if(type==='drop')void addFiles(Array.from(e.dataTransfer.files));
  });
  el('record-files').addEventListener('change',e=>void addFiles(Array.from(e.target.files)));
  el('records').addEventListener('change',event=>{
    const t=event.target,s=current();
    if(t.hasAttribute('data-rule')){
      const index=Number(t.dataset.rule);s.answers[index]=Number(t.value);if(doc==='kr'&&index===0&&s.answers[0]!==1&&s.grade>3)s.grade=1;s.checked[index]=false;s.saved=0;
      const button=el('review-pane').querySelector('[data-confirm="'+index+'"]');button.disabled=false;button.textContent='이 기준 확인';renderTemplate();renderPaper();status('수정한 기준을 미리보기에 반영했습니다.');
    } else if(t.id==='kr-grade'){s.grade=Number(t.value);s.saved=0;renderPaper();}
    else if(t.id==='print-note'){s.note=t.checked;s.saved=0;renderPaper();}
    else if(t.id==='selected-upload'){activeSource=Number(t.value);renderSources();}
    else if(t.hasAttribute('data-map'))updateMappedRow();
  });
  el('records').addEventListener('input',event=>{
    if(event.target.id==='rubric-labels'){
      const s=current();s.rubric=event.target.value;s.checked[0]=false;s.saved=0;
      renderQuestions();renderPaper();el('save-record').disabled=true;
      el('save-record').nextElementSibling.textContent='수업별 평가 기준을 다시 확인하면 저장할 수 있습니다.';
      return;
    }
    if(event.target.id!=='record-title-input')return;
    const s=current();s.title=event.target.value;s.saved=0;renderPaper();el('save-record').disabled=!s.checked.every(Boolean)||!s.title.trim();
  });
  el('records').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    const s=current();
    if(b.dataset.doc){doc=b.dataset.doc;step='review';status('');refresh();}
    else if(b.dataset.step||b.dataset.next)showStep(b.dataset.step||b.dataset.next);
    else if(b.hasAttribute('data-confirm')){
      s.checked[Number(b.dataset.confirm)]=true;b.disabled=true;b.textContent='✓ 기준 확인됨';renderPaper();renderTemplate();status(s.checked.every(Boolean)?'두 기준을 모두 확인했습니다. 출력 설정에서 양식을 저장할 수 있습니다.':'선택한 기준을 확인했습니다.');
    }else if(b.id==='save-record'&&s.checked.every(Boolean)&&s.title.trim()){
      const version=Math.max(0,...history.filter(h=>h.doc===doc).map(h=>h.version))+1;
      const next=[...history,{doc,version,title:s.title,answers:[...s.answers],note:s.note,rubric:s.rubric,grade:s.grade,date:new Date().toISOString()}];
      try{localStorage.setItem(storageKey,JSON.stringify(next));history=next;s.saved=version;renderPaper();renderHistory();status('현재 양식을 v'+version+'으로 저장했습니다.');}
      catch{status('이 브라우저에서 저장하지 못했습니다. 저장 권한을 확인하세요.');}
    }else if(b.hasAttribute('data-restore')){
      const h=history[Number(b.dataset.restore)];Object.assign(s,{title:h.title,answers:[...h.answers],checked:[true,true],note:h.note,rubric:h.rubric??defaultRubric,grade:h.grade||2,saved:h.version,attached:null});step='template';refresh();status('v'+h.version+' 양식을 열었습니다.');
    }else if(b.id==='add-sheet'){addSheet().focus();}
    else if(b.id==='save-sheets'){
      const fields=Array.from(el('sheet-inputs').querySelectorAll('input')).filter(i=>i.value.trim());
      if(!fields.length){status('등록할 주소를 입력하세요.');return;}
      let valid=true;
      for(const input of fields){
        try{const url=new URL(input.value.trim());if(!['https:','http:'].includes(url.protocol))throw Error();}
        catch{input.setCustomValidity('http 또는 https 주소를 입력하세요.');input.reportValidity();input.setCustomValidity('');valid=false;break;}
      }
      if(!valid)return;
      for(const input of fields){const value=input.value.trim();if(!uploads.some(u=>u.url===value))uploads.push({id:++uploadId,url:value,label:value,info:'시트 주소 · 원문 분석 연동 대기'});input.parentElement.remove();}
      if(!el('sheet-inputs').childElementCount)addSheet();renderSources();status('입력한 시트 주소를 등록했습니다.');
    }else if(b.id==='apply-map'){const value=mappedRow();if(value){s.attached=value;s.saved=0;renderPaper();status('첨부 자료 첫 행을 검토용 문서에 반영했습니다.');}}
    else if(b.id==='print-paper')window.print();
  });
  const menu=document.querySelector('.switcher');
  document.addEventListener('click',e=>{if(menu.open&&(!menu.contains(e.target)||e.target.closest('a')))menu.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
  const scheduling = el('schedule-choice');
  function showSchedule(){
    const conflict=scheduling.value==='same';
    el('schedule-result').textContent=conflict?'겹침 · 두 수업이 같은 시간에 공방을 사용합니다.':'배치 가능 · 생태 탐구는 탐구실, 수리 공방은 공방을 사용합니다.';
    el('schedule-room').textContent=conflict?'공방':'탐구실';
  }
  scheduling.addEventListener('change',showSchedule);
  showSchedule();addSheet();refresh();
})();
