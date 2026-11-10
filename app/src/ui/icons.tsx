// Iconos de línea (24×24, trazo = currentColor)
import type { JSX } from 'preact';

type P = JSX.SVGAttributes<SVGSVGElement>;

const base = (props: P, children: JSX.Element | JSX.Element[]) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const IconToday = (p: P) =>
  base(p, [<circle cx="12" cy="12" r="4.6" />, <path d="M2.5 12h5M16.5 12h5" />]);
export const IconPractice = (p: P) =>
  base(p, [<path d="M4.5 19.5l1-4.2L16.3 4.5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z" />, <path d="M14 7l3 3" />]);
export const IconVocab = (p: P) =>
  base(p, [<rect x="3.5" y="7" width="13" height="13.5" rx="2.2" />, <path d="M7.5 3.5h10.8a2.2 2.2 0 0 1 2.2 2.2v10.8" />]);
export const IconProgress = (p: P) =>
  base(p, [<path d="M3 18l5.5-5.5 4 3L21 7" />, <circle cx="8.5" cy="12.5" r="1.4" fill="currentColor" />, <circle cx="12.5" cy="15.5" r="1.4" fill="currentColor" />]);
export const IconSettings = (p: P) =>
  base(p, [<path d="M4 7h9M18 7h2M4 17h3M12 17h8" />, <circle cx="15.5" cy="7" r="2.4" />, <circle cx="9.5" cy="17" r="2.4" />]);
export const IconChevron = (p: P) => base(p, <path d="M9.5 5.5L16 12l-6.5 6.5" />);
export const IconBack = (p: P) => base(p, <path d="M14.5 5.5L8 12l6.5 6.5" />);
export const IconMic = (p: P) =>
  base(p, [<rect x="9" y="3" width="6" height="11" rx="3" />, <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />]);
export const IconPlay = (p: P) => base(p, <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />);
export const IconStop = (p: P) => base(p, <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />);
export const IconSend = (p: P) => base(p, [<path d="M4 12l16-7.5L13.5 20l-2.3-6.2z" />, <path d="M11.2 13.8L20 4.5" />]);
export const IconSpeaker = (p: P) =>
  base(p, [<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />, <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />]);
export const IconTheo = (p: P) =>
  base(p, [<path d="M4.5 18.5V7.8A3.3 3.3 0 0 1 7.8 4.5h8.4a3.3 3.3 0 0 1 3.3 3.3v5.4a3.3 3.3 0 0 1-3.3 3.3H9z" />, <path d="M8.5 9.5h7M8.5 12.5h4.5" />]);
export const IconCheck = (p: P) => base(p, <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconCross = (p: P) => base(p, <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
