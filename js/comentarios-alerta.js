// ============================================================
// MiZona.pe — Comentarios en alertas
// ============================================================
import { supabase, getCurrentUser } from './supabase.js';
import { escapeHtml, timeAgo, toast } from './mizona-ui-v2.js';

const canales = new Map();

export async function initComentarios(alertaId, contenedor) {
  if (!alertaId || !contenedor) return;

  const render = () => renderComentarios(alertaId, contenedor).catch(error => {
    contenedor.innerHTML = `<div class="mz-com-empty">${escapeHtml(error?.message || 'No se pudieron cargar los comentarios.')}</div>`;
  });

  await render();

  const clave = `comentarios-${alertaId}`;
  if (canales.has(clave)) await supabase.removeChannel(canales.get(clave));

  const canal = supabase.channel(clave)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'comentarios_alerta',
      filter: `alerta_id=eq.${alertaId}`
    }, render)
    .subscribe();

  canales.set(clave, canal);
  window.addEventListener('pagehide', () => {
    const actual = canales.get(clave);
    if (actual) supabase.removeChannel(actual);
    canales.delete(clave);
  }, { once: true });
}

async function renderComentarios(alertaId, contenedor) {
  const [{ data, error }, user] = await Promise.all([
    supabase
      .from('comentarios_alerta')
      .select('id,alerta_id,autor_id,contenido,es_anonimo,created_at,autor:perfiles(username,nombre_visible,puntos_total)')
      .eq('alerta_id', alertaId)
      .order('created_at', { ascending: true })
      .limit(100),
    getCurrentUser()
  ]);
  if (error) throw error;

  const comentarios = data || [];
  const items = comentarios.map(c => {
    const autor = c.es_anonimo
      ? 'Vecino anónimo'
      : escapeHtml(c.autor?.nombre_visible || c.autor?.username || 'Vecino');
    return `
      <div class="mz-comentario" id="com-${c.id}">
        <div class="mz-com-header">
          <span class="mz-com-autor">${c.es_anonimo ? '🎭' : '👤'} ${autor}</span>
          <span class="mz-com-tiempo">${timeAgo(c.created_at)}</span>
          ${user?.id === c.autor_id ? `
            <button type="button" class="mz-com-del" data-eliminar-comentario="${c.id}" title="Eliminar comentario" aria-label="Eliminar comentario">✕</button>
          ` : ''}
        </div>
        <div class="mz-com-texto">${escapeHtml(c.contenido)}</div>
      </div>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="mz-comentarios-wrap">
      <div class="mz-comentarios-title">
        <i class="ti ti-message-circle" aria-hidden="true"></i>
        Comentarios (${comentarios.length})
      </div>
      <div class="mz-comentarios-lista">${items || '<div class="mz-com-empty">Sé el primero en comentar.</div>'}</div>
      ${user ? `
        <form class="mz-comentario-form" data-form-comentario>
          <div class="mz-com-input-wrap">
            <textarea class="mz-com-input" name="contenido" placeholder="Agrega información útil sobre este incidente..." maxlength="500" minlength="2" rows="2" required></textarea>
          </div>
          <div class="mz-com-actions">
            <label class="mz-com-anon">
              <input type="checkbox" name="anonimo">
              <span>Comentar anónimo</span>
            </label>
            <button type="submit" class="mz-com-btn">
              <i class="ti ti-send" aria-hidden="true"></i> Comentar
            </button>
          </div>
        </form>
      ` : `
        <div class="mz-com-login">
          <a href="login.html?next=${encodeURIComponent(`alerta.html?id=${alertaId}`)}" class="mz-com-btn">
            <i class="ti ti-login" aria-hidden="true"></i> Inicia sesión para comentar
          </a>
        </div>
      `}
    </div>`;

  contenedor.querySelector('[data-form-comentario]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const contenido = String(new FormData(form).get('contenido') || '').trim();
    if (contenido.length < 2) return;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.innerHTML = '<i class="ti ti-loader-2 ti-spin" aria-hidden="true"></i> Publicando...';
    try {
      const { error: insertError } = await supabase.from('comentarios_alerta').insert({
        alerta_id: alertaId,
        autor_id: user.id,
        contenido,
        es_anonimo: new FormData(form).get('anonimo') === 'on'
      });
      if (insertError) throw insertError;
      form.reset();
      await renderComentarios(alertaId, contenedor);
    } catch (errorInsert) {
      toast(errorInsert?.message || 'No se pudo publicar el comentario.', 'error');
      boton.disabled = false;
      boton.innerHTML = '<i class="ti ti-send" aria-hidden="true"></i> Comentar';
    }
  });

  contenedor.querySelectorAll('[data-eliminar-comentario]').forEach(boton => {
    boton.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este comentario?')) return;
      boton.disabled = true;
      const { error: deleteError } = await supabase
        .from('comentarios_alerta')
        .delete()
        .eq('id', boton.dataset.eliminarComentario);
      if (deleteError) {
        toast(deleteError.message || 'No se pudo eliminar el comentario.', 'error');
        boton.disabled = false;
        return;
      }
      await renderComentarios(alertaId, contenedor);
    });
  });
}
