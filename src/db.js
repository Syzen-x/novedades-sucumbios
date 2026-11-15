import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { slug, ahoraIso } from "./util.js";

export const db = new DatabaseSync(path.join(config.datos, "sitio.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','editor')),
  clave TEXT NOT NULL,
  creado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS noticias (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  resumen TEXT NOT NULL DEFAULT '',
  contenido TEXT NOT NULL DEFAULT '',
  canton TEXT NOT NULL DEFAULT 'Provincia',
  imagen TEXT NOT NULL DEFAULT '',
  imagen_texto TEXT NOT NULL DEFAULT '',
  video TEXT NOT NULL DEFAULT '',
  galeria TEXT NOT NULL DEFAULT '[]',
  enlace_facebook TEXT NOT NULL DEFAULT '',
  urgente INTEGER NOT NULL DEFAULT 0,
  destacada INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'publicada' CHECK (estado IN ('publicada','borrador')),
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  publicada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL,
  vistas INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS noticias_fecha ON noticias(estado, publicada_en DESC);
CREATE TABLE IF NOT EXISTS anuncios (
  id INTEGER PRIMARY KEY,
  espacio TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagen','video','youtube','html','iframe')),
  nombre TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT '',
  src_movil TEXT NOT NULL DEFAULT '',
  poster TEXT NOT NULL DEFAULT '',
  enlace TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  desde TEXT NOT NULL DEFAULT '',
  hasta TEXT NOT NULL DEFAULT '',
  duracion INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY,
  dia TEXT NOT NULL,
  ruta TEXT NOT NULL,
  noticia_id INTEGER,
  visitante TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS visitas_dia ON visitas(dia);
CREATE TABLE IF NOT EXISTS eventos_anuncio (
  id INTEGER PRIMARY KEY,
  dia TEXT NOT NULL,
  anuncio_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vista','clic'))
);
CREATE INDEX IF NOT EXISTS eventos_dia ON eventos_anuncio(dia, anuncio_id);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

export function slugUnico(titulo, idActual = 0) {
  const base = slug(titulo);
  let s = base, n = 2;
  const existe = db.prepare("SELECT id FROM noticias WHERE slug = ? AND id != ?");
  while (existe.get(s, idActual)) s = `${base}-${n++}`;
  return s;
}

export function ajuste(clave, porDefecto = "") {
  const fila = db.prepare("SELECT valor FROM ajustes WHERE clave = ?").get(clave);
  return fila ? fila.valor : porDefecto;
}
export function guardarAjuste(clave, valor) {
  db.prepare("INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(clave, String(valor));
}

/* ---------- Datos iniciales: se cargan una sola vez desde los archivos de la versión anterior ---------- */
function leerArchivoVentana(ruta, variable) {
  if (!fs.existsSync(ruta)) return null;
  const ventana = {};
  vm.runInNewContext(fs.readFileSync(ruta, "utf8"), { window: ventana });
  return ventana[variable];
}
const ruta = (src) => (!src ? "" : /^(https?:)?\//.test(src) || src.startsWith("#") ? src : "/" + src);

if (!db.prepare("SELECT COUNT(*) AS n FROM noticias").get().n) {
  const noticias = leerArchivoVentana(path.join(config.raiz, "src", "semilla", "noticias.js"), "NOTICIAS") || [];
  const ins = db.prepare(`INSERT INTO noticias (slug, titulo, resumen, contenido, canton, imagen, video, enlace_facebook, urgente, destacada, publicada_en, actualizada_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  noticias.forEach((n, i) => {
    const fecha = new Date(n.fecha + ":00-05:00").toISOString();
    ins.run(slugUnico(n.titulo), n.titulo, n.resumen || "", n.resumen || "", n.canton || "Provincia", ruta(n.imagen),
      "", n.enlace || "", n.urgente ? 1 : 0, i === 0 ? 1 : 0, fecha, fecha);
  });
}

if (!db.prepare("SELECT COUNT(*) AS n FROM anuncios").get().n) {
  const conf = leerArchivoVentana(path.join(config.raiz, "src", "semilla", "anuncios.js"), "ANUNCIOS");
  const ins = db.prepare(`INSERT INTO anuncios (espacio, tipo, nombre, src, src_movil, poster, enlace, html, duracion, orden, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [espacio, lista] of Object.entries(conf?.espacios || {})) {
    lista.forEach((a, i) => ins.run(espacio, a.tipo, a.texto || `Anuncio de ejemplo (${espacio})`, ruta(a.src || a.id || ""), ruta(a.srcMovil),
      ruta(a.poster), a.enlace || "", a.html || "", a.duracion || 0, i, ahoraIso()));
  }
  if (conf?.contacto?.whatsapp) guardarAjuste("whatsapp", conf.contacto.whatsapp);
}
