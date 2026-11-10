import { session, signOut } from '../state';
import { toast } from '../ui/components';

/** Primer login: la cuenta aún no está en las reglas. Muestra el UID para autorizarla. */
export function Unauthorized() {
  const s = session.value;
  const uid = s.status === 'unauthorized' ? s.user.uid : '';
  return (
    <div class="center-screen">
      <div class="stack" style={{ '--gap': '18px', maxWidth: '440px', width: '100%' }}>
        <span class="kicker">Casi estamos</span>
        <h1 style={{ fontSize: '34px' }}>Tu cuenta aún no está autorizada</h1>
        <p class="read">
          Por seguridad, la base de datos solo acepta un usuario. Has entrado bien con Google; ahora falta apuntar tu identificador en las reglas.
        </p>
        <div class="card flat stack" style={{ '--gap': '8px' }}>
          <span class="kicker">Tu UID</span>
          <code style={{ fontSize: '15px', wordBreak: 'break-all' }}>{uid}</code>
          <button
            class="btn quiet small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(uid);
                toast('UID copiado');
              } catch {
                toast('No se ha podido copiar: selecciónalo a mano');
              }
            }}
          >
            Copiar UID
          </button>
        </div>
        <p class="muted">Díselo a Claude («ya he entrado») y él lo añade a las reglas y al Worker. Después, recarga esta página.</p>
        <button class="btn ghost" onClick={() => location.reload()}>
          Recargar
        </button>
        <button class="linkbtn" onClick={() => signOut()}>
          Entrar con otra cuenta
        </button>
      </div>
    </div>
  );
}
