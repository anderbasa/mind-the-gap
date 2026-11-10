// Proveedor falso para el modo demo (localhost?demo): permite probar la interfaz sin IA real.
import { AiError, type AiRequest, type ModelRef, type ProviderOutput } from './types';

export async function mockProvider(ref: ModelRef, req: AiRequest): Promise<ProviderOutput> {
  await new Promise((r) => setTimeout(r, 450));
  const last = req.messages.at(-1)?.parts.find((p) => 'text' in p) as { text: string } | undefined;
  const said = last?.text ?? '';
  if (req.schema) throw new AiError('invalid-output', 'El modo demo no genera JSON.');
  const text =
    req.task === 'explain-es'
      ? `(demo) En castellano: Theo te está diciendo, más o menos, lo siguiente sobre «${said.slice(0, 60)}…».`
      : `(demo · ${ref.model}) Right then — you said “${said.slice(0, 80)}”. In the real app I'd answer properly; this is just the demo talking.`;
  return {
    text,
    usage: { inputTokens: 1200, outputTokens: 80, audioInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}
