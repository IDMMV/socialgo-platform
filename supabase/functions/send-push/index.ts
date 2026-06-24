import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mizona-webhook-secret",
};

type NotificationEvent = {
  id: number;
  event_type: string;
  actor_id: string | null;
  recipient_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  categoria: string | null;
  latitud: number | null;
  longitud: number | null;
  prioridad: "normal" | "high" | "critical";
  titulo: string;
  cuerpo: string;
  url: string;
  payload: Record<string, unknown>;
  estado: string;
  intentos?: number;
};

type Preferences = {
  user_id: string;
  alertas_activas?: boolean;
  confirmaciones_alerta?: boolean;
  mensajes?: boolean;
  amistades?: boolean;
  negocios?: boolean;
  ofertas?: boolean;
  resumen_frecuencia?: string;
  horario_silencioso_inicio?: string | null;
  horario_silencioso_fin?: string | null;
  emergencias_en_silencio?: boolean;
  zona_horaria?: string;
};

function readServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return secretKeys.default || Object.values(secretKeys)[0] || "";
  } catch {
    return "";
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = readServiceKey();
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") || "";
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("MIZONA_WEBHOOK_SECRET") || "";
const SITE_URL = (Deno.env.get("MIZONA_SITE_URL") || "https://mizona.pe").replace(/\/$/, "");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function absoluteUrl(path: string | null | undefined) {
  if (!path) return `${SITE_URL}/notificaciones.html`;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}/${path.replace(/^\//, "")}`;
}

function pushUrl(event: NotificationEvent) {
  const url = new URL(absoluteUrl(event.url));
  url.searchParams.set("push_event", String(event.id));
  return url.toString();
}

function toMinutes(value?: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function localMinutes(timeZone = "America/Lima") {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
    return hour * 60 + minute;
  } catch {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function inQuietHours(pref: Preferences) {
  const start = toMinutes(pref.horario_silencioso_inicio);
  const end = toMinutes(pref.horario_silencioso_fin);
  if (start == null || end == null || start === end) return false;
  const now = localMinutes(pref.zona_horaria || "America/Lima");
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function preferenceAllows(event: NotificationEvent, pref: Preferences | null) {
  if (!pref) return true;
  if (pref.resumen_frecuencia === "desactivado") return false;
  if (pref.resumen_frecuencia === "solo_emergencias" && event.prioridad !== "critical") return false;

  if (event.event_type === "alerta_confirmada" && pref.confirmaciones_alerta === false) return false;
  if (event.event_type === "social_mensaje" && pref.mensajes === false) return false;
  if (["social_solicitud_amistad", "social_amistad_aceptada"].includes(event.event_type) && pref.amistades === false) return false;
  if (event.event_type.startsWith("negocio_") && pref.negocios === false) return false;
  if (event.event_type.startsWith("oferta_") && pref.ofertas === false) return false;

  if (inQuietHours(pref)) {
    if (event.prioridad === "critical" && pref.emergencias_en_silencio !== false) return true;
    return false;
  }
  return true;
}

async function fetchEvent(body: Record<string, unknown>): Promise<NotificationEvent | null> {
  const webhookRecord = body.record as NotificationEvent | undefined;
  if (webhookRecord?.id) return webhookRecord;

  const eventId = Number(body.event_id || body.id || 0);
  if (!eventId) return null;
  const { data, error } = await supabase
    .from("notification_events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return data as NotificationEvent;
}


async function applyNotificationPreferences(userIds: string[], event: NotificationEvent): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id,solo_verificadas,alertas_seguidas,cambios_estado_alerta,confirmaciones_alerta")
    .in("user_id", userIds);
  if (error) return userIds;
  const byUser = new Map((data || []).map((row: any) => [String(row.user_id), row]));
  return userIds.filter((id) => {
    const pref: any = byUser.get(String(id));
    if (!pref) return true;
    if (event.event_type === "alerta_nueva" && pref.solo_verificadas === true) return false;
    if (event.event_type === "alerta_confirmada" && pref.confirmaciones_alerta === false) return false;
    if (["alerta_verificada","alerta_resuelta","alerta_falsa","alerta_ocultada"].includes(event.event_type) && pref.cambios_estado_alerta === false) return false;
    if (event.event_type === "alerta_seguida_actualizada" && pref.alertas_seguidas === false) return false;
    return true;
  });
}

async function recipientsForEvent(event: NotificationEvent): Promise<string[]> {
  if (event.recipient_id) return applyNotificationPreferences([event.recipient_id], event);

  const directTargetUsers = event.payload?.target_user_ids;
  if (Array.isArray(directTargetUsers)) {
    return applyNotificationPreferences(Array.from(new Set<string>(directTargetUsers.map(String))), event);
  }

  if (event.event_type.startsWith("alerta_") && event.latitud != null && event.longitud != null && event.categoria) {
    const maxRadius = event.event_type === "alerta_nueva"
      ? (event.prioridad === "critical" ? 1500 : 1000)
      : event.event_type === "alerta_verificada"
        ? (event.prioridad === "critical" ? 10000 : 5000)
        : 5000;
    const { data, error } = await supabase.rpc("mizona_push_target_users", {
      p_latitud: event.latitud,
      p_longitud: event.longitud,
      p_categoria: event.categoria,
      p_actor_id: event.actor_id,
      p_max_radio_meters: maxRadius,
    });
    if (error) throw error;
    const ids = ((data || []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean);
    return applyNotificationPreferences(Array.from(new Set<string>(ids)), event);
  }

  if (event.payload?.target_all === true) {
    const { data, error } = await supabase
      .from("push_devices")
      .select("user_id")
      .eq("activo", true)
      .eq("permiso", "granted");
    if (error) throw error;
    return Array.from(new Set<string>((data || []).map((row: { user_id: string }) => row.user_id)));
  }

  return [];
}

async function activePushSubscriptions(userIds: string[]) {
  const map = new Map<string, string[]>();
  if (!userIds.length) return map;
  const { data, error } = await supabase
    .from("push_devices")
    .select("user_id,subscription_id")
    .in("user_id", userIds)
    .eq("activo", true)
    .eq("permiso", "granted");
  if (error) throw error;
  for (const row of (data || []) as Array<{ user_id: string; subscription_id: string }>) {
    if (!row.subscription_id) continue;
    const current = map.get(row.user_id) || [];
    current.push(row.subscription_id);
    map.set(row.user_id, current);
  }
  return map;
}

async function preferencesForUsers(userIds: string[]) {
  const map = new Map<string, Preferences>();
  if (!userIds.length) return map;
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);
  if (error) throw error;
  for (const row of data || []) map.set(row.user_id, row as Preferences);
  return map;
}

async function existingDeliveredUsers(eventId: number, userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const { data, error } = await supabase
    .from("notification_deliveries")
    .select("user_id")
    .eq("event_id", eventId)
    .in("user_id", userIds);
  if (error) throw error;
  return new Set((data || []).map((row: { user_id: string }) => row.user_id));
}

async function insertInbox(event: NotificationEvent, userIds: string[]) {
  if (!userIds.length) return;
  const rows = userIds.map((userId) => ({
    event_id: event.id,
    user_id: userId,
    titulo: event.titulo,
    cuerpo: event.cuerpo,
    url: event.url,
    tipo: event.event_type,
    prioridad: event.prioridad,
  }));
  const { error } = await supabase
    .from("notification_inbox")
    .upsert(rows, { onConflict: "event_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function insertSkipped(eventId: number, rows: Array<{ user_id: string; motivo: string }>) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("notification_deliveries")
    .upsert(rows.map((row) => ({
      event_id: eventId,
      user_id: row.user_id,
      estado: "skipped",
      motivo: row.motivo,
    })), { onConflict: "event_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function sendOneSignal(event: NotificationEvent, subscriptionIds: string[]) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    throw new Error("Faltan ONESIGNAL_APP_ID u ONESIGNAL_API_KEY en los secretos de la Edge Function.");
  }

  const response = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: subscriptionIds,
      headings: { en: event.titulo, es: event.titulo },
      contents: { en: event.cuerpo, es: event.cuerpo },
      url: pushUrl(event),
      name: `MiZona ${event.event_type} #${event.id}`.slice(0, 128),
      chrome_web_icon: `${SITE_URL}/assets/icon-192.png`,
      chrome_web_badge: `${SITE_URL}/assets/icon-192.png`,
      data: {
        event_id: event.id,
        event_type: event.event_type,
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        url: event.url,
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OneSignal ${response.status}: ${JSON.stringify(result)}`);
  }
  return result as { id?: string; errors?: unknown };
}

async function processEvent(event: NotificationEvent) {
  await supabase
    .from("notification_events")
    .update({ estado: "processing", intentos: Number(event.intentos || 0) + 1, error: null })
    .eq("id", event.id);

  const allRecipients = await recipientsForEvent(event);
  if (!allRecipients.length) {
    await supabase
      .from("notification_events")
      .update({ estado: "skipped", procesado_en: new Date().toISOString(), error: "Sin destinatarios" })
      .eq("id", event.id);
    return { eventId: event.id, recipients: 0, sent: 0, skipped: 0 };
  }

  const preferences = await preferencesForUsers(allRecipients);
  const activeSubscriptions = await activePushSubscriptions(allRecipients);
  const existing = await existingDeliveredUsers(event.id, allRecipients);

  const eligible: string[] = [];
  const skipped: Array<{ user_id: string; motivo: string }> = [];

  for (const userId of allRecipients) {
    if (existing.has(userId)) continue;
    if (!activeSubscriptions.has(userId)) {
      skipped.push({ user_id: userId, motivo: "sin_dispositivo_activo" });
      continue;
    }
    const pref = preferences.get(userId) || null;
    if (!preferenceAllows(event, pref)) {
      skipped.push({
        user_id: userId,
        motivo: pref?.resumen_frecuencia === "diario" ? "resumen_diario" : "preferencias_o_horario_silencioso",
      });
      continue;
    }
    eligible.push(userId);
  }

  await insertInbox(event, [...eligible, ...skipped.map((row) => row.user_id)]);
  await insertSkipped(event.id, skipped);

  if (!eligible.length) {
    await supabase
      .from("notification_events")
      .update({ estado: "skipped", procesado_en: new Date().toISOString(), error: "Todos los destinatarios fueron omitidos" })
      .eq("id", event.id);
    return { eventId: event.id, recipients: allRecipients.length, sent: 0, skipped: skipped.length };
  }

  let sent = 0;
  const providerIds: string[] = [];
  const subscriptionIds = Array.from(new Set(eligible.flatMap((userId) => activeSubscriptions.get(userId) || [])));
  const chunks: string[][] = [];
  for (let i = 0; i < subscriptionIds.length; i += 20000) chunks.push(subscriptionIds.slice(i, i + 20000));

  for (const chunk of chunks) {
    const result = await sendOneSignal(event, chunk);
    const providerMessageId = result.id || null;
    if (providerMessageId) providerIds.push(providerMessageId);
  }

  const { error: deliveryError } = await supabase
    .from("notification_deliveries")
    .upsert(eligible.map((userId) => ({
      event_id: event.id,
      user_id: userId,
      estado: "sent",
      provider: "onesignal",
      provider_message_id: providerIds.join(",") || null,
      enviado_en: new Date().toISOString(),
    })), { onConflict: "event_id,user_id" });
  if (deliveryError) throw deliveryError;
  sent = eligible.length;

  const finalState = skipped.length ? "partial" : "sent";
  await supabase
    .from("notification_events")
    .update({
      estado: finalState,
      procesado_en: new Date().toISOString(),
      error: null,
      payload: { ...(event.payload || {}), onesignal_message_ids: providerIds },
    })
    .eq("id", event.id);

  return { eventId: event.id, recipients: allRecipients.length, sent, skipped: skipped.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  if (WEBHOOK_SECRET) {
    const received = req.headers.get("x-mizona-webhook-secret") || "";
    if (received !== WEBHOOK_SECRET) return json({ error: "Webhook no autorizado" }, 401);
  }

  let body: Record<string, any> = {};
  try {
    body = await req.json() as Record<string, any>;
    const event = await fetchEvent(body);
    if (!event) return json({ error: "No se encontró el evento" }, 400);

    if (["sent", "partial", "skipped"].includes(event.estado)) {
      return json({ ok: true, repeated: true, eventId: event.id });
    }

    const result = await processEvent(event);
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);

    try {
      const eventId = Number(body?.record?.id || body?.event_id || body?.id || 0);
      if (eventId) {
        await supabase
          .from("notification_events")
          .update({ estado: "failed", procesado_en: new Date().toISOString(), error: message.slice(0, 1000) })
          .eq("id", eventId);
      }
    } catch (_) {}

    return json({ ok: false, error: message }, 500);
  }
});
