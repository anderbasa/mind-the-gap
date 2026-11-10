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
  const r = ROUTES[path] ?? (/^\/practicar\/rue\/p[1-8]$/.test(path) ? { C: RuePlayer, tabs: false } : ROUTES['/']);
  return (
    <>
      <div class="statusbar-shim" />
      <div class={`shell${r.tabs ? '' : ' no-tabs'}`}>
        <r.C />
      </div>
      {r.tabs && <TabBar />}
      <ToastHost />
    </>
  );
}
