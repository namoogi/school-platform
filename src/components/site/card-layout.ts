/** Render-only hints shared by the server renderer and category filter. */
export function cardLayout(count: number) {
  const columns = count <= 2 ? Math.max(1, count) : count % 4 === 0 ? 4 : count % 3 === 0 ? 3 : count % 2 === 0 ? 2 : 3;
  return { 'data-count': count, 'data-columns': columns };
}
