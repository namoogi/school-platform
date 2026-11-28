/** 글을 클립보드에 넣는다(브라우저). 권한이 없으면 숨긴 글상자로 한 번 더 시도한다. 46차 AI 연결 글·124차 AI 맞춤 지시문이 같이 쓴다 */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { return document.execCommand('copy'); } finally { t.remove(); }
}
