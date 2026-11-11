// Fotos de la Parte 2 desde Pexels (gratis, con el autor citado). Sin clave de Pexels en el
// Worker, cada foto se muestra descrita en texto.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { workerFetch } from '../../ai/worker';
import { IS_DEMO } from '../../config';
import type { PhotoT } from '../../speaking/schema';

interface Found {
  src: string;
  by: string;
  url: string;
}

const KEY = (q: string) => `mtg.pexels.${q}`;

async function findPhoto(query: string): Promise<Found | null> {
  try {
    const hit = localStorage.getItem(KEY(query));
    if (hit) return JSON.parse(hit) as Found;
  } catch {
    /* nada */
  }
  if (IS_DEMO) return null;
  try {
    const r = await workerFetch(`/pexels/search?query=${encodeURIComponent(query)}&per_page=1`);
    if (!r.ok) return null;
    const j = (await r.json()) as { photos?: { src?: { medium?: string; large?: string }; photographer?: string; url?: string }[] };
    const p = j.photos?.[0];
    if (!p?.src?.medium) return null;
    const found = { src: p.src.large ?? p.src.medium, by: p.photographer ?? 'Pexels', url: p.url ?? 'https://www.pexels.com' };
    try {
      localStorage.setItem(KEY(query), JSON.stringify(found));
    } catch {
      /* nada */
    }
    return found;
  } catch {
    return null;
  }
}

function Photo(props: { p: PhotoT; n: number }) {
  const [found, setFound] = useState<Found | null | undefined>(undefined);
  useEffect(() => {
    findPhoto(props.p.query).then(setFound);
  }, [props.p.query]);
  return (
    <figure class="sphoto">
      {found ? (
        <>
          <img src={found.src} alt={props.p.alt} loading="lazy" />
          <figcaption>
            <span class="pnum">{props.n}</span>
            <a href={found.url} target="_blank" rel="noopener">
              Foto: {found.by} / Pexels
            </a>
          </figcaption>
        </>
      ) : (
        <div class="sphoto-text">
          <span class="pnum">{props.n}</span>
          <span class="read">{found === undefined ? '…' : props.p.alt}</span>
        </div>
      )}
    </figure>
  );
}

export function PhotoCard(props: { title: string; questions: string[]; photos: PhotoT[]; mine: boolean }) {
  return (
    <section class="card stack" style={{ '--gap': '10px' } as JSX.CSSProperties}>
      <div class="spread">
        <span class="kicker">{props.title}</span>
        <span class="pill">{props.mine ? 'Tus fotos' : 'Fotos de tu compañero'}</span>
      </div>
      <div class="stack" style={{ '--gap': '2px' } as JSX.CSSProperties}>
        {props.questions.map((q) => (
          <strong key={q} class="read">
            {q}
          </strong>
        ))}
      </div>
      <div class="sphotos">
        {props.photos.map((p, i) => (
          <Photo key={p.query} p={p} n={i + 1} />
        ))}
      </div>
    </section>
  );
}
