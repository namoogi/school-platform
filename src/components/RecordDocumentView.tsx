/**
 * 75차: 기록 발행본 보기(인쇄용). 발행 때 저장한 내용(스냅샷 content)만 그린다(지침 5) — 현재 성적·학적을 다시 읽지 않는다.
 * 형식마다 칸이 달라, 배열은 표로·객체는 정의 목록으로 같은 규칙으로 그린다.
 */
type V = unknown;
const LABEL: Record<string, string> = {
  year: '학년도', years: '학년도별', courses: '과목', enrollments: '학적', attendance: '출결', behavior: '행동특성 및 종합의견', evidence: '증거물',
  subject: '과목', course: 'Course', term: '학기', credits: '학점', raw_score: '원점수', mean_sd: '평균(표준편차)', achievement: '성취도(수강자 수)', status: '상태', detail: '세부능력 및 특기사항',
  grade: 'Grade', credits_attempted: 'Attempted', credits_earned: 'Earned', gpa: 'GPA', cumulative: 'Cumulative', key: 'Key', points: 'Points', note: '비고',
  enrolled_days: '수업일', absent_by_reason: '사유별 결석', counts: '종류별', level: '학교급', starts_on: '시작', ends_on: '끝', annotations: '이의 의견서', statement: '의견', about: '요청', written_at: '작성',
  external: 'External examinations', qualifications: 'Qualifications', awarding_body: 'Awarding body', exam: 'Exam', title: 'Title', date: 'Date', result: 'Result', percent: '%',
  gpax: 'GPAX', code: '코드', grading_scale: 'Grading scale', gpa_policy: 'GPA policy', enrollment: 'Enrollment', description: 'Description', min_percent: 'Min %',
};
const lab = (k: string) => LABEL[k] ?? k;
const isObj = (v: V): v is Record<string, V> => !!v && typeof v === 'object' && !Array.isArray(v);
function scalar(v: V) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'object') return Object.entries(v as Record<string, V>).map(([k, x]) => `${lab(k)} ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(' · ') || '—';
  return String(v);
}
function Table({ rows }: { rows: Record<string, V>[] }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="table-wrap"><table className="grid-table">
      <thead><tr>{cols.map((c) => <th key={c} scope="col">{lab(c)}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{scalar(r[c])}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
function Block({ k, v, depth }: { k: string; v: V; depth: number }) {
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (v.every(isObj) && k === 'years') {
      return <>{(v as Record<string, V>[]).map((y, i) => (
        <section key={i} className="record-year stack"><h3>{scalar(y.year)}</h3>
          {Object.entries(y).filter(([x]) => x !== 'year').map(([x, val]) => <Block key={x} k={x} v={val} depth={depth + 1} />)}</section>))}</>;
    }
    return <div className="stack"><h4>{lab(k)}</h4>{v.every(isObj) ? <Table rows={v as Record<string, V>[]} /> : <p>{v.map(scalar).join(' · ')}</p>}</div>;
  }
  if (isObj(v) && depth < 3) {
    return <div className="stack"><h4>{lab(k)}</h4><dl className="meta-list">{Object.entries(v).map(([x, val]) => <div key={x}><dt>{lab(x)}</dt><dd>{isObj(val) || Array.isArray(val) ? scalar(val) : scalar(val)}</dd></div>)}</dl></div>;
  }
  return <dl className="meta-list"><div><dt>{lab(k)}</dt><dd className={typeof v === 'string' && v.length > 80 ? 'prewrap' : undefined}>{scalar(v)}</dd></div></dl>;
}
export function RecordDocumentView({ content }: { content: Record<string, V> }) {
  const name = (x: V) => (isObj(x) ? scalar(x.name) : scalar(x));
  const skip = new Set(['format', 'title', 'school', 'student', 'note']);
  return (
    <article className="record-doc stack" data-testid="record-doc">
      <header className="stack">
        <h2>{scalar(content.title)}</h2>
        <p className="fine">{name(content.school)}{content.student ? ` · ${name(content.student)}` : ''}{isObj(content.school) && content.school.ceeb ? ` · CEEB ${scalar(content.school.ceeb)}` : ''}</p>
      </header>
      {Object.entries(content).filter(([k]) => !skip.has(k)).map(([k, v]) => <Block key={k} k={k} v={v} depth={0} />)}
      {typeof content.note === 'string' && <p className="fine">{content.note}</p>}
    </article>
  );
}
