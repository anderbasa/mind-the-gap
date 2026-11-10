import type { ComponentChildren, JSX } from 'preact';
import { signal } from '@preact/signals';
import { goBack, isActive, navigate, route } from '../router';
import { IconBack, IconChevron, IconPractice, IconProgress, IconSettings, IconToday, IconVocab } from './icons';
import { SCALE } from '../domain/skills';

/* ── Banda superior tipo cartel de estación ─────────────────────── */

export function Band(props: {
  kicker: string;
  title: ComponentChildren;
  sub?: ComponentChildren;
  line?: string; // color de la línea inferior
  back?: string | true; // ruta de vuelta (o true = atrás)
  right?: ComponentChildren;
}) {
  const style = props.line ? ({ '--band-line': props.line } as JSX.CSSProperties) : undefined;
  return (
    <header class="band" style={style}>
      <div class="band-inner">
        <div class="band-top">
          {props.back ? (
            <button class="band-back" onClick={() => goBack(typeof props.back === 'string' ? props.back : '/')}>
              <IconBack width={22} height={22} /> Atrás
            </button>
          ) : (
            <span class="band-kicker">{props.kicker}</span>
          )}
          {props.right}
        </div>
        {props.back && <div class="band-kicker" style={{ marginTop: '4px' }}>{props.kicker}</div>}
        <h1 class="band-title">{props.title}</h1>
        {props.sub && <p class="band-sub">{props.sub}</p>}
      </div>
    </header>
  );
}

export function Page(props: { children: ComponentChildren; gap?: number }) {
  return (
    <main class="page" style={props.gap ? { gap: `${props.gap}px` } : undefined}>
      {props.children}
    </main>
  );
}

/* ── Barra de pestañas ──────────────────────────────────────────── */

const TABS = [
  { path: '/', label: 'Hoy', Icon: IconToday },
  { path: '/practicar', label: 'Practicar', Icon: IconPractice },
  { path: '/vocabulario', label: 'Vocabulario', Icon: IconVocab },
  { path: '/progreso', label: 'Progreso', Icon: IconProgress },
  { path: '/ajustes', label: 'Ajustes', Icon: IconSettings },
];

export function TabBar() {
  const current = route.value.path;
  return (
    <nav class="tabbar" aria-label="Secciones">
      <div class="tabbar-inner">
        {TABS.map(({ path, label, Icon }) => (
          <button
            key={path}
            class="tab"
            aria-current={isActive(path, current) ? 'page' : undefined}
            onClick={() => navigate(path, { replace: true })}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ── Listas ─────────────────────────────────────────────────────── */

export function ListItem(props: {
  title: ComponentChildren;
  sub?: ComponentChildren;
  dot?: string;
  to?: string;
  onClick?: () => void;
  right?: ComponentChildren;
  disabled?: boolean;
}) {
  const go = props.to ? () => navigate(props.to!) : props.onClick;
  return (
    <button class="list-item" onClick={go} disabled={props.disabled} style={props.disabled ? { cursor: 'default' } : undefined}>
      {props.dot && <span class="line-dot" style={{ '--dot': props.dot } as JSX.CSSProperties} />}
      <span class="grow">
        <span class="list-title" style={{ display: 'block' }}>
          {props.title}
        </span>
        {props.sub && <span class="list-sub">{props.sub}</span>}
      </span>
      {props.right}
      {(props.to || props.onClick) && !props.disabled && <IconChevron class="chev" width={20} height={20} />}
    </button>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Avisos flotantes ───────────────────────────────────────────── */

const toastMsg = signal<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string, ms = 2600): void {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = null), ms);
}

export function ToastHost() {
  return toastMsg.value ? (
    <div class="toast" role="status">
      {toastMsg.value}
    </div>
  ) : null;
}

export function Spinner(props: { label?: string }) {
  return (
    <div class="row" role="status" aria-live="polite">
      <div class="spinner" />
      {props.label && <span class="muted">{props.label}</span>}
    </div>
  );
}

/* ── La línea de metro B2 → C1 ──────────────────────────────────── */

const STATIONS: { v: number; label: string; note: string; above?: boolean }[] = [
  { v: 160, label: '160', note: 'B2' },
  { v: 170, label: '170', note: '' },
  { v: SCALE.c1, label: '180', note: 'C1' },
  { v: SCALE.safeTarget, label: '185', note: '', above: true }, // margen de seguridad: etiqueta arriba para no pisar 180
  { v: SCALE.gradeA, label: '200', note: 'A' },
];

/**
 * Tu trayecto en la escala Cambridge. El tramo entre tu nota estimada y 180
 * se dibuja discontinuo en rojo: ese es «the gap».
 */
export function MetroLine(props: { estimate: number | null; target?: number }) {
  const target = props.target ?? SCALE.c1;
  const lo = 155;
  const hi = 205;
  const W = 340;
  const pad = 18;
  const x = (v: number) => pad + ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (W - pad * 2);
  const y = 44;
  const est = props.estimate;
  const gapFrom = est != null && est < target ? x(est) : null;

  return (
    <figure class="metro" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} 92`} width="100%" role="img" aria-label={est != null ? `Nota estimada ${est}. Objetivo ${target}.` : `Objetivo ${target}. Aún no hay nota estimada.`}>
        {/* línea base */}
        <line x1={pad} y1={y} x2={W - pad} y2={y} stroke="var(--ink)" stroke-width="6" stroke-linecap="round" />
        {/* el hueco */}
        {gapFrom != null && (
          <line x1={gapFrom} y1={y} x2={x(target)} y2={y} stroke="var(--signal)" stroke-width="6" stroke-dasharray="7 6" />
        )}
        {STATIONS.map((s) => {
          const isTarget = s.v === target;
          return (
            <g key={s.v}>
              {isTarget ? (
                <>
                  <circle cx={x(s.v)} cy={y} r="11" fill="var(--paper-raised)" stroke="var(--ink)" stroke-width="4" />
                  <circle cx={x(s.v)} cy={y} r="4.5" fill="var(--signal)" />
                </>
              ) : (
                <circle cx={x(s.v)} cy={y} r="7" fill="var(--paper-raised)" stroke="var(--ink)" stroke-width="3.5" />
              )}
              <text
                x={x(s.v)}
                y={s.above ? y - 18 : y + 30}
                text-anchor="middle"
                font-size={s.above ? '11.5' : '13'}
                font-weight="700"
                fill={s.above ? 'var(--ink-3)' : 'var(--ink)'}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {s.label}
              </text>
              {s.note && (
                <text x={x(s.v)} y={y + 45} text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--ink-3)" letter-spacing="0.06em">
                  {s.note.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
        {est != null && (
          <g>
            <path d={`M${x(est)} ${y - 13} l-6 -9 h12 z`} fill="var(--signal)" />
            <text x={x(est)} y={y - 26} text-anchor="middle" font-size="12" font-weight="700" fill="var(--signal)">
              TÚ · {est}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Una línea por destreza con su nota frente a 180. */
export function SkillLine(props: { label: string; color: string; score: number | null }) {
  const pct = props.score == null ? 0 : Math.max(0, Math.min(1, (props.score - 150) / (205 - 150)));
  const c1 = (180 - 150) / (205 - 150);
  return (
    <div class="stack" style={{ '--gap': '6px' } as JSX.CSSProperties}>
      <div class="spread">
        <span class="row" style={{ '--gap': '8px' } as JSX.CSSProperties}>
          <span style={{ width: '22px', height: '5px', borderRadius: '3px', background: props.color }} />
          <span style={{ fontWeight: 600 }}>{props.label}</span>
        </span>
        <span class="tabular" style={{ fontWeight: 700 }}>
          {props.score ?? '—'}
        </span>
      </div>
      <div style={{ position: 'relative', height: '8px', borderRadius: '4px', background: 'var(--paper-sunk)' }}>
        <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct * 100}%`, borderRadius: '4px', background: props.color }} />
        <div
          title="180"
          style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${c1 * 100}%`, width: '2px', background: 'var(--ink)' }}
        />
      </div>
    </div>
  );
}
