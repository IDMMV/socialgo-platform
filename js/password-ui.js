const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"></path><circle cx="12" cy="12" r="2.7"></circle></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 3.1"></path><path d="M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6"></path><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1"></path></svg>';

export function initPasswordToggles(root = document) {
  root.querySelectorAll('[data-password-toggle]').forEach((button) => {
    if (button.dataset.ready === '1') return;
    const targetId = button.getAttribute('data-password-toggle');
    const input = root.getElementById(targetId);
    if (!input) return;
    button.dataset.ready = '1';
    button.innerHTML = EYE;
    button.setAttribute('aria-label', 'Mostrar contraseña');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.innerHTML = visible ? EYE : EYE_OFF;
      button.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      button.setAttribute('aria-pressed', String(!visible));
      input.focus({ preventScroll: true });
    });
  });
}

export function bindPasswordStrength(input, bar) {
  if (!input || !bar) return;
  const meter = bar.querySelector('span');
  const paint = () => {
    const value = input.value;
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    const widths = ['0%', '20%', '40%', '60%', '80%', '100%'];
    const colors = ['#ef4444', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#16a34a'];
    meter.style.width = widths[score];
    meter.style.background = colors[score];
  };
  input.addEventListener('input', paint);
  paint();
}
