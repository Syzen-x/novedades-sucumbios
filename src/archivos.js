// Fotos y videos se guardan en el VPS. Cloudflare solo firma permisos de subida y de borrado,
// así nadie puede subir ni borrar archivos sin pasar por el panel.

export const TIPOS = {
  "image/jpeg": ["imagen", "jpg"], "image/png": ["imagen", "png"], "image/webp": ["imagen", "webp"],
  "image/gif": ["imagen", "gif"], "image/avif": ["imagen", "avif"],
  "video/mp4": ["video", "mp4"], "video/webm": ["video", "webm"], "video/quicktime": ["video", "mov"],
};
export const MAXIMO = 1024 * 1024 * 1024; // 1 GB por archivo
export const CLAVE_VALIDA = /^subidas\/\d{4}-\d{2}\/[a-f0-9]{16}\.(jpg|png|webp|gif|avif|mp4|webm|mov)$/;

export const archivosListos = (env) => Boolean(env.MEDIA_URL && env.SUBIDA_URL && env.MEDIA_SECRETO);

async function firma(secreto, metodo, clave, expira) {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sello = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(`${metodo}\n${clave}\n${expira}`));
  return [...new Uint8Array(sello)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nuevaClave(tipoMime) {
  const al = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `subidas/${new Date().toISOString().slice(0, 7)}/${al}.${TIPOS[tipoMime][1]}`;
}

export async function urlFirmada(env, metodo, clave, minutos = 120) {
  const expira = Math.floor(Date.now() / 1000) + minutos * 60;
  const f = await firma(env.MEDIA_SECRETO, metodo, clave, expira);
  return `${env.SUBIDA_URL.replace(/\/$/, "")}/${clave}?expira=${expira}&firma=${f}`;
}

export async function borrarArchivo(env, clave) {
  if (!archivosListos(env) || !CLAVE_VALIDA.test(clave)) return;
  try {
    await fetch(await urlFirmada(env, "DELETE", clave, 5), { method: "DELETE" });
  } catch (e) {
    console.error("No se pudo borrar el archivo", clave, e.message);
  }
}

/** "/subidas/..." → dirección pública en el VPS (para páginas y metadatos) */
export function enMedia(env, url) {
  if (url && env.MEDIA_URL && url.startsWith("/subidas/")) return env.MEDIA_URL.replace(/\/$/, "") + url;
  return url;
}
