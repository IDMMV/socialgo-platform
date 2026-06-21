import { supabase, getCurrentUser } from "./supabase.js";

export async function compressImage(file, {
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82
} = {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Selecciona una imagen válida.");
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error("La imagen original no debe superar 12 MB.");
  }

  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;

  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });

  if (!blob) throw new Error("No se pudo comprimir la imagen.");
  return blob;
}

export async function uploadUserImage({
  file,
  bucket,
  folder,
  maxWidth,
  maxHeight,
  quality
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const blob = await compressImage(file, { maxWidth, maxHeight, quality });
  const name = `${crypto.randomUUID()}.webp`;
  const path = `${user.id}/${folder ? `${folder}/` : ""}${name}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    path,
    url: data.publicUrl
  };
}

export async function removeStorageObject(bucket, publicUrl) {
  if (!publicUrl) return;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const position = publicUrl.indexOf(marker);
  if (position < 0) return;

  const path = decodeURIComponent(publicUrl.slice(position + marker.length));
  await supabase.storage.from(bucket).remove([path]);
}
