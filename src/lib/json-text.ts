/**
 * 128차: 판 내용을 고치는 JSON 칸의 처음 값. 배열은 한 줄에 원소 하나(구간·띠를 눈으로 대조하기 쉽게),
 * 객체는 맨 위 칸마다 한 줄(식처럼 깊은 값을 끝없이 펼치지 않는다)
 */
export const jsonText = (v: unknown) => {
  if (Array.isArray(v)) return `[\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n]`;
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const keys = Object.keys(o);
  return keys.length ? `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(o[k])}`).join(',\n')}\n}` : '{}';
};
