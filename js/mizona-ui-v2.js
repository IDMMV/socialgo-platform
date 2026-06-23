
export function initMiZonaUI() {
  const body = document.body;
  document.querySelector("[data-menu]")?.addEventListener("click", () => body.classList.toggle("menu-open"));

  const zone = localStorage.getItem("mizona_zona") || "Ventanilla, Callao";
  document.querySelectorAll("[data-zone]").forEach(el => el.textContent = zone);

  document.querySelectorAll("[data-change-zone]").forEach(btn => {
    btn.addEventListener("click", () => {
      const current = localStorage.getItem("mizona_zona") || "Ventanilla, Callao";
      const next = prompt("Escribe tu distrito o zona:", current);
      if (next?.trim()) {
        localStorage.setItem("mizona_zona", next.trim());
        document.querySelectorAll("[data-zone]").forEach(el => el.textContent = next.trim());
      }
    });
  });
}

export function toast(message, type = "ok") {
  document.querySelector(".mz-toast")?.remove();
  const el = document.createElement("div");
  el.className = "mz-toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function timeAgo(dateValue) {
  const diff = Date.now() - new Date(dateValue).getTime();
  const min = Math.max(0, Math.floor(diff / 60000));
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} d`;
}
