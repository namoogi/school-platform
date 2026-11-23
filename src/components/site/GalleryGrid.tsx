'use client';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, X } from 'lucide-react';

export type GalleryShown = { src: string; alt: string; category?: string; fileName?: string; size?: string };

/**
 * 31차 갤러리: 묶음 거르기(있을 때만) + 눌러서 크게 보기(<dialog>, Esc·← → 키).
 * 거르기 상태는 aria-pressed로, 사진 수는 글자로도 알린다(색만으로 구분하지 않음).
 */
export function GalleryGrid({ items, filters, caption, labels, downloadLabel }: {
  downloadLabel?: string;
  items: GalleryShown[]; filters: { key: string; label: string }[]; caption: string;
  labels: { all: string; close: string; prev: string; next: string; /** '{n}장' 꼴 */ count: string };
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = cat ? items.filter((i) => i.category === cat) : items;
  const show = (i: number) => { setOpen(i); if (!dialog.current?.open) dialog.current?.showModal(); };
  const step = (d: number) => setOpen((o) => (o === null ? o : (o + d + shown.length) % shown.length));
  const cur = open === null ? null : shown[open];
  return (
    <figure className="site-gallery" data-download={downloadLabel ? "png" : undefined} data-testid="gallery">
      {downloadLabel && caption && <figcaption className="character-gallery-title">{caption}</figcaption>}
      {filters.length > 0 && (
        <div className="gallery-filter" role="group" aria-label={caption || labels.all}>
          {[{ key: '', label: labels.all }, ...filters].map((f) => (
            <button key={f.key || 'all'} type="button" aria-pressed={(cat ?? '') === f.key} onClick={() => setCat(f.key || null)}>{f.label}</button>
          ))}
          <span className="gallery-count" aria-live="polite">{labels.count.replace('{n}', String(shown.length))}</span>
        </div>
      )}
      <div className="gallery-grid">
        {shown.map((g, i) => (
          <div key={g.src + i} className={downloadLabel ? 'character-card' : undefined}>
            <button type="button" className="gallery-tile" onClick={() => show(i)} aria-label={g.alt || g.fileName || `${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.src} alt="" loading="lazy" />
            </button>
            {downloadLabel && <>
              <b>{g.alt || g.fileName}</b>
              {g.size && <span className="character-file-size">PNG · {g.size}</span>}
              <a className="character-download" href={g.src} download={g.fileName || 'character.png'}>
                <FileDown size={18} aria-hidden="true" />{downloadLabel}<span className="sr-only">: {g.alt || g.fileName}</span>
              </a>
            </>}
          </div>
        ))}
      </div>
      {!downloadLabel && caption && <figcaption>{caption}</figcaption>}
      <dialog ref={dialog} className="photo-dialog" onClose={() => setOpen(null)} aria-label={cur?.alt || caption}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}>
        <button type="button" className="dialog-close" onClick={() => dialog.current?.close()} aria-label={labels.close}><X size={20} aria-hidden="true" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cur && <img src={cur.src} alt={cur.alt} />}
        {cur?.alt && <p className="photo-caption">{cur.alt}</p>}
        {cur && downloadLabel && <a className="character-download" href={cur.src} download={cur.fileName || 'character.png'}><FileDown size={18} aria-hidden="true" />{downloadLabel}</a>}
        {shown.length > 1 && (
          <div className="photo-controls">
            <button type="button" onClick={() => step(-1)} aria-label={labels.prev}><ChevronLeft size={20} aria-hidden="true" /></button>
            <span>{open === null ? '' : `${open + 1} / ${shown.length}`}</span>
            <button type="button" onClick={() => step(1)} aria-label={labels.next}><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        )}
      </dialog>
    </figure>
  );
}
