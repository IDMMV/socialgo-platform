import { supabase, getCurrentUser, getMyProfile } from "./supabase.js";

export async function requireAuth({ redirect = "login.html" } = {}) {
  const user = await getCurrentUser();

  if (!user) {
    const next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
    window.location.replace(`${redirect}?next=${next}`);
    return null;
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;

  const { data, error } = await supabase.rpc("is_admin");

  if (error || !data) {
    document.body.innerHTML = `
      <main class="auth-page">
        <section class="auth-card">
          <h1>Acceso restringido</h1>
          <p>No tienes permisos administrativos.</p>
          <a class="primary" href="index.html">Volver al inicio</a>
        </section>
      </main>`;
    return null;
  }

  return user;
}

export async function signOutAndRedirect() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
  window.location.replace("login.html?logout=1");
}

export async function renderSessionControls() {
  const user = await getCurrentUser();

  document.querySelectorAll("[data-auth-only]").forEach(element => {
    element.hidden = !user;
  });

  document.querySelectorAll("[data-guest-only]").forEach(element => {
    element.hidden = Boolean(user);
  });

  document.querySelectorAll("[data-admin-only]").forEach(element => {
    element.hidden = true;
  });

  if (!user) return;

  const [{ data: isAdmin, error: adminError }, profile] = await Promise.all([
    supabase.rpc("is_admin"),
    getMyProfile()
  ]);

  if (!adminError && isAdmin) {
    document.querySelectorAll("[data-admin-only]").forEach(element => {
      element.hidden = false;
    });
  }

  document.querySelectorAll("[data-current-username]").forEach(element => {
    element.textContent = profile?.username ? `@${profile.username}` : user.email;
  });

  document.querySelectorAll("[data-logout]").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await signOutAndRedirect();
      } catch (error) {
        alert(error.message || "No se pudo cerrar la sesión.");
        button.disabled = false;
      }
    });
  });
}
