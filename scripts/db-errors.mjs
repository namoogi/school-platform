// DB 접속 오류를 관리자가 바로 조치할 수 있는 한 줄 안내로 바꾼다. 연결 주소·비밀번호는 출력하지 않는다.
export function explainDbError(e) {
  const code = e?.code;
  const msg = String(e?.message ?? '');
  if (code === '28P01') return 'DB 비밀번호가 틀렸습니다. Supabase에서 비밀번호를 확인(또는 재설정)하고 DATABASE_URL 의 비밀번호 부분을 고치세요. 특수문자는 %XX 로 바꿔야 하므로 영문·숫자 비밀번호를 권장합니다.';
  if (/Tenant or user not found/i.test(msg)) return 'DB 사용자 이름이 맞지 않습니다. Supabase → Connect → Transaction pooler 주소를 그대로 다시 복사하세요. (사용자 이름은 postgres.<프로젝트ref> 형태)';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DB 서버 주소를 찾을 수 없습니다. DATABASE_URL 의 호스트 부분을 확인하세요.';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return 'DB 서버에 연결할 수 없습니다. 포트(6543)와 Supabase 프로젝트가 일시 정지 상태가 아닌지 확인하세요.';
  return null;
}

export async function connectOrExplain(client) {
  try {
    await client.connect();
  } catch (e) {
    const hint = explainDbError(e);
    if (!hint) throw e;
    console.error(`[db] ${hint} (오류 코드 ${e.code ?? '없음'})`);
    process.exit(1);
  }
}
