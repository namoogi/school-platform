'use strict';

const roleKey = 'school-review-role';
const contentKey = 'school-review-round-03-homepage';
const defaults = {
  heroTitle: '함께 배우고\n함께 자라는 학교',
  heroText: '태국 우본라차타니의 룽아룬숙사 학교를 소개합니다.',
  introTitle: '학교 소개',
  introText: '유치부와 초등부의 학교생활과 배움을 소개하는 공간입니다.',
  newsTitle: '어린이 북페어 안내',
  newsText: '그림책을 함께 읽고 책 이야기를 나누는 행사 시안입니다.'
};
const sectionNames = { hero: '첫 화면', intro: '학교 소개', news: '학교 소식' };
const bar = document.querySelector('#admin-bar');
const login = document.querySelector('#login');
const toggle = document.querySelector('#edit-mode');
const dialog = document.querySelector('#edit-dialog');
const form = document.querySelector('#edit-form');
const status = document.querySelector('#status');
const error = document.querySelector('#edit-error');
const editButtons = document.querySelectorAll('[data-edit]');
let content = { ...defaults };
let admin = false;
try {
  admin = sessionStorage.getItem(roleKey) === 'admin';
  content = { ...defaults, ...JSON.parse(localStorage.getItem(contentKey)) };
} catch {}
let editing = admin && new URLSearchParams(location.search).get('edit') === '1';
let chosen = '';
let timer;

function announce(message) {
  clearTimeout(timer);
  status.textContent = message;
  timer = setTimeout(() => { status.textContent = ''; }, 4000);
}
function render() {
  for (const item of document.querySelectorAll('[data-content]')) item.textContent = content[item.dataset.content];
  bar.hidden = !admin;
  login.hidden = admin;
  toggle.setAttribute('aria-pressed', String(editing));
  toggle.textContent = editing ? '편집 종료' : '페이지 편집';
  document.body.classList.toggle('editing', editing);
  for (const button of editButtons) button.hidden = !editing;
}
function changeRole(enabled) {
  admin = enabled;
  editing = false;
  try {
    if (enabled) sessionStorage.setItem(roleKey, 'admin');
    else sessionStorage.removeItem(roleKey);
  } catch {}
  render();
}
login.addEventListener('click', () => {
  changeRole(true);
  window.scrollTo({ top: 0, behavior: 'instant' });
  toggle.focus();
  announce('관리자 보기로 전환했습니다.');
});
document.querySelector('#logout').addEventListener('click', () => {
  changeRole(false);
  login.focus();
  announce('방문자 보기로 전환했습니다.');
});
toggle.addEventListener('click', () => {
  if (!admin) return;
  editing = !editing;
  render();
});
for (const button of editButtons) button.addEventListener('click', () => {
  if (!admin || !editing) return;
  chosen = button.dataset.edit;
  document.querySelector('#edit-title').textContent = sectionNames[chosen] + ' 수정';
  form.elements.title.value = content[chosen + 'Title'];
  form.elements.body.value = content[chosen + 'Text'];
  error.textContent = '';
  dialog.showModal();
  form.elements.title.focus();
});
document.querySelector('#cancel-edit').addEventListener('click', () => dialog.close());
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!admin || !editing || !Object.hasOwn(sectionNames, chosen)) return;
  const title = form.elements.title.value.trim();
  const body = form.elements.body.value.trim();
  if (!title || !body) { error.textContent = '제목과 본문을 입력해 주세요.'; return; }
  content[chosen + 'Title'] = title;
  content[chosen + 'Text'] = body;
  let saved = true;
  try { localStorage.setItem(contentKey, JSON.stringify(content)); }
  catch { saved = false; }
  dialog.close();
  render();
  announce(saved ? '이 브라우저에 시안을 저장했습니다.' : '현재 화면에 반영했습니다. 브라우저 저장을 사용할 수 없습니다.');
});
render();
