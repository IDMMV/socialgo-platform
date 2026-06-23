// MiZona — utilidades globales
export function toast(msg, duration = 3000) {
  let t = document.getElementById('mz-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mz-toast';
    t.className = 'mz-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

export function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 60000;
  if (diff < 1) return 'Ahora';
  if (diff < 60) return `Hace ${Math.floor(diff)} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff / 60)} h`;
  return `Hace ${Math.floor(diff / 1440)} días`;
}

export function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function fechaHoy() {
  const d = new Date();
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function compartirWhatsApp(texto) {
  window.open('https://wa.me/?text=' + encodeURIComponent(texto + '\n\nVía mizona.pe'), '_blank');
}

export function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

export function cerrarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}
