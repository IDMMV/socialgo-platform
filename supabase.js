/*
  FASE 2:
  1. Instalar/importar el cliente oficial de Supabase.
  2. Configurar URL y anon key mediante variables de entorno.
  3. Nunca colocar service_role en el navegador.
  4. Activar y probar RLS antes de usar datos reales.
*/

export const SUPABASE_CONFIGURED = false;

export function requireSupabase() {
  if (!SUPABASE_CONFIGURED) {
    throw new Error("Supabase aún no está configurado. Revisa README.md.");
  }
}
