import Link from 'next/link';

const NAMES: Record<string, string> = { intake: '학교 제도 분석', records: '학사 문서실' };

export default async function Locked({ searchParams }: { searchParams: Promise<{ module?: string; reason?: string }> }) {
  const { module, reason } = await searchParams;
  return (
    <section className="card content-narrow">
      {reason === 'admin'
        ? <><h1>학교 관리자 전용</h1><p className="muted">이 화면은 학교 관리자만 열 수 있습니다.</p></>
        : <><h1>{module && NAMES[module] ? `${NAMES[module]} 기능이 꺼져 있습니다` : '사용할 수 있는 기능이 없습니다'}</h1>
            <p className="muted">학교 라이선스에 이 기능이 포함돼 있지 않습니다. 학교 관리자가 학교 설정에서 기능을 켤 수 있습니다.</p></>}
      <Link className="button secondary" href="/settings">학교 설정으로</Link>
    </section>
  );
}
