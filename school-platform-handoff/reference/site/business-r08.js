'use strict';
const usd=1346, baht=39.61;
const standard={60:199000,150:279000,300:449000};
const teach={60:79,150:99,300:129};
const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const won=n=>fmt(n)+'원';
const dollar=n=>'$'+Number(n.toFixed(2)).toLocaleString('en-US',{maximumFractionDigits:2});
const sources={six:'https://www.sixshop.com/pricing',green:'https://www.greenhouseschoolwebsites.co.uk/school-website-prices/comparison/',quick:'https://www.quickschools.com/quickschools/pricing',teach:'https://www.teachngo.com/pages/pricing',cues:'https://www.schoolcues.com/pricing/small-schools',grade:'https://gradelink.com/pricing-calculator/',gradeWeb:'https://help.gradelink.com/get-a-school-websites-from-gradelink',bell:'https://schoolbell-e.oopy.io/usage_amount',together:'https://t-alimi.com/',klassy:'https://www.klassy.ai/th/'};
const link=(key,label='공식 요금표')=>'<a class="source" target="_blank" rel="noopener" href="'+sources[key]+'">'+label+'</a>';
function priceTable(rows){return '<div class="table-box price-table"><table><thead><tr><th>서비스</th><th>이용료</th><th>대상·제공 기능·추가비</th></tr></thead><tbody>'+rows.map(([name,price,scope,ref])=>'<tr><td><strong>'+name+'</strong></td><td>'+price+'</td><td>'+scope+(ref?'<br>'+ref:'')+'</td></tr>').join('')+'</tbody></table></div>';}
function info(title,text){return '<div class="highlight"><strong>'+title+'</strong><p>'+text+'</p></div>';}
function planRows(n){
 const base=teach[n], schoolPlan=standard[n], both=13600+base*usd;
 const own=['우리 통합형 · 기획가',won(schoolPlan)+'/월','학생 '+n+'명 기준. 홈페이지·학사·역할별 모바일 접근을 묶는 가정입니다. 도입·이관·맞춤 개발과 초과 API 사용료는 범위를 정해 별도 산정합니다.'];
 return {
 full:info('최대 구성에 가장 가까운 단일 상품은 SchoolCues Unify입니다.','학교 홈페이지·성적표·가정 앱·입학 업무를 한 계약에 담습니다. 학교 제도 분석, 학교 간 공동 전시와 수업안 교류, 개선 요청별 개발·배포 지원까지 같은 조건인지는 확인이 필요합니다.')+
 priceTable([own,['SchoolCues Unify','월 $239부터','31~40명 공개 시작가 · 연 $2,868 선납, 설치비 없음. 월 환산 '+won(239*usd)+'. 선택한 '+n+'명 학교의 실제 가격은 견적 필요.',link('cues')],
 ['Gradelink + 학교 홈페이지','통합가 견적','학사·성적표·학생/학부모 앱은 100명 예시 월 $159 + 초기 $249. 홈페이지는 별도 설계·견적이므로 통합 총액은 미확인.',link('grade','학사 가격')+' · '+link('gradeWeb','홈페이지 견적')],
 ['식스샵 + Teach ’n Go',won(both)+'/월','같은 '+n+'명 기준. 웹 빌더 월 13,600원 + 학사·모바일 월 '+dollar(base)+'. 단순 합산으로 직접 제작·연동·학교 고유 성적표 구현·자료 이관 비용은 별도입니다.',link('six','홈페이지')+' · '+link('teach','학사·모바일')]])+
 '<h2>학교 규모별 예산</h2><div class="table-box"><table><thead><tr><th>학생 수</th><th>우리 통합형 / 월</th><th>두 서비스 조합 / 월</th><th>연 차액¹</th></tr></thead><tbody>'+[60,150,300].map(x=>'<tr><td>'+x+'명</td><td>'+won(standard[x])+'</td><td>'+won(13600+teach[x]*usd)+'</td><td>'+won((standard[x]-13600-teach[x]*usd)*12)+'</td></tr>').join('')+'</tbody></table></div><p class="note">¹ 월납 12개월 기준. 후원자가 추가로 부담하는 금액을 학교 양식 설정·홈페이지 운영 지원·개선 대응이 정당화하는지 검증할 수 있습니다. 두 서비스 조합은 업체가 판매하는 통합 상품이 아닙니다.</p>',
 web:info('홈페이지는 첫해 제작비와 다음 해 유지비를 나누어 봅니다.','룽아룬숙사처럼 학교가 직접 페이지를 고치면서 제작·개선 지원도 받으려면 직접 제작형과 학교 전용 제작형을 각각 비교해야 합니다.')+
 priceTable([['식스샵 홈페이지','13,600원/월','직접 제작하는 일반 웹 빌더. 1년 선납 월 12,300원 상당(연 147,600원), 부가세 별도. 학교 콘텐츠 입력·관리자 업무 별도.',link('six')],
 ['Greenhouse · 영국 초등','£315/년 유지','템플릿 구축 £945 + 연 £315. 첫해 £1,260, 다음 해 £315. 중등 유지료는 연 £415.',link('green')],
 ['Greenhouse · 초등 맞춤','£315/년 유지','맞춤 구축 £1,895부터(첫해 £2,210). 프리미엄 구축 £3,495(첫해 £3,810).',link('green')],
 ['우리 홈페이지 · 기획가','79,000원/월','연 948,000원. 학교 서브도메인, 공지·갤러리, 현장 페이지 편집, 개선 요청 판과 운영 지원을 묶는 가정. 도입비는 별도 검증.']]),
 sis:info('학생당 과금에서는 재학생 수가 연간 비용을 결정합니다.','단순 명부 관리보다 성적표·학생부·시간표가 필요한 학교는 해당 기능이 들어간 플랜부터 비교해야 합니다.')+
 priceTable([['QuickSchools Apollo',won(1.49*n*usd)+'/월',n+'명 × 월 $1.49 = '+dollar(1.49*n)+'. 성적표·성적부·성적증명·부모/학생 포털. 최소 30명, 문자·음성은 통신비 별도.',link('quick')],
 ['QuickSchools Athena',won(2.99*n*usd)+'/월',n+'명 × 월 $2.99 = '+dollar(2.99*n)+'. Apollo에 자동 시간표·보고서 작성·수업 계획 등을 추가.',link('quick')],
 ['Gradelink SIS','100명 예시 $159/월','초기 $249, 첫해 $2,157. 학사·출결·성적표·학생/학부모 앱 포함. 선택한 '+n+'명의 확정 견적은 공식 계산기에서 확인.',link('grade')]])+
 '<p class="note">우리 서비스는 기존 학교 자료에서 학기·양식·권한을 추정하고 관리자가 확인하는 과정을 기획했습니다. 현지 학교에서 사용하는 양식의 완성도와 도입 공수는 별도 검증 항목입니다.</p>',
 mobile:info('가정 알림 앱과 교사·학부모·학생 학사 포털의 제공 범위가 다릅니다.','학부모의 전자서명만 필요한 학교와 모바일 성적표·수업 시간표까지 필요한 학교는 서로 다른 가격대를 비교해야 합니다.')+
 priceTable([['투게더알리미','15,000원/월부터','2027년 1~5학급 연 18만 원부터. 교사 알림장, 학부모·학생 수신, 가정통신문·설문.',link('together')],
 ['학교종이','51,700원/월 상당','정규 6학급 이하 연 620,400원. 7~15학급은 월 72,600원 상당. 전자서명·안내·과제 회수. 부가세 포함, 일시납 원칙.',link('bell')],
 ['Klassy · 태국',n===300?'300명 견적 필요':(n===60?'฿1,490/월':'฿4,990/월'),n===300?'Lite는 100명, Professional은 200명까지. 상위 규모는 별도 견적.':'교사용·학부모 앱, 출결·전자 양식. '+(n===60?'100명 이하 Lite 약 '+won(1490*baht)+', 연 ฿15,000.':'200명 이하 Professional 약 '+won(4990*baht)+', 연 ฿49,800.')+' 학생 독립 계정은 확인 필요.',link('klassy')],
 ['Teach ’n Go 기본',won(base*usd)+'/월',n+'명 적용 구간 월 '+dollar(base)+'. 교사·학부모·학생 포털, 모바일 앱, 시간표·출결·청구. 연납 시 2개월 할인.',link('teach')],
 ['SchoolCues Connect / Manage','$69 / $139부터','31~40명 월 환산, 1년 약정·연납. Connect는 가정 앱과 소통, Manage는 성적·출결 포함. '+n+'명 적용가는 견적.',link('cues')]])};
}
let kind='full';
const $=id=>document.getElementById(id);
function drawPrice(){$('pricing-content').innerHTML=planRows(Number($('size').value))[kind];}
function afterTax(monthly){
 const yearly=monthly*12;
 const brackets=[[0,.11],[200000000,.22],[20000000000,.242],[300000000000,.275]];
 const tax=brackets.reduce((total,[from,rate],i)=>total+Math.max(0,Math.min(yearly,brackets[i+1]?.[0]??Infinity)-from)*rate,0);
 return monthly-tax/12;
}
function calc(n,req,isSms,extra){
 const hours=4+n*(2+.5*req), overtime=Math.max(0,hours-24);
 const pretax=n*(150570-(isSms?21600:0))-60570-extra;
 const cash=afterTax(pretax);
 return {hours,pretax,cash,residual:cash-hours*40000,overtime,delegate:afterTax(pretax-overtime*40000),fulltime:afterTax(pretax-3500000)};
}
function drawProfit(){
 const fields=['schools','requests','extra'].map(id=>$(id));
 if(fields.some(f=>!f.validity.valid||f.value==='')){$('profit-content').innerHTML='<p class="callout">학교 수와 비용을 입력 범위 안에서 지정해 주세요.</p>';return;}
 const [n,r,extra]=fields.map(f=>Number(f.value));const sms=$('channel').value==='sms', s=calc(n,r,sms,extra);
 const tile=(k,v,negative=false)=>'<article><small>'+k+'</small><b class="'+(negative?'negative':'money')+'">'+v+'</b></article>';
 $('profit-content').innerHTML='<div class="metrics">'+tile('월 세후 현금',won(s.cash),s.cash<0)+tile('본인 시간 반영 잔액',won(s.residual),s.residual<0)+tile('월 투입시간',s.hours+'시간')+'</div>'+
 '<div class="table-box"><table><caption>운영 방식별 비교 · 선택한 '+n+'개 학교</caption><thead><tr><th>운영 방식</th><th>월 세후 현금</th><th>시간·비용 기준</th></tr></thead><tbody><tr><td>재직 · 직접 운영</td><td>'+won(s.cash)+'</td><td>대표 무급 · 월 세전 '+won(s.pretax)+'</td></tr><tr><td>초과업무 부분 위탁</td><td>'+won(s.delegate)+'</td><td>가용시간 초과 '+s.overtime+'시간 × 4만 원</td></tr><tr><td>전업 · 대표 보수 지급</td><td>'+won(s.fulltime)+'</td><td>대표 총인건비 350만 원 지급 후 회사 잔액</td></tr></tbody></table></div>'+
 '<h2>학교 수가 늘면</h2><div class="table-box"><table><thead><tr><th>학교 수</th><th>투입시간</th><th>세후 현금</th><th>본인 시간 반영</th></tr></thead><tbody>'+[...new Set([1,2,3,4,5,10,11,20,24,n])].sort((a,b)=>a-b).map(count=>{const v=calc(count,r,sms,extra);return '<tr><td>'+count+'곳</td><td>'+v.hours+'시간</td><td>'+won(v.cash)+'</td><td>'+won(v.residual)+'</td></tr>';}).join('')+'</tbody></table></div>'+
 '<p class="note">기본 조건에서 5곳에 추가 검수가 월 30분씩 생기면 시간 반영 잔액이 10만 원 줄어듭니다. 60명 외 규모와 홈페이지 중심 구성은 상단의 계산표에서 조정할 수 있습니다.</p>';
}
function route(){
 const panes=Array.from(document.querySelectorAll('.pane'));
 const page=panes.some(p=>p.id===location.hash.slice(1))?location.hash.slice(1):(document.body.dataset.defaultPane||'pricing');
 document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==page);
 document.querySelectorAll('.modes a, aside nav a[href^="#"]').forEach(a=>{if(a.hash==='#'+page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
$('scope').addEventListener('click',event=>{const btn=event.target.closest('button');if(!btn)return;kind=btn.dataset.kind;document.querySelectorAll('#scope button').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));drawPrice();});
$('size').addEventListener('change',drawPrice);
['schools','requests','extra','channel'].forEach(id=>$(id).addEventListener('input',drawProfit));
$('reset').addEventListener('click',()=>{for(const [id,value] of Object.entries({schools:5,requests:0,extra:0,channel:'push'}))$(id).value=value;drawProfit();});
window.addEventListener('hashchange',route);
drawPrice();drawProfit();route();
