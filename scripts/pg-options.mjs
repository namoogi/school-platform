// Postgres 연결 옵션. 앱(src/lib/db.ts)과 마이그레이션·시드 스크립트가 함께 쓴다.
//
// DATABASE_SSL
//   (미지정) 로컬 주소면 SSL 없음, 그 밖의 주소(Supabase 등)면 암호화 연결. 서버 인증서는 검증하지 않음
//   verify   서버 인증서까지 검증. DATABASE_CA_CERT 에 Supabase CA 인증서(PEM 본문)를 넣는다
//   disable  SSL 없음
const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * DB 연결 주소를 읽는다. 형식이 틀려도 오류 메시지에 값(비밀번호 포함 가능)을 넣지 않는다.
 */
export function parseDbUrl(connectionString) {
  let url;
  try {
    url = new URL(String(connectionString ?? '').trim());
  } catch {
    throw new Error('DATABASE_URL 이 연결 주소 형식이 아닙니다. postgresql://사용자:비밀번호@호스트:포트/postgres 형태의 전체 주소가 필요합니다. (보안을 위해 값은 출력하지 않음)');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL 은 postgresql:// 로 시작해야 합니다. (보안을 위해 값은 출력하지 않음)');
  }
  // DATABASE_PASSWORD 가 있으면 주소의 비밀번호 자리를 그 값으로 바꾼다.
  // (Supabase에서 복사한 주소를 [YOUR-PASSWORD] 그대로 두고, 비밀번호는 특수문자 변환 없이 따로 넣을 수 있다)
  const separate = process.env.DATABASE_PASSWORD;
  if (separate) {
    url.password = encodeURIComponent(separate);
    return url;
  }
  const pw = safeDecode(url.password);
  if (/YOUR-PASSWORD/i.test(pw)) {
    throw new Error('DATABASE_URL 에 [YOUR-PASSWORD] 가 그대로 있습니다. DATABASE_PASSWORD 변수에 DB 비밀번호를 넣으세요.');
  }
  if (/^\[.*\]$/.test(pw)) {
    throw new Error('DATABASE_URL 의 비밀번호가 대괄호 [ ] 로 감싸져 있습니다. 대괄호를 지우거나 DATABASE_PASSWORD 변수를 쓰세요.');
  }
  if (/^\s|\s$/.test(pw)) {
    throw new Error('DATABASE_URL 의 비밀번호 앞뒤에 공백이 있습니다.');
  }
  return url;
}

function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return v; }
}

export function pgOptions(connectionString) {
  const host = parseDbUrl(connectionString).hostname;
  const mode = process.env.DATABASE_SSL ?? (LOCAL.has(host) ? 'disable' : 'require');
  let ssl = false;
  if (mode === 'require') ssl = { rejectUnauthorized: false };
  else if (mode === 'verify') {
    const ca = process.env.DATABASE_CA_CERT;
    if (!ca) throw new Error('DATABASE_SSL=verify 에는 DATABASE_CA_CERT 가 필요합니다.');
    ssl = { rejectUnauthorized: true, ca };
  } else if (mode !== 'disable') throw new Error(`DATABASE_SSL 값이 올바르지 않습니다: ${mode}`);
  // 연결 문자열의 sslmode 가 위 설정을 덮어쓰지 않도록 뺀다.
  const url = parseDbUrl(connectionString);
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), ssl };
}
