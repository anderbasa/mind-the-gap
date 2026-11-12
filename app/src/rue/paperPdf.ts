// PDF del Paper 1 hecho en el propio móvil (jsPDF), a partir de la página imprimible:
// así no depende de window.print(), que en la app instalada del iPhone no siempre abre nada.
import type { jsPDF as JsPDF } from 'jspdf';

type Ctor = new (opts: { unit: 'mm'; format: 'a4' }) => JsPDF;

// Las fuentes estándar del PDF solo llevan Windows-1252: lo demás se cambia o se quita.
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function pdfSafe(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/≈/g, '~')
    .replace(/[‐‑‒]/g, '-')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, (c) => (CP1252_EXTRA.includes(c) ? c : ''));
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16; // márgenes
const W = PAGE_W - 2 * M;

export function buildPaperPdf(root: HTMLElement, JsPDFCtor: Ctor): Blob {
  const doc = new JsPDFCtor({ unit: 'mm', format: 'a4' });
  let y = M;
  let page = 1;

  const footer = () => {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text(`Mind the Gap · C1 Advanced Reading and Use of English (practice) · ${page}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
  };
  const newPage = () => {
    footer();
    doc.addPage();
    page++;
    y = M;
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - M) newPage();
  };
  const write = (text: string, opts: { size: number; style?: 'normal' | 'bold' | 'italic'; gap?: number; indent?: number }) => {
    const clean = pdfSafe(text).replace(/[ \t]+/g, ' ').trim();
    if (!clean) return;
    doc.setFont('times', opts.style ?? 'normal');
    doc.setFontSize(opts.size);
    const lh = opts.size * 0.42; // pt → mm con interlineado ~1,2
    const lines = doc.splitTextToSize(clean, W - (opts.indent ?? 0)) as string[];
    for (const line of lines) {
      ensure(lh);
      doc.text(line, M + (opts.indent ?? 0), y + lh * 0.8);
      y += lh;
    }
    y += opts.gap ?? 2;
  };

  let part: Element | null = null;
  const nodes = root.querySelectorAll('.phead h1, .phead p, .ppart h2, .ppart h3, .ppart p, .sheetpart');
  for (const el of Array.from(nodes)) {
    if (el.closest('.noprint')) continue;
    const sec = el.closest('.ppart');
    if (sec && sec !== part) {
      if (part) newPage(); // cada parte en una página nueva, como al imprimir
      part = sec;
    }
    if (el.matches('h1')) write(el.textContent ?? '', { size: 16, style: 'bold', gap: 1 });
    else if (el.matches('h2')) write(el.textContent ?? '', { size: 13, style: 'bold', gap: 1.5 });
    else if (el.matches('h3')) write(el.textContent ?? '', { size: 12, style: 'bold', gap: 1.5 });
    else if (el.matches('.sheetpart')) {
      // Hoja de respuestas: «Part N» y una rejilla de números con su línea.
      const title = el.querySelector('strong')?.textContent ?? '';
      const cells = Array.from(el.querySelectorAll('.cell'));
      const wide = cells.some((c) => c.classList.contains('wide'));
      const cols = wide ? 2 : 4;
      const rows = Math.ceil(cells.length / cols);
      ensure(6 + rows * 8);
      write(title, { size: 11, style: 'bold', gap: 1 });
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      const cw = W / cols;
      cells.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = M + col * cw;
        const yy = y + row * 8 + 5;
        const n = (c.textContent ?? '').replace(/_+/g, '').trim();
        doc.text(n, x, yy);
        doc.line(x + 8, yy + 0.8, x + cw - 4, yy + 0.8);
      });
      y += rows * 8 + 4;
    } else {
      const isItalic = !!el.querySelector('em') && el.textContent === el.querySelector('em')?.textContent;
      const inItem = !!el.closest('.pitem');
      write((el as HTMLElement).innerText ?? el.textContent ?? '', { size: el.closest('.phead') ? 10 : 11, style: isItalic ? 'italic' : 'normal', gap: inItem ? 1 : 2.5 });
    }
  }
  footer();
  return doc.output('blob');
}

/** Comparte el PDF (iPhone: Guardar en Archivos, Imprimir, WhatsApp…) o lo descarga. */
export async function sharePdf(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Si compartir falla por otra cosa, se descarga.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
