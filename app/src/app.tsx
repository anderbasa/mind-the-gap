import { useEffect } from 'preact/hooks';
import { profile, session } from './state';
import { boot } from './state';
import { route } from './router';
import { TabBar, ToastHost } from './ui/components';
import { Login, Splash } from './screens/Login';
import { Unauthorized } from './screens/Unauthorized';
import { Onboarding } from './screens/Onboarding';
import { Hoy, Practicar, Progreso, Vocabulario } from './screens/Tabs';
import { Ajustes, AjustesConexion, AjustesIA, AjustesPerfil } from './screens/Ajustes';
import { ChatTheo } from './screens/ChatTheo';
import { PruebaVoz } from './screens/PruebaVoz';
import { RueHub } from './screens/rue/RueHub';
import { RuePlayer } from './screens/rue/RuePlayer';
import { WritingHub } from './screens/writing/WritingHub';
import { WritingEditor } from './screens/writing/WritingEditor';
import { WritingView } from './screens/writing/WritingView';
import { WritingLanguage } from './screens/writing/WritingLanguage';
import { Reformular } from './screens/writing/Reformular';
import { DimeloMejor } from './screens/writing/DimeloMejor';
import { Escuchar, ListeningHub } from './screens/listening/ListeningHub';
import { ListeningPlayer } from './screens/listening/ListeningPlayer';
import { Dictados, HablaReal } from './screens/listening/ListeningTools';
import { SpeakingHub } from './screens/speaking/SpeakingHub';
import { MockExam } from './screens/speaking/MockExam';
import { SpeakingFeedback } from './screens/speaking/SpeakingFeedback';
import { LongTurn } from './screens/speaking/LongTurn';
import { Conversation } from './screens/speaking/Conversation';
import { Diagnostico } from './screens/Diagnostico';
import { TheoNotes } from './screens/TheoNotes';
import { Cuaderno } from './screens/Cuaderno';
import { Sesion } from './screens/Sesion';
import { Informe } from './screens/Informe';
import { Repaso } from './screens/Repaso';
import { Simulacro, SimulacroImprimir, SimulacroRespuestas } from './screens/Simulacro';
import { Listo } from './screens/Listo';
import { Logros } from './screens/Racha';
import { GramaticaHub, GramaticaPunto, IdiomsGame, OrdenPalabras } from './screens/Gramatica';
import type { ComponentType } from 'preact';

const ROUTES: Record<string, { C: ComponentType; tabs: boolean }> = {
  '/': { C: Hoy, tabs: true },
  '/practicar': { C: Practicar, tabs: true },
  '/vocabulario': { C: Vocabulario, tabs: true },
  '/progreso': { C: Progreso, tabs: true },
  '/ajustes': { C: Ajustes, tabs: true },
  '/ajustes/perfil': { C: AjustesPerfil, tabs: false },
  '/ajustes/ia': { C: AjustesIA, tabs: false },
  '/ajustes/conexion': { C: AjustesConexion, tabs: false },
  '/ajustes/voz': { C: PruebaVoz, tabs: false },
  '/theo': { C: ChatTheo, tabs: false },
  '/practicar/rue': { C: RueHub, tabs: false },
  '/practicar/writing': { C: WritingHub, tabs: false },
  '/practicar/writing/escribir': { C: WritingEditor, tabs: false },
  '/practicar/writing/ver': { C: WritingView, tabs: false },
  '/practicar/writing/lenguaje': { C: WritingLanguage, tabs: false },
  '/practicar/reformular': { C: Reformular, tabs: false },
  '/practicar/dimelo': { C: DimeloMejor, tabs: false },
  '/practicar/listening': { C: ListeningHub, tabs: false },
  '/practicar/listening/dictados': { C: Dictados, tabs: false },
  '/practicar/listening/habla-real': { C: HablaReal, tabs: false },
  '/practicar/listening/escuchar': { C: Escuchar, tabs: false },
  '/practicar/speaking': { C: SpeakingHub, tabs: false },
  '/practicar/speaking/simulacro': { C: MockExam, tabs: false },
  '/practicar/speaking/ver': { C: SpeakingFeedback, tabs: false },
  '/practicar/speaking/long-turn': { C: LongTurn, tabs: false },
  '/practicar/speaking/conversacion': { C: Conversation, tabs: false },
  '/diagnostico': { C: Diagnostico, tabs: false },
  '/ajustes/theo': { C: TheoNotes, tabs: false },
  '/cuaderno': { C: Cuaderno, tabs: false },
  '/sesion': { C: Sesion, tabs: false },
  '/informe': { C: Informe, tabs: false },
  '/vocabulario/repaso': { C: Repaso, tabs: false },
  '/practicar/gramatica': { C: GramaticaHub, tabs: false },
  '/practicar/gramatica/punto': { C: GramaticaPunto, tabs: false },
  '/practicar/gramatica/orden': { C: OrdenPalabras, tabs: false },
  '/practicar/gramatica/idioms': { C: IdiomsGame, tabs: false },
  '/simulacro': { C: Simulacro, tabs: false },
  '/simulacro/imprimir': { C: SimulacroImprimir, tabs: false },
  '/simulacro/respuestas': { C: SimulacroRespuestas, tabs: false },
  '/listo': { C: Listo, tabs: false },
  '/logros': { C: Logros, tabs: false },
};

export function App() {
  useEffect(() => {
    void boot();
  }, []);

  const s = session.value;
  if (s.status === 'loading') return <Splash />;
  if (s.status === 'signedOut') return <Login />;
  if (s.status === 'unauthorized') return <Unauthorized />;
  if (!profile.value) return <Splash />;
  if (!profile.value.confirmedAt) return <Onboarding />;

  const path = route.value.path;
  const r =
    ROUTES[path] ??
    (/^\/practicar\/rue\/p[1-8]$/.test(path)
      ? { C: RuePlayer, tabs: false }
      : /^\/practicar\/listening\/l[1-4]$/.test(path)
        ? { C: ListeningPlayer, tabs: false }
        : ROUTES['/']);
  return (
    <>
      <div class="statusbar-shim" />
      <div class={`shell${r.tabs ? '' : ' no-tabs'}`}>
        <r.C key={path} />
      </div>
      {r.tabs && <TabBar />}
      <ToastHost />
    </>
  );
}
