import { supabase } from './supabase.js';

const CACHE_KEY = 'mizona.session.profile.v4';
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
let currentPromise = null;
let listenerReady = false;

function clean(value) { return String(value ?? '').trim(); }
function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!data?.savedAt || Date.now() - data.savedAt > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function writeCache(snapshot) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() })); } catch {}
}
export function clearSessionSnapshot() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  document.documentElement.dataset.authState = 'guest';
}

export function canonicalProfile(user, profile = {}) {
  const username = clean(profile.username || user?.user_metadata?.username).replace(/^@/, '');
  const fullName = clean(
    profile.nombre_visible || profile.full_name || user?.user_metadata?.full_name ||
    user?.user_metadata?.nombre_visible || username || 'Usuario'
  );
  const firstName = fullName.split(/\s+/)[0] || username || 'Usuario';
  const district = clean(profile.distrito || profile.zona || '');
  return {
    userId: user?.id || null,
    email: user?.email || '',
    fullName,
    firstName,
    username,
    publicHandle: username ? `@${username}` : '',
    district,
    avatarUrl: clean(profile.avatar_url),
    phoneVerified: profile.telefono_verificado === true,
    providerStatus: clean(profile.proveedor_estado || 'no_solicitado'),
    providerType: clean(profile.proveedor_tipo || ''),
    accountType: clean(profile.tipo_cuenta || 'personal') || 'personal',
    profileType: clean(profile.tipo_perfil || 'vecino') || 'vecino',
    profilePrivacy: clean(profile.privacidad_perfil || 'publico') || 'publico'
  };
}

export function getCachedSessionSnapshot() {
  const cache = readCache();
  return cache?.userId ? cache : null;
}

export function paintCachedIdentity(root = document) {
  const snap = getCachedSessionSnapshot();
  if (!snap) return null;
  document.documentElement.dataset.authState = 'logged';
  document.body?.classList.add('estado-logged');
  document.body?.classList.remove('estado-guest', 'auth-pending');
  root.querySelectorAll('[data-mz-name],#sb-name,#mz3SideName').forEach(el => el.textContent = snap.fullName);
  root.querySelectorAll('[data-mz-first-name],#mz3TopName').forEach(el => el.textContent = snap.firstName);
  root.querySelectorAll('[data-mz-username]').forEach(el => el.textContent = snap.publicHandle || snap.fullName);
  root.querySelectorAll('[data-mz-zone],#sb-dist,#mz3SideMeta').forEach(el => el.textContent = snap.publicHandle || snap.district || 'Mi zona');
  root.querySelectorAll('#mz3Zone').forEach(el => el.textContent = snap.district || 'Mi zona');
  return snap;
}

function installAuthListener() {
  if (listenerReady) return;
  listenerReady = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) clearSessionSnapshot();
    currentPromise = null;
    window.dispatchEvent(new CustomEvent('mizona:auth-change', { detail: { event, user: session?.user || null } }));
  });
}

export async function getSessionSnapshot({ force = false } = {}) {
  installAuthListener();
  if (!force && currentPromise) return currentPromise;
  currentPromise = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user || null;
    if (!user) {
      clearSessionSnapshot();
      return null;
    }
    let profile = {};
    let { data, error } = await supabase
      .from('perfiles')
      .select('id,nombre_visible,username,avatar_url,distrito,zona,telefono_verificado,proveedor_estado,proveedor_tipo,tipo_cuenta,tipo_perfil,privacidad_perfil')
      .eq('id', user.id)
      .maybeSingle();
    // Durante una actualización progresiva, conserva la identidad estable aun si
    // las columnas nuevas todavía no fueron creadas en Supabase.
    if (error) {
      const fallback = await supabase
        .from('perfiles')
        .select('id,nombre_visible,username,avatar_url,distrito,zona,telefono_verificado,tipo_cuenta')
        .eq('id', user.id)
        .maybeSingle();
      data = fallback.data; error = fallback.error;
    }
    if (!error && data) profile = data;
    const snapshot = canonicalProfile(user, profile);
    writeCache(snapshot);
    document.documentElement.dataset.authState = 'logged';
    document.body?.classList.add('estado-logged');
    document.body?.classList.remove('estado-guest', 'auth-pending');
    return snapshot;
  })().finally(() => { setTimeout(() => { currentPromise = null; }, 1500); });
  return currentPromise;
}

export async function refreshSessionSnapshot() { return getSessionSnapshot({ force: true }); }
