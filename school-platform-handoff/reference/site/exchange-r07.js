"use strict";
const lessons = [
  {id:"care", title:"우리 학교에서 발견한 배려", school:"룽아룬숙사", kind:"그림책", tone:"gold", plan:"배려가 드러나는 장면을 관찰하고, 네 컷 그림책으로 다시 표현한 뒤 상대 학교에 질문을 보냅니다.", steps:"학교에서 배려 장면 찾기 → 네 컷 콘티 만들기 → 그림책 공유 → 받은 질문으로 한 장면 수정", grade:"초등 · 3차시"},
  {id:"garden", title:"두 학교의 정원 관찰 일지", school:"드리미", kind:"탐구", tone:"blue", plan:"같은 질문으로 각자 학교 정원을 관찰하고, 서로의 기록을 비교해 관찰 방법을 보완합니다.", steps:"공통 관찰 질문 정하기 → 사진과 기록 모으기 → 다른 학교 기록 비교 → 공동 관찰 지도 만들기", grade:"초등 고학년–중등 · 4차시"},
  {id:"repair", title:"교실의 물건을 다시 쓰는 법", school:"드리미", kind:"제작", tone:"lilac", plan:"고장 나거나 쓰임이 줄어든 교실 물건을 살펴보고, 다시 쓰는 방법을 안내 카드로 정리합니다.", steps:"고칠 물건 고르기 → 원인 조사 → 교사와 제작·검토 → 다른 학교가 써볼 수 있는 안내 만들기", grade:"중등 · 4차시"}
];
const samples = [
  {title:"그림책을 함께 고친 날", school:"룽아룬숙사", type:"그림책", tone:"gold", scope:"public", ko:"찢어진 책을 같이 고치면서 다음에 읽을 친구를 생각했습니다.", foreign:"พวกเราช่วยกันซ่อมหนังสือที่ขาด และคิดถึงเพื่อนที่จะอ่านต่อ", en:"We repaired a torn book together and thought about the next reader."},
  {title:"다음 친구를 위한 공구함", school:"드리미", type:"프로젝트", tone:"blue", scope:"public", ko:"다음 사람이 쉽게 찾을 수 있게 공구함에 위치 표시를 붙였습니다.", foreign:"다음 사람이 쉽게 찾을 수 있게 공구함에 위치 표시를 붙였습니다.", en:"We labeled the toolbox so the next person could find each tool."},
  {title:"서로에게 보내는 첫 질문", school:"룽아룬숙사", type:"학급 질문", tone:"lilac", scope:"partners", ko:"여러분의 교실에서는 친구가 힘들 때 어떻게 도와주나요?", foreign:"ในห้องเรียนของคุณ เพื่อน ๆ ช่วยกันอย่างไรเมื่อมีใครลำบาก?", en:"How do you help a classmate who is having a hard time?"}
];
const ideas = [
  ["시범", "수업안 복제와 출처 연결", "원안을 보존하고 학년·차시·언어를 바꾼 수업안을 저장합니다. 원안 작성자는 누가 어떻게 적용했는지 볼 수 있습니다."],
  ["시범", "적용 후기와 결과물", "교사가 실제 소요 시간, 바꾼 부분, 다음 교사에게 전할 팁을 원안에 돌려줍니다. 공유할 작품은 승인 범위를 따릅니다."],
  ["시범", "학교 간 공동수업", "두 교사가 한 질문, 일정, 결과물 형식을 합의하고 학급 단위로 질문과 결과물을 교환합니다."],
  ["시범", "공동 전시", "각 학교에서 승인한 작품을 한 전시에 모으고 양교 홈페이지에서 같은 주소를 연결합니다."],
  ["다음", "공개 수업안 검색과 요청", "학교급·주제·차시·언어로 찾고, 필요한 수업을 요청하면 다른 학교가 기존 수업안을 제안합니다."],
  ["다음", "번역·현지화 기여", "태국어·한국어 원문과 영어판을 연결하고 현지 교사가 번역과 적용 팁을 검토합니다."],
  ["다음", "후원으로 공개 수업 제작", "교회나 기업이 새 수업안 제작과 번역을 비용으로 지원하고, 합의한 범위에서 여러 학교가 함께 씁니다."],
  ["검증 후", "유료 자료·연수", "수업안과 활동지, 연수, 적용 지원을 유료로 제공하는 선택지입니다. 결제 전에는 저작권·사용 범위·정산 조건을 검증합니다."]
];
const defaultState = {copies:[], works:[], questions:[], projects:[], brief:"", activeLesson:""};
const key = "school-platform-exchange-r07";
function readState() {
  try { return {...defaultState,...JSON.parse(localStorage.getItem(key) || "{}")}; }
  catch { return {...defaultState}; }
}
let state = readState();
let preview = "public";
let selected = "";
const screen = document.querySelector("#screen");
const feedback = document.querySelector("#feedback");
const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function save(next, message) {
  try {localStorage.setItem(key,JSON.stringify(next));}
  catch {feedback.textContent="이 브라우저에서 저장할 수 없습니다.";return false;}
  state = next;
  render();
  feedback.textContent = message;
  return true;
}
function hero(kicker,title,body,note,sub) {
  return `<div class="hero"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2><p>${body}</p></div><div class="hero-note">${note}<span>${sub}</span></div></div>`;
}
function lessonCards(query="",category="") {
  const list=lessons.filter(item => (!category || item.kind===category) && [item.title,item.school,item.grade,item.plan].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return list.map(item => `<article class="card work-card"><div class="tile-head ${item.tone}"><h3>${item.title}</h3></div><small class="muted">${item.school} · ${item.grade}</small><p>${item.plan}</p><div class="row-actions"><button class="secondary" type="button" data-lesson="${item.id}">수업안 보기</button></div></article>`).join("") || '<p class="muted">검색 조건에 맞는 수업안이 없습니다.</p>';
}
function lessonView() {
  const card=lessons.find(item=>item.id===selected);
  return hero("교사 자료실","우리 학교에 맞는 수업을 찾으세요.","수업안을 복제해 편집하고, 적용하면서 발견한 팁을 원안 교사에게 돌려줍니다.","기본 방식","무료 공유 · 원안 출처 표시") +
  `<div class="toolbar"><label>수업 검색<input type="search" id="search" placeholder="주제, 학교, 대상 학년"></label><label>수업 유형<select id="category"><option value="">전체 유형</option><option>그림책</option><option>탐구</option><option>제작</option></select></label></div>
  <div id="lessons-list" class="tiles">${lessonCards()}</div>
  ${card ? `<article class="card block-gap" id="lesson-detail" tabindex="-1"><h2>${card.title}</h2><p class="muted">원안 · ${card.school}</p><p>${card.steps}</p><form class="fields" data-form="copy"><input type="hidden" name="id" value="${card.id}"><label>우리 학급 수업명<input type="text" name="title" required maxlength="100" value="${card.title}"></label><label>바꿀 수업 내용<textarea name="note" maxlength="1500" placeholder="학년·차시·활동을 조정해 보세요."></textarea></label><div><button class="primary">내 수업안으로 저장</button></div></form></article>` : ""}
  <article class="card block-gap"><h2>내 수업안과 적용 후기</h2>${state.copies.length ? state.copies.map((copy,i)=>`<div class="item"><strong>${esc(copy.title)}</strong><p class="muted">원안 · ${esc(lessons.find(item=>item.id===copy.id)?.title || "")}</p><p>${esc(copy.note)}</p><form class="fields" data-form="review"><input type="hidden" name="index" value="${i}"><label>원안에 돌려줄 적용 후기<textarea name="review" required maxlength="1200" placeholder="실제 소요 시간, 바꾼 내용, 다음 교사에게 전할 팁">${esc(copy.review || "")}</textarea></label><label>연결할 공개 작품<select name="work"><option value="">선택 안 함</option>${[...samples,...state.works].filter(work=>work.scope==="public").map(work=>`<option ${copy.work===work.title?"selected":""}>${esc(work.title)}</option>`).join("")}</select></label><div><button class="secondary">후기 저장</button></div></form></div>`).join("") : '<p class="muted">자료실에서 수업안을 골라 저장해 보세요.</p>'}</article>`;
}
function projectsView() {
  return hero("교사 워크스페이스","공동수업을 엽니다.","각 학급이 자기 수업 시간에 활동하고, 교사가 승인한 질문과 결과물을 함께 봅니다.","참여 학교","드리미 × 룽아룬숙사") +
  `<div class="grid"><div class="stack"><article class="card"><h2>우리 학교에서 발견한 배려</h2><ol><li><strong>관찰</strong> · 학교에서 발견한 배려의 장면을 찾습니다.</li><li><strong>제작</strong> · 그림책, 사진, 짧은 이야기로 표현합니다.</li><li><strong>교환</strong> · 상대 학교 작품에 질문하고 답을 받습니다.</li><li><strong>공개</strong> · 승인한 작품을 공동 전시에 보냅니다.</li></ol><a class="secondary" href="#gallery">공동 전시 보기</a></article>
  <article class="card"><h2>학급 질문</h2>${state.questions.map(q=>`<p class="item">${esc(q)}</p>`).join("")||'<p class="muted">저장된 질문이 없습니다.</p>'}<form class="fields" data-form="question"><label>상대 학교에 보낼 질문<input type="text" required name="question" maxlength="240"></label><div><button class="primary">질문 저장</button></div></form></article></div>
  <article class="card"><h2>새 공동수업 초안</h2><form class="fields" data-form="project"><label>수업 이름<input name="title" type="text" required maxlength="100"></label><label>참여 학교 또는 학급<input name="partner" type="text" required maxlength="120"></label><label>함께 탐구할 질문<textarea name="prompt" required maxlength="500"></textarea></label><div><button class="primary">초안 저장</button></div></form>${state.projects.map(p=>`<div class="item"><strong>${esc(p.title)}</strong><p>${esc(p.partner)}</p><p>${esc(p.prompt)}</p></div>`).join("")}</article></div>`;
}
function worksView() {
  const actual=[...samples,...state.works].filter(w=>preview==="partners"||w.scope==="public");
  return hero("드리미 × 룽아룬숙사","우리 학교에서 발견한 배려","같은 질문에 각자의 그림책과 프로젝트로 답했습니다.","공동 전시","두 학교 홈페이지에서 연결") +
  `<div class="toolbar"><label>열람 화면 미리보기<select id="preview"><option value="public" ${preview==="public"?"selected":""}>홈페이지 방문자</option><option value="partners" ${preview==="partners"?"selected":""}>교류 참여 학교</option></select></label></div>
  <div class="tiles">${actual.map(w=>`<article class="card work-card"><div class="tile-head ${w.tone}"><h3>${esc(w.title)}</h3></div><small class="muted">${esc(w.school)} · ${esc(w.type)} · ${w.scope==="public"?"공개":"참여 학교"}</small><p>${esc(w.ko)}</p>${w.en||w.foreign?`<details class="review"><summary>원문과 영어 설명</summary><p lang="${w.school==="룽아룬숙사"?"th":"ko"}">${esc(w.foreign)}</p><p lang="en">${esc(w.en)}</p></details>`:""}</article>`).join("")}</div>
  <article class="card block-gap"><h2>교사 출품 미리보기</h2><p class="muted">예시 제목과 설명만 넣어 공개 범위를 확인해 보세요.</p>
  <form class="fields" data-form="work"><div class="toolbar"><label>학교<select name="school"><option>드리미</option><option>룽아룬숙사</option></select></label><label>공개 범위<select name="scope"><option value="partners">참여 학교에만</option><option value="public">홈페이지 공개</option></select></label></div>
  <label>작품 제목<input name="title" type="text" required maxlength="100"></label><label>작품 설명<textarea name="ko" required maxlength="800"></textarea></label><label>영어 설명<textarea name="en" maxlength="800"></textarea></label><div id="public-review" hidden><label><span><input name="reviewed" type="checkbox"> 공개할 이름·얼굴·작품 사용 범위를 확인했습니다.</span></label></div><div><button class="primary">출품 저장</button></div></form></article>`;
}
function ideasView() {
  return hero("7차 구현 후보","한 교사의 수업이 다음 학교의 출발점이 됩니다.","먼저 수업 공유가 실제로 반복되는지 확인하고, 후원형·유료형을 운영 방식으로 비교합니다.","시범 우선","공유 → 적용 → 환류") +
  `<div class="tiles ideas">${ideas.map(([step,title,note])=>`<article class="card"><span class="badge">${step}</span><h3>${title}</h3><p>${note}</p></article>`).join("")}</div>
  <article class="card block-gap"><h2>설계 검토와 Claude CLI 인계</h2><p>기본 설계, 구현 순서, 권한 기준과 검증 조건을 넘기고, 이 브라우저에 남긴 검토 메모도 함께 내보낼 수 있습니다.</p><form class="fields" data-form="brief"><label>이번 차시 검토 메모<textarea name="brief" maxlength="3500" placeholder="남길 질문이나 구현 요청">${esc(state.brief)}</textarea></label><div class="row-actions"><button class="primary">검토 메모 저장</button><button class="secondary" type="button" data-export>검토 메모 내보내기</button><a class="secondary" href="school-exchange-design-r07.md" download>구현 브리프 받기</a></div></form></article>`;
}
const pages = {lessons:lessonView,projects:projectsView,gallery:worksView,ideas:ideasView};
function render() {
  const hash=location.hash.slice(1);
  const page=Object.hasOwn(pages,hash)?hash:"lessons";
  document.querySelectorAll(".exchange-nav a").forEach(link=> {
    if(link.hash==="#"+page)link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  });
  screen.innerHTML=pages[page]();
}
screen.addEventListener("click",event=>{
  const lesson=event.target.closest("[data-lesson]");
  if(lesson){selected=lesson.dataset.lesson;render();document.querySelector("#lesson-detail")?.focus();}
  if(event.target.closest("[data-export]")){
    const brief=screen.querySelector('textarea[name="brief"]').value.trim();
    const content="# 학교 간 교육 교류 · 7차 검토\n\n"+ideas.map(([s,t,n])=>"- ["+s+"] "+t+" — "+n).join("\n")+"\n\n## 검토 메모\n\n"+(brief||"기록된 메모가 없습니다.")+"\n";
    const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="school-exchange-review-r07.md";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
screen.addEventListener("input",event=>{
  if(event.target.matches("#search,#category")) screen.querySelector("#lessons-list").innerHTML=lessonCards(screen.querySelector("#search").value,screen.querySelector("#category").value);
});
screen.addEventListener("change",event=>{
  if(event.target.id==="preview"){preview=event.target.value;render();screen.querySelector("#preview")?.focus();}
  if(event.target.name==="scope"){
    const check=event.target.form.elements.reviewed;
    check.required=event.target.value==="public";
    document.querySelector("#public-review").hidden=!check.required;
  }
});
screen.addEventListener("submit",event=>{
  const form=event.target;
  if(!form.dataset.form)return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  for(const name of Object.keys(data)) data[name]=data[name].trim();
  if([...form.querySelectorAll("[required]")].some(field=>field.type!=="checkbox"&&!field.value.trim())){feedback.textContent="필수 항목에 내용을 입력해 주세요.";return;}
  switch(form.dataset.form){
    case "copy": save({...state,copies:[...state.copies,{id:data.id,title:data.title,note:data.note}]},"내 수업안에 저장했습니다.");break;
    case "review": save({...state,copies:state.copies.map((item,i)=>i===Number(data.index)?{...item,review:data.review,work:data.work}:item)},"원안과 연결된 적용 후기를 이 브라우저에 저장했습니다.");break;
    case "project": save({...state,projects:[...state.projects,{title:data.title,partner:data.partner,prompt:data.prompt}]},"공동수업 초안을 저장했습니다.");break;
    case "question": save({...state,questions:[...state.questions,data.question]},"학급 질문을 저장했습니다.");break;
    case "work":
      if(data.scope==="public"&&!data.reviewed){feedback.textContent="공개 범위를 먼저 확인해 주세요.";return;}
      if(save({...state,works:[...state.works,{title:data.title,school:data.school,scope:data.scope,ko:data.ko,en:data.en,foreign:"",type:"학급 작품",tone:"gold"}]},"출품을 저장했습니다.")){
        preview=data.scope;
        render();
        screen.querySelector("#preview")?.focus();
      }
      break;
    case "brief": save({...state,brief:data.brief},"검토 메모를 저장했습니다.");break;
  }
});
window.addEventListener("hashchange",()=>{feedback.textContent="";render();});
render();
