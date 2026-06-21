const DEFAULT_BRAND = {
  name: "SocialGo",
  slogan: "Conecta, comparte y crece.",
  primary: "#7c3aed",
  secondary: "#22b8f0"
};

export function getBrand() {
  try {
    return { ...DEFAULT_BRAND, ...JSON.parse(localStorage.getItem("socialgo_brand") || "{}") };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function saveBrand(brand) {
  localStorage.setItem("socialgo_brand", JSON.stringify({ ...getBrand(), ...brand }));
  applyBrand();
}

export function applyBrand() {
  const brand = getBrand();
  document.querySelectorAll("[data-brand-name]").forEach(el => el.textContent = brand.name);
  document.querySelectorAll("[data-brand-slogan]").forEach(el => el.textContent = brand.slogan);
  document.title = brand.name;
  document.documentElement.style.setProperty("--primary", brand.primary);
  document.documentElement.style.setProperty("--primary-2", brand.secondary);
}
