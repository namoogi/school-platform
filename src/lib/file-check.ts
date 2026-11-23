/**
 * 파일 첨부 전 브라우저 쪽 검사 (FileDrop이 쓴다). 서버 검사(매직 바이트·PDF 검사)를 대신하지 않는다.
 * 규칙: docs/design/DESIGN-SYSTEM.md '입력·파일 첨부'
 */

export type FileLike = { name: string; type: string; size: number };

export type FileRules = {
  /** 받을 형식: '.zip', 'image/*', 'application/pdf' 꼴. 비우면 모두 받는다 */
  accept?: string[];
  /** 파일 하나의 최대 크기(바이트) */
  maxSize?: number;
  /** 한 번에 받을 최대 개수. multiple이 아니면 1 */
  maxFiles?: number;
  multiple?: boolean;
  /** 오류 문구에 쓸 쉬운 형식 이름(예: 'PNG·JPG·WEBP·GIF') */
  typeLabel?: string;
};

export type FileCheck<T extends FileLike> = { accepted: T[]; errors: string[] };

const KB = 1024;
const MB = 1024 * KB;

/** 사람이 읽는 크기: 512바이트, 12KB, 4.5MB */
export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes}바이트`;
  if (bytes < MB) return `${Math.round(bytes / KB)}KB`;
  const mb = bytes / MB;
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)}MB`;
}

function extension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
}

/** 형식 하나가 accept 목록에 맞는지. 확장자 또는 브라우저가 준 형식 중 하나가 맞으면 된다 */
export function matchesAccept(file: FileLike, accept: string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true;
  const ext = extension(file.name);
  const type = (file.type || '').toLowerCase();
  return accept.some((raw) => {
    const a = raw.trim().toLowerCase();
    if (!a) return false;
    if (a.startsWith('.')) return ext === a;
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

/** accept 목록을 사람이 읽는 이름으로: ['.zip'] → 'ZIP', ['image/png','image/jpeg'] → 'PNG·JPEG' */
export function describeAccept(accept: string[] | undefined): string {
  if (!accept || accept.length === 0) return '모든 형식';
  const names = accept.map((a) => {
    const v = a.trim().toLowerCase();
    if (v.startsWith('.')) return v.slice(1).toUpperCase();
    if (v.endsWith('/*')) return v === 'image/*' ? '그림' : v.slice(0, -2);
    const sub = v.split('/')[1] ?? v;
    return sub.replace(/^x-/, '').replace(/^vnd\.openxmlformats-officedocument\.(\w+).*$/, '$1').toUpperCase();
  });
  return [...new Set(names)].join('·');
}

/**
 * 고른 파일을 규칙으로 나눈다. 맞는 파일은 accepted, 나머지는 쉬운 문장의 errors.
 * 개수를 넘으면 앞에서부터 maxFiles개만 받는다.
 */
export function checkFiles<T extends FileLike>(files: readonly T[], rules: FileRules = {}): FileCheck<T> {
  const accepted: T[] = [];
  const errors: string[] = [];
  const limit = rules.multiple ? (rules.maxFiles ?? Infinity) : 1;
  const typeLabel = rules.typeLabel ?? describeAccept(rules.accept);

  if (files.length === 0) return { accepted, errors };
  if (files.length > limit) {
    errors.push(limit === 1
      ? `파일은 한 번에 하나만 올릴 수 있습니다. 첫 파일 ‘${files[0].name}’만 확인합니다.`
      : `한 번에 ${limit}개까지 올릴 수 있습니다. 앞의 ${limit}개만 확인합니다.`);
  }
  for (const f of files.slice(0, limit)) {
    if (!matchesAccept(f, rules.accept)) {
      errors.push(`‘${f.name}’은(는) 올릴 수 없는 형식입니다. ${typeLabel} 파일을 골라 주세요.`);
    } else if (f.size === 0) {
      errors.push(`‘${f.name}’은(는) 빈 파일입니다.`);
    } else if (rules.maxSize !== undefined && f.size > rules.maxSize) {
      errors.push(`‘${f.name}’은(는) ${formatSize(f.size)}로, 최대 ${formatSize(rules.maxSize)}보다 큽니다.`);
    } else {
      accepted.push(f);
    }
  }
  return { accepted, errors };
}

/** accept 목록을 <input accept>에 넣을 문자열로 */
export function acceptAttr(accept: string[] | undefined): string | undefined {
  return accept && accept.length ? accept.join(',') : undefined;
}

/**
 * 진행률을 알 수 있는 업로드(XMLHttpRequest). fetch는 올리는 진행률을 주지 않는다.
 * 응답 본문은 JSON으로 읽어 돌려준다(읽지 못하면 {}). 취소하면 AbortError를 던진다.
 */
export function uploadWithProgress(url: string, body: FormData | Blob, opts: {
  signal?: AbortSignal; onProgress?: (ratio: number) => void; method?: string; headers?: Record<string, string>;
} = {}): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method ?? 'POST', url);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(xhr.responseText || '{}'); } catch { /* 본문 없음 */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error('네트워크 오류로 올리지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'));
    xhr.onabort = () => reject(new DOMException('취소했습니다.', 'AbortError'));
    if (opts.signal) {
      if (opts.signal.aborted) { reject(new DOMException('취소했습니다.', 'AbortError')); return; }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}
