(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const panel = byId('typography');
  const schools = {
    rung: {lang:'th', en:'Rung Arun Suksa School', th:'โรงเรียนรุ้งอรุณศึกษา', ko:'룽아룬숙사학교'},
    dreamy: {lang:'ko', en:'Dreamy School', th:'โรงเรียนดรีมี', ko:'드리미학교'}
  };
  const copy = {
    en:{notice:['School news','Student exhibition','Families are invited to the student exhibition. Students will introduce their projects and share what they learned.'],record:['Academic record · Sample','Academic Transcript','Credits are recorded for each course completed during the term.','Project Design · Credits earned']},
    th:{notice:['ข่าวโรงเรียน','นิทรรศการผลงานนักเรียน','ขอเชิญผู้ปกครองเข้าชมนิทรรศการผลงานนักเรียน นักเรียนจะนำเสนอโครงงานและแบ่งปันสิ่งที่ได้เรียนรู้'],record:['ตัวอย่างเอกสารการศึกษา','ระเบียนผลการเรียน','เอกสารนี้แสดงหน่วยกิตของแต่ละรายวิชาที่เรียนจบในภาคเรียนนี้','การออกแบบโครงงาน · หน่วยกิตที่ได้รับ']},
    ko:{notice:['학교 소식','학생 프로젝트 전시회','가족 여러분을 학생 작품 전시회에 초대합니다. 학생들이 직접 프로젝트를 소개하고 배운 점을 나눕니다.'],record:['학사 문서 · 예시','성적증명서','이번 학기에 이수한 과목과 과목별 취득 학점을 기재합니다.','프로젝트 설계 · 취득 학점']}
  };
  const baseline = () => ({pair:'sans',size:17,leading:1.60});
  const storageKey = 'school-platform.type-settings.v13.';
  function read(key) {try{return localStorage.getItem(storageKey+key);}catch{return null;}}
  function write(key,value) {try{localStorage.setItem(storageKey+key,value);return true;}catch{return false;}}
  function saved(key) {
    try {
      const v=JSON.parse(read(key));
      if(v && ['sans','editorial'].includes(v.pair) && Number.isInteger(v.size) && v.size>=14 && v.size<=22 && Number.isFinite(v.leading) && v.leading>=1.45 && v.leading<=1.95) return {pair:v.pair,size:v.size,leading:v.leading};
    }catch{}
    return baseline();
  }
  const drafts=new Map();
  const selected=read('current');
  let school=Object.hasOwn(schools,selected)?selected:'rung';
  let language=schools[school].lang, surface='notice';
  const draft=()=>drafts.get(school);
  const heading=pair=>pair==='editorial'?'var(--editorial)':'var(--ui)';
  function applied(){document.body.style.setProperty('--school-head',heading(saved(school).pair));}
  function update(message) {
    const style=draft();
    byId('ty-school').value=school;
    const sample=copy[language][surface];
    const paper=byId('ty-paper');paper.lang=language;
    byId('ty-school-name').textContent=schools[school][language];
    byId('ty-doc-type').textContent=sample[0];byId('ty-paper-title').textContent=sample[1];byId('ty-paper-body').textContent=sample[2];
    byId('ty-course').textContent=sample[3]||'';byId('ty-record-row').hidden=surface!=='record';
    panel.style.setProperty('--draft-head',heading(style.pair));panel.style.setProperty('--draft-size',style.size+'px');panel.style.setProperty('--draft-line',String(style.leading));
    byId('ty-size').value=style.size;byId('ty-leading').value=style.leading;byId('ty-size-label').textContent=style.size+' px';byId('ty-leading-label').textContent=style.leading.toFixed(2)+'×';
    panel.querySelectorAll('[data-script]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.script===language)));
    panel.querySelectorAll('[data-surface]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===surface)));
    panel.querySelectorAll('input[name="ty-pair"]').forEach(b=>b.checked=b.value===style.pair);
    if(message)byId('ty-status').textContent=message;
  }
  function selectSchool(id) {
    school=id;
    if(!drafts.has(school))drafts.set(school,saved(school));
    language=schools[school].lang;
    write('current',school);applied();
    update(JSON.stringify(draft())===JSON.stringify(saved(school))?'학교별 설정은 이 브라우저에 저장됩니다.':'저장 전 변경 사항이 있습니다.');
  }
  const changed=()=>update('변경 사항을 미리보는 중입니다. 저장하면 학교 기본값이 됩니다.');
  panel.addEventListener('click',event=>{
    const btn=event.target.closest('button');if(!btn)return;
    if(btn.dataset.script){language=btn.dataset.script;update();}
    else if(btn.dataset.surface){surface=btn.dataset.surface;update();}
    else if(btn.id==='ty-save'){
      const ok=write(school,JSON.stringify(draft()));if(ok)applied();
      update(ok?schools[school].ko+' 기본값을 이 브라우저에 저장했습니다.':'브라우저 저장이 차단되어 있습니다. 설정 JSON을 받을 수 있습니다.');
    }else if(btn.id==='ty-reset'){drafts.set(school,baseline());update('기본 조합으로 복원했습니다. 적용하려면 저장하세요.');}
    else if(btn.id==='ty-export'){
      const v=draft();
      const spec={schemaVersion:1,school,profile:v.pair,roles:{interface:{family:'Noto Sans',weight:400},title:{family:v.pair==='editorial'?'Noto Serif':'Noto Sans',weight:700},body:{family:'Noto Sans',weight:400,sizePx:v.size,lineHeight:v.leading}},scripts:{en:'Latin',th:'Thai',ko:'CJK KR'},thaiBodyLineHeight:Number((v.leading+.15).toFixed(2))};
      const url=URL.createObjectURL(new Blob([JSON.stringify(spec,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=school+'-typography-v13.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
      update('현재 미리보기 설정을 JSON으로 내보냈습니다.');
    }
  });
  byId('ty-school').addEventListener('change',e=>selectSchool(e.target.value));
  byId('ty-choices').addEventListener('change',e=>{draft().pair=e.target.value;changed();});
  byId('ty-size').addEventListener('input',e=>{draft().size=Number(e.target.value);changed();});
  byId('ty-leading').addEventListener('input',e=>{draft().leading=Number(e.target.value);changed();});
  let activeFont=null, generation=0;
  byId('ty-file').addEventListener('change',async event=>{
    const thisLoad=++generation;
    const input=event.target,file=input.files[0];if(!file)return;
    const status=byId('ty-file-status');
    try {
      if(file.size>24*1024*1024)throw new Error();
      const name='SchoolComparison'+thisLoad;
      const face=new FontFace(name,await file.arrayBuffer());await face.load();
      if(thisLoad!==generation)return;
      document.fonts.add(face);byId('ty-custom').style.fontFamily=name+', var(--ui)';
      if(activeFont)document.fonts.delete(activeFont);activeFont=face;
      status.textContent=file.name+' 적용됨 · 포함되지 않은 글자는 기본 서체로 표시합니다.';
    }catch{
      if(thisLoad!==generation)return;
      input.value='';
      status.textContent='파일을 읽지 못했습니다. 24MB 이하의 TTF, OTF, WOFF 또는 WOFF2 파일을 선택하세요.';
    }
  });
  selectSchool(school);
})();
