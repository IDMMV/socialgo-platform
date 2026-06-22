import { PUBLIC_ENV } from "./env.public.js";
import { supabase } from "./supabase.js";

let tusModulePromise = null;

async function loadTus() {
  if (!tusModulePromise) {
    tusModulePromise = import("https://esm.sh/tus-js-client@4.3.1");
  }
  return tusModulePromise;
}

export async function uploadResumable({
  bucket,
  path,
  file,
  contentType,
  onProgress
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("La sesión expiró. Vuelve a iniciar sesión.");

  const tus = await loadTus();
  const endpoint = `${PUBLIC_ENV.SUPABASE_URL}/storage/v1/upload/resumable`;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: PUBLIC_ENV.SUPABASE_PUBLISHABLE_KEY,
        "x-upsert": "false"
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || file.type || "application/octet-stream",
        cacheControl: "3600"
      },
      removeFingerprintOnSuccess: true,
      onError(error) {
        reject(error);
      },
      onProgress(bytesUploaded, bytesTotal) {
        const percent = bytesTotal
          ? Math.round((bytesUploaded / bytesTotal) * 100)
          : 0;
        onProgress?.(percent, bytesUploaded, bytesTotal);
      },
      onSuccess() {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve({ path, url: data.publicUrl });
      }
    });

    upload.findPreviousUploads()
      .then(previous => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}
