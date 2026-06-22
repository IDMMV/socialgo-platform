const MAX_CLIP_SECONDS = 180;
const MAX_INPUT_MB = 250;

let ffmpegInstance = null;
let ffmpegLoaded = false;

export function formatTime(seconds, decimals = false) {
  const safe = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;

  if (decimals) {
    return `${String(minutes).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(secs)).padStart(2, "0")}`;
}

export async function readVideoMetadata(file) {
  if (!file) throw new Error("Selecciona un video.");

  if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
    throw new Error("Formato no compatible. Usa MP4, WebM o MOV.");
  }

  if (file.size > MAX_INPUT_MB * 1024 * 1024) {
    throw new Error(`El video original no debe superar ${MAX_INPUT_MB} MB.`);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      const width = video.videoWidth;
      const height = video.videoHeight;
      URL.revokeObjectURL(url);

      if (!duration || !Number.isFinite(duration)) {
        reject(new Error("No se pudo leer la duración del video."));
        return;
      }

      resolve({ duration, width, height });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo abrir el video."));
    };

    video.src = url;
  });
}

export async function createTimelineThumbnails(file, duration, count = 10) {
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const url = URL.createObjectURL(file);

  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error("No se pudo generar la línea de tiempo."));
  });

  canvas.width = 120;
  canvas.height = 180;

  const frames = [];

  for (let index = 0; index < count; index += 1) {
    const time = duration * (index / Math.max(1, count - 1));
    video.currentTime = Math.min(time, Math.max(0, duration - 0.05));

    await new Promise(resolve => {
      video.onseeked = resolve;
    });

    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sourceRatio = video.videoWidth / video.videoHeight;
    const targetRatio = canvas.width / canvas.height;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

    if (sourceRatio > targetRatio) {
      sw = video.videoHeight * targetRatio;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / targetRatio;
      sy = (video.videoHeight - sh) / 2;
    }

    context.drawImage(
      video,
      sx, sy, sw, sh,
      0, 0, canvas.width, canvas.height
    );

    frames.push(canvas.toDataURL("image/jpeg", 0.72));
  }

  URL.revokeObjectURL(url);
  return frames;
}

export async function captureCover(videoElement, canvas, time) {
  if (!videoElement?.duration) return null;

  const previousTime = videoElement.currentTime;
  videoElement.currentTime = Math.min(
    Math.max(0, Number(time || 0)),
    Math.max(0, videoElement.duration - 0.05)
  );

  await new Promise(resolve => {
    videoElement.addEventListener("seeked", resolve, { once: true });
  });

  const context = canvas.getContext("2d");
  const targetWidth = canvas.width;
  const targetHeight = canvas.height;
  const sourceRatio = videoElement.videoWidth / videoElement.videoHeight;
  const targetRatio = targetWidth / targetHeight;

  let sx = 0, sy = 0;
  let sw = videoElement.videoWidth;
  let sh = videoElement.videoHeight;

  if (sourceRatio > targetRatio) {
    sw = videoElement.videoHeight * targetRatio;
    sx = (videoElement.videoWidth - sw) / 2;
  } else {
    sh = videoElement.videoWidth / targetRatio;
    sy = (videoElement.videoHeight - sh) / 2;
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    videoElement,
    sx, sy, sw, sh,
    0, 0, targetWidth, targetHeight
  );

  videoElement.currentTime = previousTime;

  return new Promise(resolve => {
    canvas.toBlob(resolve, "image/jpeg", 0.86);
  });
}

async function loadFFmpeg(progressCallback) {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;

  progressCallback?.(2, "Cargando editor de video…");

  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import("https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"),
    import("https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js")
  ]);

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    const percent = Math.max(5, Math.min(95, Math.round(progress * 100)));
    progressCallback?.(percent, "Recortando video…");
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

  const ffmpegPackageURL =
    "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm";

  const [classWorkerURL, coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${ffmpegPackageURL}/worker.js`, "text/javascript"),
    toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
  ]);

  await ffmpeg.load({
    classWorkerURL,
    coreURL,
    wasmURL
  });

  ffmpegInstance = { ffmpeg, fetchFile };
  ffmpegLoaded = true;
  progressCallback?.(8, "Editor listo.");

  return ffmpegInstance;
}

export async function preloadVideoEditor(progressCallback) {
  try {
    await loadFFmpeg(progressCallback);
    return true;
  } catch (error) {
    console.warn("No se pudo precargar el editor:", error);
    return false;
  }
}

export async function trimVideo({
  file,
  start,
  end,
  muted = false,
  progressCallback
}) {
  const duration = Number(end) - Number(start);

  if (duration <= 0) {
    throw new Error("La selección debe tener una duración mayor a cero.");
  }

  if (duration > MAX_CLIP_SECONDS + 0.05) {
    throw new Error("El fragmento seleccionado supera los 3 minutos.");
  }

  const { ffmpeg, fetchFile } = await loadFFmpeg(progressCallback);
  const inputExtension =
    file.type === "video/webm" ? "webm" :
    file.type === "video/quicktime" ? "mov" : "mp4";

  const inputName = `input-${crypto.randomUUID()}.${inputExtension}`;
  const outputName = `clip-${crypto.randomUUID()}.mp4`;

  progressCallback?.(10, "Preparando video…");
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const args = [
    "-ss", Number(start).toFixed(3),
    "-i", inputName,
    "-t", duration.toFixed(3),
    "-map_metadata", "-1",
    "-movflags", "+faststart"
  ];

  if (muted) {
    args.push("-an");
  }

  // Stream copy first: much faster and lighter for mobile devices.
  args.push("-c:v", "copy");

  if (!muted) {
    args.push("-c:a", "copy");
  }

  args.push(outputName);

  await ffmpeg.exec(args);

  progressCallback?.(96, "Preparando archivo final…");
  const outputData = await ffmpeg.readFile(outputName);

  await Promise.allSettled([
    ffmpeg.deleteFile(inputName),
    ffmpeg.deleteFile(outputName)
  ]);

  progressCallback?.(100, "Video listo.");

  return new File(
    [outputData.buffer],
    `socialgo-clip-${Date.now()}.mp4`,
    { type: "video/mp4" }
  );
}

export { MAX_CLIP_SECONDS };
