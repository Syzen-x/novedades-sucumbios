import { base } from "./db.js";

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|curl|wget|python|axios|monitor/i;

export const esBot = (c) => BOTS.test(c.req.header("user-agent") || "");

export function hoy() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

function origen(c) {
  const ref = c.req.header("referer") || "";
  let host = "";
  try { host = new URL(ref).hostname.replace(/^www\./, ""); } catch { return "Directo"; }
  if (!host || host === new URL(c.req.url).hostname.replace(/^www\./, "")) return "Directo";
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(host)) return "Facebook";
  if (/google\./.test(host)) return "Google";
  if (/t\.me$|telegram/.test(host)) return "Telegram";
  if (/tiktok/.test(host)) return "TikTok";
  if (/whatsapp/.test(host)) return "WhatsApp";
  if (/instagram/.test(host)) return "Instagram";
  if (/bing\.|duckduckgo|yahoo/.test(host)) return "Otros buscadores";
  return host;
}

async function huella(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Registra la visita sin demorar la respuesta (no guarda la IP, solo una huella diaria anónima) */
export function registrarVisita(c, ruta, noticiaId = null) {
  if (c.get("usuario") || esBot(c) || c.req.method !== "GET") return;
  const tarea = (async () => {
    const dia = hoy();
    const ua = c.req.header("user-agent") || "";
    const visitante = await huella(`${c.env.SECRETO}|${dia}|${c.req.header("cf-connecting-ip") || ""}|${ua}`);
    const dispositivo = /mobi|android|iphone/i.test(ua) ? "Celular" : /ipad|tablet/i.test(ua) ? "Tablet" : "Computadora";
    const sentencias = [["INSERT INTO visitas (dia, ruta, noticia_id, visitante, dispositivo, origen) VALUES (?, ?, ?, ?, ?, ?)",
      dia, ruta, noticiaId, visitante, dispositivo, origen(c)]];
    if (noticiaId) sentencias.push(["UPDATE noticias SET vistas = vistas + 1 WHERE id = ?", noticiaId]);
    await base(c.env).lote(sentencias);
  })().catch((e) => console.error("visita", e.message));
  c.executionCtx.waitUntil(tarea);
}

export async function registrarEventoAnuncio(c, anuncioId, tipo) {
  if (c.get("usuario") || esBot(c)) return;
  if (!["vista", "clic"].includes(tipo) || !Number.isInteger(anuncioId)) return;
  await base(c.env).correr("INSERT INTO eventos_anuncio (dia, anuncio_id, tipo) VALUES (?, ?, ?)", hoy(), anuncioId, tipo);
}

const restarDias = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);

export async function resumen(env, dias = 30) {
  dias = Math.min(Math.max(Number(dias) || 30, 1), 365);
  const b = base(env);
  const fin = hoy();
  const inicio = restarDias(fin, dias - 1);
  const inicioPrevio = restarDias(inicio, dias);
  const finPrevio = restarDias(inicio, 1);
  const totales = "SELECT COUNT(*) AS visitas, COUNT(DISTINCT visitante || dia) AS visitantes FROM visitas WHERE dia BETWEEN ? AND ?";

  const [actual, previo, porDia, topNoticias, origenes, dispositivos, anuncios, publicadas] = await Promise.all([
    b.uno(totales, inicio, fin),
    b.uno(totales, inicioPrevio, finPrevio),
    b.todos("SELECT dia, COUNT(*) AS visitas, COUNT(DISTINCT visitante) AS visitantes FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY dia", inicio, fin),
    b.todos(`SELECT n.id, n.titulo, n.slug, n.canton, COUNT(v.id) AS visitas FROM visitas v JOIN noticias n ON n.id = v.noticia_id
      WHERE v.dia BETWEEN ? AND ? GROUP BY n.id ORDER BY visitas DESC LIMIT 10`, inicio, fin),
    b.todos("SELECT origen AS nombre, COUNT(*) AS visitas FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY origen ORDER BY visitas DESC LIMIT 8", inicio, fin),
    b.todos("SELECT dispositivo AS nombre, COUNT(*) AS visitas FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY dispositivo ORDER BY visitas DESC", inicio, fin),
    b.todos(`SELECT a.id, a.nombre, a.espacio, a.tipo, a.activo, SUM(e.tipo = 'vista') AS vistas, SUM(e.tipo = 'clic') AS clics
      FROM anuncios a LEFT JOIN eventos_anuncio e ON e.anuncio_id = a.id AND e.dia BETWEEN ? AND ? GROUP BY a.id ORDER BY vistas DESC`, inicio, fin),
    b.uno("SELECT COUNT(*) AS n FROM noticias WHERE estado = 'publicada' AND substr(publicada_en,1,10) BETWEEN ? AND ?", inicio, fin),
  ]);

  const mapa = Object.fromEntries(porDia.map((d) => [d.dia, d]));
  const serie = [];
  for (let i = 0; i < dias; i++) {
    const d = restarDias(inicio, -i);
    serie.push({ dia: d, visitas: mapa[d]?.visitas || 0, visitantes: mapa[d]?.visitantes || 0 });
  }
  return {
    dias, inicio, fin, actual, previo, serie, topNoticias, origenes, dispositivos,
    anuncios: anuncios.map((a) => ({ ...a, vistas: a.vistas || 0, clics: a.clics || 0 })),
    publicadas: publicadas.n,
  };
}
