import { loadForPlatform } from '@/lib/page';
import { estimate, fmtBytes, platformEstimate, PRICES, schoolUsage, storageStatus, usd } from '@/lib/usage';
import { Kpi, PageHeader, StatusBadge } from '@/components/ui';
import { StorageActions } from './StorageActions';

export default async function UsagePage() {
  const { rows } = await loadForPlatform(async ({ db }) => ({ rows: await schoolUsage(db, null) }));
  const st = storageStatus();
  const total = platformEstimate(rows);
  const dbOnly = rows.reduce((n, r) => n + r.db_only_files, 0);
  return (
    <>
      <PageHeader title="사용량·저장소" crumbs={[{ label: '전체 관리' }, { label: '사용량·저장소' }]}
        description={<>학교별 파일 저장량·AI 사용·외부 에이전트 작업을 모아 월 요금을 추정합니다. 금액은 USD 추정이며 청구서가 아닙니다(단가 확인 {PRICES.checked}, R2 저장 ${PRICES.r2GbMonth}/GB·DB 디스크 ${PRICES.dbGbMonth}/GB). 방문자 내려받기는 R2에서 무료라 따로 세지 않습니다.</>} />
      <div className="kpis" data-testid="usage-summary">
        <Kpi label="월 추정(포함분 뺀 뒤)" value={usd(total.total)} hint={`DB ${usd(total.db)} · R2 ${usd(total.r2)} · AI ${usd(total.ai)}`} />
        <Kpi label="R2 저장" value={fmtBytes(total.r2Gb * 1024 ** 3)} hint={`무료 ${PRICES.r2FreeGb}GB 안`} />
        <Kpi label="DB에 든 파일" value={fmtBytes(total.dbGb * 1024 ** 3)} tone={dbOnly ? 'warning' : undefined} hint={`R2로 옮길 파일 ${dbOnly}개`} />
      </div>

      <section className="card" data-testid="storage-card">
        <div className="card-header">
          <h2>파일 저장소 · Cloudflare R2</h2>
          {st.configured ? <StatusBadge tone="success" dot>설정됨 · {st.bucket}</StatusBadge> : <StatusBadge tone="warning" dot>설정 전 · DB에 저장 중</StatusBadge>}
        </div>
        <p className="muted small-text">
          {st.configured
            ? '새로 올리는 홈페이지 그림·PDF는 R2(비공개 버킷)에 저장되고, 방문자에게는 공개 판단 뒤 10분짜리 서명 주소로 넘겨집니다. 기존 파일은 아래 단추로 복사합니다(DB 사본은 남김).'
            : 'Vercel 환경 변수 R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET 를 넣고 다시 배포하면 켜집니다. 안내: docs/SETUP-R2.md'}
        </p>
        <StorageActions configured={st.configured} left={dbOnly} />
      </section>

      <section className="card">
        <div className="card-header"><h2>학교별 사용량</h2><span className="fine">최근 30일 · 학교별 금액은 포함분 빼기 전</span></div>
        <div className="table-wrap">
          <table className="grid-table" data-testid="usage-table">
            <thead><tr>
              <th scope="col">학교</th><th scope="col" className="num">파일</th><th scope="col" className="num">DB 저장</th><th scope="col" className="num">R2 저장</th>
              <th scope="col" className="num">AI 호출·토큰</th><th scope="col" className="num">외부 에이전트 작업</th><th scope="col" className="num">월 추정</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const e = estimate(r);
                return (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td className="num">{r.files}{r.db_only_files > 0 && <span className="muted"> (DB만 {r.db_only_files})</span>}</td>
                    <td className="num">{fmtBytes(r.db_site_bytes + r.db_source_bytes)}</td>
                    <td className="num">{fmtBytes(r.r2_bytes)}</td>
                    <td className="num">{r.ai_calls_30d}회 · {r.ai_tokens_30d.toLocaleString('ko-KR')}</td>
                    <td className="num">{r.agent_actions_30d}회</td>
                    <td className="num"><b>{usd(e.total)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small-text">AI는 앱 안 AI 기능이 호출할 때 남기는 추정 금액의 합입니다(아직 앱 안 AI 기능이 없어 0). 외부 에이전트(학교의 Claude·Codex 구독)는 플랫폼 요금이 아니라 작업 수만 셉니다.</p>
      </section>
    </>
  );
}
