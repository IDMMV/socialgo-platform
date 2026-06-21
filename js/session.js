import { supabase, getCurrentUser, getMyProfile, signOut } from "./supabase.js";

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}`; return null; }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const { data } = await supabase.rpc("is_admin");
  if (!data) { document.body.innerHTML = '<main class="auth-page"><section class="auth-card"><h1>Acceso restringido</h1><a class="primary" href="index.html">Volver</a></section></main>'; return null; }
  return user;
}

export async function renderSessionControls() {
  const user = await getCurrentUser();
  document.querySelectorAll('[data-auth-only]').forEach(el => el.hidden = !user);
  document.querySelectorAll('[data-guest-only]').forEach(el => el.hidden = !!user);
  if (user) {
    const profile = await getMyProfile().catch(() => null);
    document.querySelectorAll('[data-current-username]').forEach(el => el.textContent = profile?.username ? `@${profile.username}` : user.email);
    document.querySelectorAll('[data-logout]').forEach(btn => btn.onclick = () => signOut().catch(e => alert(e.message)));
  }
}
