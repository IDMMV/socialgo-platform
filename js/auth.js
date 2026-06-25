import { supabase } from "./supabase.js";
import { PUBLIC_ENV } from "./env.public.js";

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;
export const normalizeUsername = value => String(value || "").trim().toLowerCase();

export async function usernameAvailable(username) {
  const value = normalizeUsername(username);
  if (!USERNAME_RE.test(value)) return false;
  const { data, error } = await supabase.rpc("username_available", { requested_username: value });
  if (error) throw error;
  return Boolean(data);
}

export async function registerUser({ fullName, username, email, password, accountType }) {
  const clean = normalizeUsername(username);
  if (!await usernameAvailable(clean)) throw new Error("Ese nombre de usuario no está disponible.");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(), password,
    options: {
      emailRedirectTo: `${PUBLIC_ENV.SITE_URL}/auth-callback.html`,
      data: { full_name: fullName.trim(), username: clean, account_type: accountType }
    }
  });
  if (error) throw error;
  return data;
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${PUBLIC_ENV.SITE_URL}/restablecer.html`
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// Preguntas de recuperación disponibles en MiZona.
export const RECOVERY_QUESTIONS = Object.freeze([
  { id: 'apodo_infancia', label: '¿Cuál era tu apodo de infancia?' },
  { id: 'primer_colegio', label: '¿Cómo se llamaba tu primer colegio?' },
  { id: 'distrito_infancia', label: '¿En qué distrito viviste durante tu infancia?' },
  { id: 'persona_importante', label: '¿Cuál es el nombre de una persona importante para ti?' },
  { id: 'frase_personal', label: 'Escribe una frase personal que puedas recordar' }
]);

export async function configureRecoveryQuestion(questionId, answer) {
  const { data, error } = await supabase.rpc('configurar_pregunta_recuperacion', {
    p_pregunta_id: String(questionId || ''),
    p_respuesta: String(answer || '')
  });
  if (error) throw error;
  return data;
}

export async function getRecoveryQuestionStatus() {
  const { data, error } = await supabase.rpc('estado_pregunta_recuperacion');
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || { configurada: false }) : (data || { configurada: false });
}

export async function verifyRecoveryQuestion(email, questionId, answer) {
  const { data, error } = await supabase.rpc('verificar_pregunta_recuperacion', {
    p_email: String(email || '').trim().toLowerCase(),
    p_pregunta_id: String(questionId || ''),
    p_respuesta: String(answer || '')
  });
  if (error) throw error;
  return data || { valida: false, bloqueada: false };
}
