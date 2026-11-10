// Genera iconos, favicon y pantallas de arranque de iPhone a partir de SVG.
// Uso: npm run icons   (desde la raíz del repo)
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'app', 'public');
const iconsDir = join(pub, 'icons');
const splashDir = join(pub, 'splash');
mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

const NAVY = '#14213D';
const NIGHT = '#0E1525';
const CREAM = '#F6F1E7';
const RED = '#C8102E';

/** El motivo: una línea que llega desde la izquierda, el hueco en rojo y la estación C1. */
function motif({ scale = 1, line = CREAM, bg = NAVY } = {}) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `
  <g transform="${t}">
    <rect x="-40" y="228" width="214" height="56" rx="28" fill="${line}"/>
    <rect x="198" y="243" width="26" height="26" rx="6" fill="${RED}"/>
    <rect x="243" y="243" width="26" height="26" rx="6" fill="${RED}"/>
    <rect x="288" y="243" width="26" height="26" rx="6" fill="${RED}"/>
    <rect x="330" y="228" width="40" height="56" fill="${line}"/>
    <circle cx="392" cy="256" r="60" fill="${bg}" stroke="${line}" stroke-width="26"/>
    <circle cx="392" cy="256" r="21" fill="${RED}"/>
  </g>`;
}

const icon = ({ size = 512, scale = 1, rounded = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${rounded ? `<rect width="512" height="512" rx="112" fill="${NAVY}"/>` : `<rect width="512" height="512" fill="${NAVY}"/>`}
  ${motif({ scale })}
</svg>`;

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
}

// Iconos
writeFileSync(join(iconsDir, 'icon-512.png'), png(icon({ scale: 0.86 }), 512));
writeFileSync(join(iconsDir, 'icon-192.png'), png(icon({ scale: 0.86 }), 192));
writeFileSync(join(iconsDir, 'icon-maskable-512.png'), png(icon({ scale: 0.7 }), 512));
writeFileSync(join(iconsDir, 'apple-touch-icon.png'), png(icon({ scale: 0.86 }), 180));
writeFileSync(join(iconsDir, 'favicon-32.png'), png(icon({ scale: 0.95, rounded: true }), 32));
writeFileSync(join(iconsDir, 'favicon.svg'), icon({ scale: 0.95, rounded: true }).trim());



// Pantallas de arranque (iPhone): [ancho CSS, alto CSS, densidad]
const DEVICES = [
  [375, 667, 2],
  [414, 896, 2],
  [414, 896, 3],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [428, 926, 3],
  [430, 932, 3],
  [402, 874, 3],
  [420, 912, 3],
  [440, 956, 3],
];

function splash(w, h, dark) {
  const bg = dark ? NIGHT : CREAM;
  const ink = dark ? CREAM : NAVY;
  const s = Math.min(w, h) / 512;
  const motifW = 512 * s * 0.62;
  const x = (w - motifW) / 2;
  const y = h * 0.42 - motifW / 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <svg x="${x}" y="${y}" width="${motifW}" height="${motifW}" viewBox="0 0 512 512">${motif({ line: ink, bg })}</svg>
  <text x="${w / 2}" y="${h * 0.42 + motifW * 0.48}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${w * 0.085}" fill="${ink}">Mind the Gap</text>
</svg>`;
}

const links = [];
for (const [cw, ch, dpr] of DEVICES) {
  const w = cw * dpr;
  const h = ch * dpr;
  for (const mode of ['light', 'dark']) {
    const file = `splash-${w}x${h}-${mode}.png`;
    writeFileSync(join(splashDir, file), png(splash(w, h, mode === 'dark'), w));
    links.push(
      `    <link rel="apple-touch-startup-image" href="splash/${file}" media="(prefers-color-scheme: ${mode}) and (device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
    );
  }
}

// Inserta los enlaces en index.html entre los marcadores
const indexPath = join(root, 'app', 'index.html');
const html = readFileSync(indexPath, 'utf8');
const block = `<!-- SPLASH -->\n${links.join('\n')}\n    <!-- /SPLASH -->`;
const next = /<!-- SPLASH -->[\s\S]*?<!-- \/SPLASH -->/.test(html)
  ? html.replace(/<!-- SPLASH -->[\s\S]*?<!-- \/SPLASH -->/, block)
  : html.replace('<!-- SPLASH -->', block);
writeFileSync(indexPath, next);

console.log(`Iconos en ${iconsDir}\n${links.length} pantallas de arranque en ${splashDir}`);
