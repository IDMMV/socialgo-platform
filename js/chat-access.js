import { supabase } from './supabase.js';
import { dispatchPushEvent } from './push-dispatch.js';

export async function openOrRequestChat(otherUserId, { context = '', notify = null, navigate = true } = {}) {
  if (!otherUserId) throw new Error('No se encontró el usuario destinatario.');
  const { data, error } = await supabase.rpc('mizona_solicitar_o_abrir_chat', { p_otro_usuario: otherUserId });
  if (error) throw error;
  if (data?.event_id) dispatchPushEvent(data.event_id).catch(() => {});
  if (context) sessionStorage.setItem('mizona_chat_context', context);
  if (data?.estado === 'abierta' && data?.conversation_id) {
    if (navigate) location.href = `mensajes.html?c=${encodeURIComponent(data.conversation_id)}`;
    return data;
  }
  const message = data?.ya_existia
    ? 'Ya existe una solicitud de conversación pendiente.'
    : 'Solicitud de conversación enviada. El chat se abrirá cuando la otra persona la acepte.';
  if (typeof notify === 'function') notify(message);
  else window.mzToast?.(message) || alert(message);
  return data;
}
