import { supabase } from './supabase.js';

export async function dispatchPushEvent(eventId) {
  const id = Number(eventId || 0);
  if (!id) return { ok: false, skipped: true, reason: 'sin_evento' };
  const { data, error } = await supabase.functions.invoke('send-push', { body: { event_id: id } });
  if (error) throw error;
  return data || { ok: true, eventId: id };
}

export async function dispatchPushEvents(eventIds = []) {
  const ids = [...new Set((eventIds || []).map(Number).filter(Boolean))];
  const results = [];
  for (const id of ids) {
    try { results.push(await dispatchPushEvent(id)); }
    catch (error) { results.push({ ok: false, eventId: id, error: error?.message || String(error) }); }
  }
  return results;
}
