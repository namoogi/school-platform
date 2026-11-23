/**
 * 39차: 새벽빛(dawn) 장식 — 옛 룽아룬숙사 사이트의 무지개 호와 7색 띠를 그대로 옮긴 것. 장식이라 읽기 도구에서 숨긴다.
 * 다른 테마에서는 CSS로 보이지 않는다(.site:not([data-theme="dawn"]) .rainbow-*).
 */
const ARC = ['#D97662', '#DCA15F', '#DEC26D', '#819C83', '#7496B0'];

export function RainbowArc() {
  return (
    <svg className="rainbow-arc" viewBox="0 0 260 160" aria-hidden="true" focusable="false">
      {ARC.map((c, n) => {
        const r = 105 - n * 17;
        return <path key={c} d={`M${130 - r} 155a${r} ${r} 0 0 1 ${r * 2} 0`} stroke={c} />;
      })}
    </svg>
  );
}

export function Ribbon() {
  return <div className="rainbow-signature" aria-hidden="true">{Array.from({ length: 7 }, (_, n) => <i key={n} />)}</div>;
}
