import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { APP_VERSION, getWorkerUrl, IS_DEMO, setWorkerUrl } from '../config';
import { profile, saveProfile, saveSettings, session, settings, signOut } from '../state';
import { parseProfile, type Profile } from '../domain/profile';
import { formatUsd, madridDay } from '../ai/pricing';
import { chainFor, DEFAULT_CHAINS, modelKey, SELECTABLE, TASK_LABELS } from '../ai/providers';
import type { ModelRef, TaskId } from '../ai/types';
import { claudeSpentThisMonth, usageForDays, type UsageDay } from '../ai/usage';
import { idToken } from '../state';
import { goBack } from '../router';
import { themePref, setTheme, type ThemePref } from '../ui/theme';
import { Band, ListItem, Page, Segmented, Spinner, toast } from '../ui/components';
import { ExtrasForm, ProfileForm } from './ProfileForm';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

/* ── Ajustes (índice) ──────────────────────────────────────────── */

export function Ajustes() {
  const s = session.value;
  const user = s.status === 'ready' ? s.user : null;
  return (
    <>
      <Band kicker="Mind the Gap · Ajustes" title="Settings" />
      <Page>
        <section class="stack" style={g(8)}>
          <span class="kicker">Tú</span>
          <div class="list">
            <ListItem title="Tus datos" sub="Perfil, idiomas y detalles para Theo («algo ha cambiado»)" to="/ajustes/perfil" />
            <ListItem title="Lo que Theo sabe de ti" sub="Su memoria: puntos fuertes, errores que repites y mini reto" to="/ajustes/theo" />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Theo e IA</span>
          <div class="list">
            <ListItem title="IA y uso" sub="Modelos por tarea, contador y gasto" to="/ajustes/ia" />
            <ListItem title="Prueba de voz" sub="Comprueba micro, audio y voces en este dispositivo" to="/ajustes/voz" />
            <ListItem title="Conexión" sub="Dirección del Worker que guarda las claves" to="/ajustes/conexion" />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Racha y XP</span>
          <label class="field">
            <span>Objetivo diario de XP</span>
            <input
              class="input"
              type="number"
              min={10}
              max={500}
              step={10}
              inputMode="numeric"
              value={settings.value.xpDailyGoal}
              onChange={async (e) => {
                const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
                if (Number.isFinite(v) && v >= 10 && v <= 500) await saveSettings({ xpDailyGoal: v });
              }}
            />
            <small>Unos 60 XP son una sesión normal de 30 minutos. La racha no depende de esto: cuenta con 10 minutos o la sesión de hoy.</small>
          </label>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Apariencia (este dispositivo)</span>
          <Segmented<ThemePref>
            label="Tema"
            value={themePref.value}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Cuenta</span>
          <div class="card flat stack" style={g(6)}>
            <span>{IS_DEMO ? 'Modo demo (datos solo en este navegador)' : user?.name || 'Sesión iniciada'}</span>
            {user && <code class="muted small" style={{ wordBreak: 'break-all' }}>UID: {user.uid}</code>}
          </div>
          {!IS_DEMO && (
            <button class="btn ghost" onClick={() => signOut()}>
              Cerrar sesión
            </button>
          )}
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Práctica oficial</span>
          <div class="list">
            <ListItem
              title="Formato oficial del C1 Advanced"
              sub="cambridgeenglish.org"
              onClick={() => window.open('https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/format/', '_blank', 'noopener')}
            />
            <ListItem
              title="Sample tests gratuitos"
              sub="Para practicar con material real"
              onClick={() => window.open('https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/', '_blank', 'noopener')}
            />
          </div>
          <p class="muted small">Mind the Gap · versión {APP_VERSION}. Todo el contenido generado es original; nada se copia de material de Cambridge.</p>
        </section>
      </Page>
    </>
  );
}

/* ── Tus datos ─────────────────────────────────────────────────── */

export function AjustesPerfil() {
  const [draft, setDraft] = useState<Profile>(() => parseProfile(profile.value ?? {}));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({ ...draft, changedAt: Date.now(), confirmedAt: draft.confirmedAt ?? Date.now() });
      toast('Guardado. Theo lo tendrá en cuenta desde ya.');
      goBack('/ajustes');
    } catch {
      toast('No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Band back="/ajustes" kicker="Ajustes · Tus datos" title="Algo ha cambiado" />
      <Page gap={22}>
        <ProfileForm draft={draft} onChange={setDraft} />
        <h3>Idiomas e intereses</h3>
        <ExtrasForm draft={draft} onChange={setDraft} which="languages" />
        <h3>Detalles para Theo</h3>
        <ExtrasForm draft={draft} onChange={setDraft} which="fun" />
        <button class="btn signal" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </Page>
    </>
  );
}

/* ── IA y uso ──────────────────────────────────────────────────── */

const label = (r: ModelRef) => `${r.provider === 'claude' ? 'Claude' : 'Gemini'} · ${r.model.replace(/^(gemini|claude)-/, '')}`;

export function AjustesIA() {
  const cfg = settings.value;
  const [days, setDays] = useState<(UsageDay & { id: string })[] | null>(null);
  const [claude, setClaude] = useState<number | null>(null);

  useEffect(() => {
    usageForDays(14).then(setDays).catch(() => setDays([]));
    claudeSpentThisMonth().then(setClaude).catch(() => setClaude(0));
  }, []);

  const today = days?.find((d) => d.id === madridDay());
  const cap = cfg.claudeMonthlyCapUsd;
  const pct = claude == null || cap === 0 ? 0 : Math.min(1, claude / cap);

  const setOverride = async (task: TaskId, key: string) => {
    const next = { ...cfg.providerOverrides };
    if (key === 'default') delete next[task];
    else {
      const first = SELECTABLE.find((r) => modelKey(r) === key)!;
      const rest = DEFAULT_CHAINS[task].filter((r) => modelKey(r) !== key);
      next[task] = [first, ...rest];
    }
    await saveSettings({ providerOverrides: next });
    toast('Guardado');
  };

  return (
    <>
      <Band back="/ajustes" kicker="Ajustes · IA" title="IA y uso" />
      <Page>
        <section class="card stack" style={g(12)}>
          <span class="kicker">Hoy</span>
          {days == null ? (
            <Spinner />
          ) : (
            <div class="spread tabular">
              <span>{today?.total?.requests ?? 0} peticiones</span>
              <span>{((today?.total?.inputTokens ?? 0) + (today?.total?.outputTokens ?? 0)).toLocaleString('es-ES')} tokens</span>
              <strong>{formatUsd(today?.total?.costUsd ?? 0)}</strong>
            </div>
          )}
          <p class="muted small">
            Con Gemini en la capa gratuita el coste real es 0 $. Precio de lista equivalente hoy: {formatUsd(today?.total?.listUsd ?? 0)}.
          </p>
        </section>

        <section class="card stack" style={g(10)}>
          <div class="spread">
            <span class="kicker">Usar Claude</span>
            <Segmented
              label="Usar Claude"
              value={cfg.claudeEnabled ? 'on' : 'off'}
              onChange={(v) => saveSettings({ claudeEnabled: v === 'on' })}
              options={[
                { value: 'off', label: 'No' },
                { value: 'on', label: 'Sí' },
              ]}
            />
          </div>
          <p class="muted small">
            Enciéndelo solo cuando hayas cargado saldo en Claude. Aun encendido, Claude nunca se usa solo: en cada corrección eliges «gratis (Gemini)» o «con Claude», y ves el coste antes.
          </p>
        </section>

        <section class="card stack" style={g(12)}>
          <div class="spread">
            <span class="kicker">Claude este mes</span>
            <span class="tabular">
              {claude == null ? '…' : formatUsd(claude)} / {cap} $
            </span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--paper-sunk)', overflow: 'hidden' }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: pct > 0.85 ? 'var(--signal)' : 'var(--ink)' }} />
          </div>
          <label class="field">
            <span>Tope mensual de Claude (USD)</span>
            <input
              class="input"
              type="number"
              min={0}
              step={1}
              inputMode="decimal"
              value={cap}
              onChange={async (e) => {
                const v = Number((e.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(v) && v >= 0) await saveSettings({ claudeMonthlyCapUsd: v });
              }}
            />
            <small>Al llegar al tope, la corrección pasa a Gemini. El tope duro está además en la consola de Anthropic (prepago sin autorrecarga).</small>
          </label>
        </section>

        <section class="card stack" style={g(10)}>
          <span class="kicker">Gemini</span>
          <Segmented
            label="Capa de Gemini"
            value={cfg.geminiTier}
            onChange={(v) => saveSettings({ geminiTier: v })}
            options={[
              { value: 'free', label: 'Capa gratuita' },
              { value: 'paid', label: 'De pago' },
            ]}
          />
          <p class="muted small">
            Solo cambia cómo se calcula el coste aquí. Pasar a pago de verdad se hace en Google AI Studio (activar facturación y un tope). Ojo: 3.8 Flash y su voz duplican precio el 1-1-2027.
          </p>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Modelo principal por tarea</span>
          <div class="list">
            {(Object.keys(TASK_LABELS) as TaskId[]).map((task) => {
              const current = chainFor(task, cfg.providerOverrides)[0];
              const overridden = !!cfg.providerOverrides[task];
              return (
                <div key={task} class="list-item" style={{ cursor: 'default' }}>
                  <span class="grow">
                    <span class="list-title" style={{ display: 'block' }}>
                      {TASK_LABELS[task]}
                    </span>
                    <span class="list-sub">Respaldo: {chainFor(task, cfg.providerOverrides).slice(1).map(label).join(' → ') || '—'}</span>
                  </span>
                  <select
                    class="select"
                    style={{ width: 'auto', minHeight: '38px', padding: '6px 8px', fontSize: '14px' }}
                    value={overridden ? modelKey(current) : 'default'}
                    onChange={(e) => setOverride(task, (e.currentTarget as HTMLSelectElement).value)}
                  >
                    <option value="default">Por defecto ({label(DEFAULT_CHAINS[task][0])})</option>
                    {SELECTABLE.map((r) => (
                      <option key={modelKey(r)} value={modelKey(r)}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Últimos días</span>
          <div class="list">
            {(days ?? []).length === 0 && <div class="list-item muted">Aún no hay uso registrado.</div>}
            {(days ?? []).map((d) => (
              <div key={d.id} class="list-item tabular" style={{ cursor: 'default' }}>
                <span class="grow">{d.id}</span>
                <span class="muted small">{d.total?.requests ?? 0} pet.</span>
                <strong style={{ minWidth: '64px', textAlign: 'right' }}>{formatUsd(d.total?.costUsd ?? 0)}</strong>
              </div>
            ))}
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Conexión (Worker) ─────────────────────────────────────────── */

export function AjustesConexion() {
  const [url, setUrl] = useState(getWorkerUrl());
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setResult(null);
    setWorkerUrl(url);
    const base = getWorkerUrl();
    try {
      const h = await fetch(`${base}/health`);
      if (!h.ok) throw new Error(`/health respondió ${h.status}`);
      const token = await idToken();
      const w = await fetch(`${base}/whoami`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = (await w.json().catch(() => ({}))) as { uid?: string; error?: { message?: string } };
      if (!w.ok) throw new Error(body.error?.message ?? `/whoami respondió ${w.status}`);
      setResult({ ok: true, text: `Conectado. El Worker te reconoce (${body.uid?.slice(0, 6)}…).` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message || 'No se ha podido conectar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Band back="/ajustes" kicker="Ajustes · Conexión" title="Worker" />
      <Page>
        <p>
          El Worker de Cloudflare guarda tus claves de Gemini y Claude y solo atiende a tu cuenta. Si la app ya viene configurada, no hace falta tocar nada.
        </p>
        <label class="field">
          <span>Dirección del Worker</span>
          <input
            class="input"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            placeholder="https://mind-the-gap.TU-SUBDOMINIO.workers.dev"
            value={url}
            onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
          />
          <small>Se guarda solo en este dispositivo. Déjalo vacío para usar la dirección por defecto.</small>
        </label>
        <button class="btn" onClick={test} disabled={busy}>
          {busy ? 'Probando…' : 'Guardar y probar'}
        </button>
        {result && <div class={`notice ${result.ok ? 'ok' : 'bad'}`}>{result.text}</div>}
      </Page>
    </>
  );
}
