// ============================================================
// MiZona.pe — Configuración pública del frontend
// Las claves publicables pueden estar en el navegador.
// NUNCA coloques aquí la service_role de Supabase ni la API key
// privada de OneSignal.
// ============================================================
export const PUBLIC_ENV = Object.freeze({
  SUPABASE_URL: "https://fhqdxethubaycijtbzry.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0wSXACcq0lqcKsjqUf9xVQ_7a3c72oH",

  // Copia este valor desde OneSignal → Settings → Keys & IDs.
  // Mientras quede vacío, MiZona mostrará el panel preparado pero
  // no solicitará permisos ni registrará dispositivos.
  ONESIGNAL_APP_ID: "",

  // Dominio público definitivo de MiZona.
  SITE_URL: "https://mizona.pe"
});
