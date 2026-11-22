'use strict';
(() => {
  const stage = document.getElementById('stage');
  const screen = document.getElementById('family-screen');
  const title = document.getElementById('device-title');
  let state = 'waiting';
  let answer = '';
  let editing = false;

  function render(moveFocus = false) {
    title.textContent = editing ? '현장수업 참여 회신' : '가정통신문';
    document.querySelectorAll('[data-state]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.state === state));
    });
    if (state === 'empty') {
      screen.innerHTML = '<div class="notice-paper"><h3>도착한 안내가 없습니다</h3><p>학교에서 새 안내를 발행하면 이곳에 표시됩니다.</p></div>';
    } else if (editing) {
      screen.innerHTML = '<form class="notice-paper"><span class="stamp">현장수업</span><h3>학교 정원 관찰 수업</h3><p>11월 25일 수요일 · 오전 9시</p><fieldset><legend>참여 여부</legend>' +
        ['참여합니다', '참여가 어렵습니다'].map(value =>
          '<label class="option"><input type="radio" name="attendance" required value="'+value+'"'+(answer === value ? ' checked' : '')+'>'+value+'</label>'
        ).join('')+'</fieldset><button type="submit" class="action">회신 보내기</button><button type="button" class="back-action" data-back>목록으로</button></form>';
    } else {
      const done = state === 'sent';
      screen.innerHTML = '<article class="notice-paper"><div class="lesson-date"><b>25</b><span>11월 · 수요일<br>오전 9시</span></div><span class="stamp">'+(done?'회신 완료':'회신 필요')+'</span><h3>학교 정원 관찰 수업</h3><p>'+(done?'보낸 답변 · '+answer:'11월 23일 월요일까지 참여 여부를 알려주세요.')+'</p><button type="button" class="action" data-edit>'+(done?'회신 수정':'참여 여부 회신')+'</button></article>';
    }
    if (moveFocus) title.focus({preventScroll:true});
  }
  stage.addEventListener('click', event => {
    const button = event.target.closest('[data-edit], [data-back]');
    if (!button) return;
    editing = button.hasAttribute('data-edit');
    render(true);
  });
  screen.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    answer = new FormData(form).get('attendance');
    state = 'sent';
    editing = false;
    render(true);
  });
  document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => {
    state = button.dataset.state;
    answer = state === 'sent' ? answer || '참여합니다' : '';
    editing = false;
    render();
  }));
  document.querySelectorAll('[data-theme-key]').forEach(button => button.addEventListener('click', () => {
    stage.dataset.theme = button.dataset.themeKey;
    document.querySelectorAll('[data-theme-key]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
  }));
  render();
})();
