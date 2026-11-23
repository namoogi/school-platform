import { AwsClient } from 'aws4fetch';

/**
 * 43차: 파일 저장소 (ADR 0018). Cloudflare R2(S3 호환)를 비공개 버킷으로 쓴다.
 * - 설정(Vercel 환경 변수): R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET (선택: R2_ENDPOINT — 시험용)
 * - 설정이 없으면 null → 앱은 지금처럼 DB(bytea)에 저장한다.
 * - 키는 내용 주소 'sha256/<hex>' 하나뿐. 같은 내용은 한 번만 저장되고, 객체는 지우지 않는다(판 보존).
 * - 읽기는 앱이 공개·소속을 판단한 뒤 짧은 서명 주소(기본 10분)로 넘긴다. 버킷을 공개하지 않는다.
 * - 비밀값은 기록·오류 메시지에 남기지 않는다.
 */
export type ObjectStore = {
  bucket: string;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
  signedGet(key: string, opts: { mime: string; download?: string | null; seconds?: number }): Promise<string>;
};

export const objectKey = (sha256: string) => `sha256/${sha256}`;

let cached: ObjectStore | null | undefined;
export function objectStore(): ObjectStore | null {
  if (cached !== undefined) return cached;
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket, R2_ENDPOINT: endpoint } = process.env;
  if (!id || !secret || !bucket || (!account && !endpoint)) return (cached = null);
  const base = (endpoint || `https://${account}.r2.cloudflarestorage.com`).replace(/\/$/, '');
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto' });
  const url = (key: string) => `${base}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  cached = {
    bucket,
    async put(key, bytes, mime) {
      const res = await aws.fetch(url(key), { method: 'PUT', body: new Uint8Array(bytes) as unknown as BodyInit, headers: { 'content-type': mime, 'content-length': String(bytes.length) } });
      if (!res.ok) throw new StorageError(`파일 저장소에 올리지 못했습니다(${res.status}).`);
    },
    async head(key) {
      const res = await aws.fetch(url(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new StorageError(`파일 저장소를 확인하지 못했습니다(${res.status}).`);
      return { size: Number(res.headers.get('content-length') ?? 0) };
    },
    async signedGet(key, { mime, download, seconds = 600 }) {
      const u = new URL(url(key));
      u.searchParams.set('X-Amz-Expires', String(seconds));
      u.searchParams.set('response-content-type', mime);
      if (download !== undefined) u.searchParams.set('response-content-disposition', download ? `attachment; filename*=UTF-8''${encodeURIComponent(download)}` : 'attachment');
      const signed = await aws.sign(u.toString(), { method: 'GET', aws: { signQuery: true } });
      return signed.url;
    },
  };
  return cached;
}
/** 시험용: 환경 변수를 바꾼 뒤 다시 읽게 한다 */
export function resetObjectStore() { cached = undefined; }

export class StorageError extends Error {}

/** 올리고 확인(크기 대조). 같은 키가 이미 있으면 다시 올리지 않는다 */
export async function putVerified(store: ObjectStore, key: string, bytes: Uint8Array, mime: string) {
  const have = await store.head(key);
  if (have && have.size === bytes.length) return;
  await store.put(key, bytes, mime);
  const after = await store.head(key);
  if (!after || after.size !== bytes.length) throw new StorageError('파일 저장소에 올린 크기가 맞지 않습니다.');
}

/**
 * 그림·PDF 응답: R2에 있으면 서명 주소로 넘기고(302), 아니면 DB 바이트를 그대로 보낸다.
 * R2에만 있는데 설정이 없으면 503(설정 확인 필요).
 */
export async function assetResponse(a: { mime: string; bytes: Buffer | null; sha256: string; object_key: string | null },
  headers: Record<string, string>, cacheControl: string) {
  const store = a.object_key ? objectStore() : null;
  if (a.object_key && store) {
    const pdf = a.mime === 'application/pdf';
    const to = await store.signedGet(a.object_key, { mime: a.mime, download: pdf ? null : undefined });
    // 서명 주소는 10분 유효 → 넘겨주기 응답은 그보다 짧게만 캐시
    return new Response(null, { status: 302, headers: { location: to, 'cache-control': cacheControl.replace(/max-age=\d+/, 'max-age=120'), 'x-content-type-options': 'nosniff' } });
  }
  if (!a.bytes) return new Response('파일 저장소 설정을 확인해 주세요.', { status: 503 });
  return new Response(new Uint8Array(a.bytes), { headers: { 'content-type': a.mime, 'cache-control': cacheControl, 'x-content-type-options': 'nosniff', ...headers } });
}
