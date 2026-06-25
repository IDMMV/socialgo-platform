import { PUBLIC_ENV } from "./env.public.js";
import { supabase, getCurrentUser } from "./supabase.js";

const APP_ID = String(PUBLIC_ENV.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_SCRIPT_ID = "mizona-onesignal-sdk";
const WORKER_PATH = "OneSignalSDKWorker.js";
const WORKER_SCOPE = "/";

let initPromise = null;
let sdkInstance = null;
let listenersInstalled = false;
let authListenerInstalled = false;

const DEFAULT_PREFERENCES = Object.freeze({
  alertas_activas: true,
  categorias_alerta: ["robo", "accidente", "agua", "luz", "mascota", "persona", "incendio"],
  radio_metros: 500,
  solo_verificadas: false,
  alertas_seguidas: true,
  cambios_estado_alerta: true,
  confirmaciones_alerta: true,
  mensajes: true,
  amistades: true,
  negocios: true,
  ofertas: false,
  resumen_frecuencia: "inmediato",
  horario_silencioso_inicio: "22:00",
  horario_silencioso_fin: "07:00",
  emergencias_en_silencio: true,
  zona_horaria: "America/Lima"
});

export function isOneSignalConfigured() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(APP_ID);
}

function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadSdkScript() {
  if (window.OneSignal) return Promise.resolve();
  const existing = document.getElementById(ONESIGNAL_SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(makeError("No se pudo cargar OneSignal.", "sdk_load_failed")), { once: true });
      if (window.OneSignalDeferred) setTimeout(resolve, 0);
    });
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = ONESIGNAL_SCRIPT_ID;
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(makeError("No se pudo cargar OneSignal.", "sdk_load_failed"));
    document.head.appendChild(script);
  });
}

function getSdkInstance() {
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const timeout = setTimeout(() => reject(makeError("OneSignal tardó demasiado en iniciar.", "sdk_timeout")), 15000);
    window.OneSignalDeferred.push(function (OneSignal) {
      clearTimeout(timeout);
      resolve(OneSignal);
    });
  });
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function deviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Navegador";
  if (/Edg\//.test(ua)) browser = "Microsoft Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Google Chrome";
  else if (/Firefox\//.test(ua)) browser = "Mozilla Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let sistema = "Otro";
  if (/Android/.test(ua)) sistema = "Android";
  else if (isIos()) sistema = "iOS/iPadOS";
  else if (/Windows/.test(ua)) sistema = "Windows";
  else if (/Mac OS X/.test(ua)) sistema = "macOS";
  else if (/Linux/.test(ua)) sistema = "Linux";

  const tipo = /Mobi|Android|iPhone|iPad|iPod/.test(ua) ? "celular" : "computadora";
  return {
    navegador: browser,
    sistema_operativo: sistema,
    tipo_dispositivo: tipo,
    etiqueta: `${tipo === "celular" ? "Celular" : "Computadora"} · ${browser}`
  };
}

async function ensurePreferenceRow(userId) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "42P01") throw error;
  if (data) return;

  const { error: insertError } = await supabase
    .from("notification_preferences")
    .insert({ user_id: userId, ...DEFAULT_PREFERENCES });
  if (insertError && insertError.code !== "23505") throw insertError;
}

async function markOpenedFromUrl() {
  const eventId = Number(new URLSearchParams(location.search).get("push_event") || 0);
  if (!eventId) return;
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.rpc("mizona_mark_push_opened", { p_event_id: eventId }).catch(() => {});
}

async function syncIdentity(OneSignal = sdkInstance) {
  if (!OneSignal) return null;
  const user = await getCurrentUser();
  if (user) {
    await OneSignal.login(user.id);
    await ensurePreferenceRow(user.id).catch(() => {});
    return user;
  }

  try {
    if (OneSignal.User?.externalId) await OneSignal.logout();
  } catch (_) {}
  return null;
}

async function syncCurrentDevice({ location = null } = {}) {
  if (!sdkInstance) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const subscriptionId = sdkInstance.User?.PushSubscription?.id || null;
  const token = sdkInstance.User?.PushSubscription?.token || null;
  const optedIn = Boolean(sdkInstance.User?.PushSubscription?.optedIn);
  const permission = Boolean(sdkInstance.Notifications?.permission);

  if (!subscriptionId) return null;

  const info = deviceInfo();
  const payload = {
    user_id: user.id,
    provider: "onesignal",
    subscription_id: subscriptionId,
    push_token: token,
    permiso: permission ? "granted" : ((typeof Notification !== "undefined" && Notification.permission) || "default"),
    activo: permission && optedIn,
    navegador: info.navegador,
    sistema_operativo: info.sistema_operativo,
    tipo_dispositivo: info.tipo_dispositivo,
    etiqueta: info.etiqueta,
    user_agent: navigator.userAgent.slice(0, 500),
    ultimo_acceso: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: deviceId, error } = await supabase.rpc("mizona_register_push_device", {
    p_subscription_id: payload.subscription_id,
    p_push_token: payload.push_token,
    p_permiso: payload.permiso,
    p_activo: payload.activo,
    p_navegador: payload.navegador,
    p_sistema_operativo: payload.sistema_operativo,
    p_tipo_dispositivo: payload.tipo_dispositivo,
    p_etiqueta: payload.etiqueta,
    p_user_agent: payload.user_agent
  });
  if (error) throw error;

  const { data } = await supabase
    .from("push_devices")
    .select("*")
    .eq("id", deviceId)
    .maybeSingle();

  if (location?.lat != null && location?.lng != null) {
    await supabase
      .from("notification_preferences")
      .update({
        latitud: location.lat,
        longitud: location.lng,
        ubicacion_actualizada_en: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id);
  }

  return data;
}

function installSdkListeners(OneSignal) {
  if (listenersInstalled) return;
  listenersInstalled = true;

  const sync = () => syncCurrentDevice().catch(error => console.info("MiZona Push: no se pudo sincronizar el dispositivo.", error?.message || error));
  OneSignal.User?.PushSubscription?.addEventListener?.("change", sync);
  OneSignal.Notifications?.addEventListener?.("permissionChange", sync);
}

function installAuthListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!sdkInstance) return;
    try {
      if (session?.user) {
        await sdkInstance.login(session.user.id);
        await ensurePreferenceRow(session.user.id);
        await syncCurrentDevice();
      } else {
        await sdkInstance.logout();
      }
    } catch (error) {
      console.info("MiZona Push: no se pudo actualizar la identidad.", error?.message || error);
    }
  });
}

async function verifyWorkerFile(){
  const response=await fetch(`/${WORKER_PATH}`,{cache:"no-store"});
  if(!response.ok) throw makeError(`No se encontró /${WORKER_PATH} (HTTP ${response.status}). Sube el archivo a la raíz de MiZona.`,"worker_missing");
  const type=String(response.headers.get("content-type")||"");
  if(!/javascript|ecmascript/i.test(type)) throw makeError(`El servidor devolvió un tipo inválido para /${WORKER_PATH}: ${type||"sin Content-Type"}.`,"worker_mime");
  return true;
}

export async function bootstrapPushNotifications() {
  if (!isOneSignalConfigured()) {
    return { configured: false, reason: "missing_app_id" };
  }
  if (!window.isSecureContext && location.hostname !== "localhost") {
    throw makeError("Las notificaciones requieren HTTPS.", "https_required");
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await verifyWorkerFile();
    await loadSdkScript();
    const OneSignal = await getSdkInstance();
    await OneSignal.init({
      appId: APP_ID,
      serviceWorkerPath: WORKER_PATH,
      serviceWorkerParam: { scope: WORKER_SCOPE },
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true
    });
    sdkInstance = OneSignal;
    installSdkListeners(OneSignal);
    installAuthListener();
    await syncIdentity(OneSignal);
    await markOpenedFromUrl();
    await syncCurrentDevice().catch(() => null);
    return { configured: true, OneSignal };
  })();

  return initPromise;
}

function getCurrentLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

export async function requestPushPermission({ saveLocation = true } = {}) {
  if (!isOneSignalConfigured()) throw makeError("Primero configura el App ID de OneSignal.", "missing_app_id");
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión para activar notificaciones.", "login_required");
  const { data: profile } = await supabase.from("perfiles").select("telefono_verificado").eq("id", user.id).maybeSingle();
  if (!profile?.telefono_verificado) throw makeError("Verifica tu celular antes de activar notificaciones.", "phone_verification_required");
  if (isIos() && !isStandalone()) {
    throw makeError("En iPhone o iPad, agrega MiZona a la pantalla de inicio y ábrela desde su icono.", "ios_install_required");
  }

  const { OneSignal } = await bootstrapPushNotifications();
  await OneSignal.login(user.id);
  await OneSignal.Notifications.requestPermission();

  if (!OneSignal.Notifications.permission) {
    throw makeError("El permiso de notificaciones no fue concedido.", "permission_denied");
  }

  if (!OneSignal.User.PushSubscription.optedIn) {
    await OneSignal.User.PushSubscription.optIn();
  }

  const location = saveLocation ? await getCurrentLocation() : null;
  const device = await syncCurrentDevice({ location });
  return { ok: true, device, location, status: await getPushStatus() };
}

export async function disablePushOnThisDevice() {
  const { OneSignal } = await bootstrapPushNotifications();
  const subscriptionId = OneSignal.User?.PushSubscription?.id;
  await OneSignal.User.PushSubscription.optOut();
  if (subscriptionId) {
    await supabase
      .from("push_devices")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("provider", "onesignal")
      .eq("subscription_id", subscriptionId);
  }
  return getPushStatus();
}

export async function getPushStatus() {
  if (!isOneSignalConfigured()) {
    return { configured: false, supported: false, permission: false, optedIn: false, subscriptionId: null };
  }
  const { OneSignal } = await bootstrapPushNotifications();
  const supported = Boolean(OneSignal.Notifications.isPushSupported());
  return {
    configured: true,
    supported,
    permission: Boolean(OneSignal.Notifications.permission),
    browserPermission: (typeof Notification !== "undefined" ? Notification.permission : "unsupported"),
    optedIn: Boolean(OneSignal.User?.PushSubscription?.optedIn),
    subscriptionId: OneSignal.User?.PushSubscription?.id || null,
    ios: isIos(),
    standalone: isStandalone()
  };
}

export async function getNotificationPreferences() {
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión.", "login_required");
  await ensurePreferenceRow(user.id);
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return { ...DEFAULT_PREFERENCES, ...data };
}

export async function saveNotificationPreferences(values) {
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión.", "login_required");
  const allowed = {
    alertas_activas: Boolean(values.alertas_activas),
    categorias_alerta: Array.isArray(values.categorias_alerta) ? values.categorias_alerta : DEFAULT_PREFERENCES.categorias_alerta,
    radio_metros: Math.max(500, Math.min(20000, Number(values.radio_metros || 500))),
    solo_verificadas: Boolean(values.solo_verificadas),
    alertas_seguidas: values.alertas_seguidas !== false,
    cambios_estado_alerta: values.cambios_estado_alerta !== false,
    confirmaciones_alerta: Boolean(values.confirmaciones_alerta),
    mensajes: Boolean(values.mensajes),
    amistades: Boolean(values.amistades),
    negocios: Boolean(values.negocios),
    ofertas: Boolean(values.ofertas),
    resumen_frecuencia: ["inmediato", "diario", "solo_emergencias", "desactivado"].includes(values.resumen_frecuencia)
      ? values.resumen_frecuencia
      : "inmediato",
    horario_silencioso_inicio: values.horario_silencioso_inicio || null,
    horario_silencioso_fin: values.horario_silencioso_fin || null,
    emergencias_en_silencio: Boolean(values.emergencias_en_silencio),
    zona_horaria: values.zona_horaria || "America/Lima",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, ...allowed }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listPushDevices() {
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión.", "login_required");
  const { data, error } = await supabase
    .from("push_devices")
    .select("id,subscription_id,etiqueta,navegador,sistema_operativo,tipo_dispositivo,permiso,activo,ultimo_acceso,created_at")
    .eq("user_id", user.id)
    .order("ultimo_acceso", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function removePushDevice(deviceId) {
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión.", "login_required");
  const { error } = await supabase
    .from("push_devices")
    .delete()
    .eq("id", deviceId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function refreshNotificationLocation() {
  const user = await getCurrentUser();
  if (!user) throw makeError("Debes iniciar sesión.", "login_required");
  const location = await getCurrentLocation();
  if (!location) throw makeError("No fue posible obtener tu ubicación.", "location_unavailable");
  await ensurePreferenceRow(user.id);
  const { error } = await supabase
    .from("notification_preferences")
    .update({
      latitud: location.lat,
      longitud: location.lng,
      ubicacion_actualizada_en: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id);
  if (error) throw error;
  return location;
}

window.MiZonaPush = {
  bootstrap: bootstrapPushNotifications,
  requestPermission: requestPushPermission,
  disableCurrentDevice: disablePushOnThisDevice,
  getStatus: getPushStatus,
  getPreferences: getNotificationPreferences,
  savePreferences: saveNotificationPreferences,
  listDevices: listPushDevices,
  removeDevice: removePushDevice,
  refreshLocation: refreshNotificationLocation,
  isConfigured: isOneSignalConfigured
};
