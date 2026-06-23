import { supabase } from "./supabase.js";

export const BRAND = Object.freeze({
  name: "MiZona",
  domain: "mizona.pe",
  slogan: "Tu zona, tu gente, tus oportunidades.",
  primary: "#185FA5",
  secondary: "#1D9E75",
  alert: "#E24B4A",
  logoUrl: null
});

const DEFAULT_BRAND = { ...BRAND };
let cachedBrand = { ...DEFAULT_BRAND };
let loadPromise = null;

function normaliseBrand(value = {}) {
  return {
    name: String(value.name || value.nombre || DEFAULT_BRAND.name).trim() || DEFAULT_BRAND.name,
    domain: String(value.domain || DEFAULT_BRAND.domain).trim() || DEFAULT_BRAND.domain,
    slogan: String(value.slogan || value.eslogan || DEFAULT_BRAND.slogan).trim(),
    primary: value.primary || value.color_principal || DEFAULT_BRAND.primary,
    secondary: value.secondary || value.color_secundario || DEFAULT_BRAND.secondary,
    alert: value.alert || DEFAULT_BRAND.alert,
    logoUrl: value.logoUrl || value.logo_url || null
  };
}

export function getBrand() {
  return { ...cachedBrand };
}

export function applyBrand(brandValue = cachedBrand) {
  cachedBrand = normaliseBrand(brandValue);
  const brand = cachedBrand;

  document.querySelectorAll("[data-brand-name]").forEach((element) => {
    element.textContent = brand.name;
  });

  document.querySelectorAll("[data-brand-slogan]").forEach((element) => {
    element.textContent = brand.slogan;
  });

  document.querySelectorAll(".brand-mark").forEach((element) => {
    const current = element.textContent.trim().toUpperCase();
    if (!current || current === "S" || current === "SG") element.textContent = "MZ";
  });

  document.querySelectorAll(".mz-logo-name").forEach((element) => {
    if (element.textContent.trim() !== "MiZonaRide") element.textContent = brand.name;
  });
  document.querySelectorAll(".mz-logo-domain").forEach((element) => {
    if (!element.textContent.includes("/ride")) element.textContent = brand.domain;
  });

  document.documentElement.style.setProperty("--primary", brand.primary);
  document.documentElement.style.setProperty("--primary-2", brand.secondary);
  document.documentElement.style.setProperty("--az", brand.primary);
  document.documentElement.style.setProperty("--vd", brand.secondary);
  document.documentElement.style.setProperty("--rj", brand.alert);

  const oldNames = ["SocialGo", "Social Go"];
  oldNames.forEach((oldName) => {
    if (document.title.includes(oldName)) document.title = document.title.replace(oldName, brand.name);
  });

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", brand.primary);

  return getBrand();
}

export async function loadBrand({ force = false } = {}) {
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("configuracion_plataforma")
        .select("nombre,eslogan,color_principal,color_secundario,logo_url")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) cachedBrand = normaliseBrand(data);
    } catch (error) {
      console.info("MiZona: usando la marca local.", error?.message || error);
    }

    return applyBrand(cachedBrand);
  })();

  return loadPromise;
}

export async function saveBrand(brandValue) {
  const brand = normaliseBrand({ ...cachedBrand, ...brandValue });
  const payload = {
    id: 1,
    nombre: brand.name,
    eslogan: brand.slogan,
    color_principal: brand.primary,
    color_secundario: brand.secondary,
    logo_url: brand.logoUrl,
    actualizado_en: new Date().toISOString()
  };

  const { error } = await supabase.from("configuracion_plataforma").upsert(payload);
  if (error) throw error;

  cachedBrand = brand;
  return applyBrand(cachedBrand);
}
