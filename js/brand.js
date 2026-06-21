import { supabase } from "./supabase.js";

const DEFAULT_BRAND = {
  name: "SocialGo",
  slogan: "Conecta, comparte y crece.",
  primary: "#7c3aed",
  secondary: "#22b8f0",
  logoUrl: null
};

let cachedBrand = { ...DEFAULT_BRAND };

export function getBrand() {
  return { ...cachedBrand };
}

export function applyBrand() {
  const brand = cachedBrand;

  document.querySelectorAll("[data-brand-name]").forEach((element) => {
    element.textContent = brand.name;
  });

  document.querySelectorAll("[data-brand-slogan]").forEach((element) => {
    element.textContent = brand.slogan;
  });

  document.documentElement.style.setProperty("--primary", brand.primary);
  document.documentElement.style.setProperty("--primary-2", brand.secondary);

  if (document.title.includes("SocialGo")) {
    document.title = document.title.replace("SocialGo", brand.name);
  }
}

export async function loadBrand() {
  const { data, error } = await supabase
    .from("configuracion_plataforma")
    .select("nombre,eslogan,color_principal,color_secundario,logo_url")
    .eq("id", 1)
    .maybeSingle();

  if (!error && data) {
    cachedBrand = {
      name: data.nombre || DEFAULT_BRAND.name,
      slogan: data.eslogan || DEFAULT_BRAND.slogan,
      primary: data.color_principal || DEFAULT_BRAND.primary,
      secondary: data.color_secundario || DEFAULT_BRAND.secondary,
      logoUrl: data.logo_url || null
    };
  }

  applyBrand();
  return getBrand();
}

export async function saveBrand(brand) {
  const payload = {
    id: 1,
    nombre: brand.name,
    eslogan: brand.slogan,
    color_principal: brand.primary,
    color_secundario: brand.secondary,
    actualizado_en: new Date().toISOString()
  };

  const { error } = await supabase
    .from("configuracion_plataforma")
    .upsert(payload);

  if (error) throw error;

  cachedBrand = {
    ...cachedBrand,
    ...brand
  };

  applyBrand();
  return getBrand();
}

applyBrand();
loadBrand().catch(console.error);
