// Formato mínimo para los textos de Theo: párrafos, listas «- » y **negrita».
// Se construyen nodos de Preact (nunca innerHTML), así que no hay riesgo de inyección.
import type { ComponentChildren } from 'preact';

function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich(props: { text: string; class?: string }) {
  const blocks = props.text.trim().split(/\n{2,}/);
  return (
    <div class={props.class} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <>
                {j > 0 && <br />}
                {inline(l)}
              </>
            ))}
          </p>
        );
      })}
    </div>
  );
}
