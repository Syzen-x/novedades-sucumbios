import crypto from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|curl|wget|python|axios|monitor/i;

export function esBot(req) {
  return BOTS.test(req.headers["user-agent"] || "");
}

export function hoy() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

function origen(req) {
  const ref = req.headers.referer || "";
  let host = "";
  try { host = new URL(ref).hostname.replace(/^www\./, ""); } catch { return "Directo"; }
  const propio = new URL(config.sitio).hostname.replace(/^www\./, "");
  if (!host || host === propio || host === (req.headers.host || "").split(":")[0]) return "Directo";
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(host)) return "Facebook";
  if (/google\./.test(host)) return "Google";
  if (/t\.me$|telegram/.test(host)) return "Telegram";
  if (/tiktok/.test(host)) return "TikTok";
  if (/whatsapp/.test(host)) return "WhatsApp";
  if (/instagram/.test(host)) return "Instagram";
  if (/bing\.|duckduckgo|yahoo/.test(host)) return "Otros buscadores";
  return host;
}

const insVisita = db.prepare("INSERT INTO visitas (dia, ruta, noticia_id, visitante, dispositivo, origen) VALUES (?, ?, ?, ?, ?, ?)");
const sumarVista = db.prepare("UPDATE noticias SET vistas = vistas + 1 WHERE id = ?");

export function registrarVisita(req, ruta, noticiaId = null) {
  if (req.usuario || esBot(req) || req.method !== "GET") return;
  const dia = hoy();
  const ua = req.headers["user-agent"] || "";
  const visitante = crypto.createHash("sha256").update(`${config.secreto}|${dia}|${req.ip}|${ua}`).digest("hex").slice(0, 16);
  const dispositivo = /mobi|android|iphone/i.test(ua) ? "Celular" : /ipad|tablet/i.test(ua) ? "Tablet" : "Computadora";
  insVisita.run(dia, ruta, noticiaId, visitante, dispositivo, origen(req));
  if (noticiaId) sumarVista.run(noticiaId);
}

const insEvento = db.prepare("INSERT INTO eventos_anuncio (dia, anuncio_id, tipo) VALUES (?, ?, ?)");
export function registrarEventoAnuncio(req, anuncioId, tipo) {
  if (req.usuario || esBot(req)) return;
  if (!["vista", "clic"].includes(tipo) || !Number.isInteger(anuncioId)) return;
  insEvento.run(hoy(), anuncioId, tipo);
}

export function resumen(dias = 30) {
  dias = Math.min(Math.max(Number(dias) || 30, 1), 365);
  const fin = hoy();
  const inicio = new Date(Date.parse(fin) - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const inicioPrevio = new Date(Date.parse(inicio) - dias * 864e5).toISOString().slice(0, 10);

  const totales = (desde, hasta) => db.prepare(`SELECT COUNT(*) AS visitas, COUNT(DISTINCT visitante || dia) AS visitantes
    FROM visitas WHERE dia BETWEEN ? AND ?`).get(desde, hasta);
  const actual = totales(inicio, fin);
  const previo = totales(inicioPrevio, new Date(Date.parse(inicio) - 864e5).toISOString().slice(0, 10));

  const porDia = db.prepare(`SELECT dia, COUNT(*) AS visitas, COUNT(DISTINCT visitante) AS visitantes
    FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY dia`).all(inicio, fin);
  const mapa = Object.fromEntries(porDia.map((d) => [d.dia, d]));
  const serie = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(Date.parse(inicio) + i * 864e5).toISOString().slice(0, 10);
    serie.push({ dia: d, visitas: mapa[d]?.visitas || 0, visitantes: mapa[d]?.visitantes || 0 });
  }

  const topNoticias = db.prepare(`SELECT n.id, n.titulo, n.slug, n.canton, COUNT(v.id) AS visitas
    FROM visitas v JOIN noticias n ON n.id = v.noticia_id WHERE v.dia BETWEEN ? AND ?
    GROUP BY n.id ORDER BY visitas DESC LIMIT 10`).all(inicio, fin);
  const origenes = db.prepare(`SELECT origen AS nombre, COUNT(*) AS visitas FROM visitas WHERE dia BETWEEN ? AND ?
    GROUP BY origen ORDER BY visitas DESC LIMIT 8`).all(inicio, fin);
  const dispositivos = db.prepare(`SELECT dispositivo AS nombre, COUNT(*) AS visitas FROM visitas WHERE dia BETWEEN ? AND ?
    GROUP BY dispositivo ORDER BY visitas DESC`).all(inicio, fin);
  const anuncios = db.prepare(`SELECT a.id, a.nombre, a.espacio, a.tipo, a.activo,
      SUM(e.tipo = 'vista') AS vistas, SUM(e.tipo = 'clic') AS clics
    FROM anuncios a LEFT JOIN eventos_anuncio e ON e.anuncio_id = a.id AND e.dia BETWEEN ? AND ?
    GROUP BY a.id ORDER BY vistas DESC`).all(inicio, fin)
    .map((a) => ({ ...a, vistas: a.vistas || 0, clics: a.clics || 0 }));
  const publicadas = db.prepare("SELECT COUNT(*) AS n FROM noticias WHERE estado = 'publicada' AND substr(publicada_en,1,10) BETWEEN ? AND ?").get(inicio, fin).n;

  return { dias, inicio, fin, actual, previo, serie, topNoticias, origenes, dispositivos, anuncios, publicadas };
}
