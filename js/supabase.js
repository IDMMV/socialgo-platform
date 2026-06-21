import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PUBLIC_ENV } from "./env.public.js";

export const supabase = createClient(PUBLIC_ENV.SUPABASE_URL, PUBLIC_ENV.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from("perfiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  location.href = "index.html";
}
