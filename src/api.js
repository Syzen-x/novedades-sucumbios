import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import { db, slugUnico, ajuste, guardarAjuste } from "./db.js";
import { config } from "./config.js";
import { ahoraIso, idYoutube } from "./util.js";
import {
  requiere, mismoOrigen, limiteIngreso, limpiarIntentos, iniciarSesion, cerrarSesion,
  verificarClave, hashClave, validarClave, crearUsuario,
} from "./auth.js";
import { resumen, registrarEventoAnuncio } from "./estadisticas.js";

export const api = express.Router();
api.use(express.json({ limit: "1mb" }));
api.use(mismoOrigen);

const error = (res, codigo, mensaje) => res.status(codigo).json({ error: mensaje });
const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const texto = (v, max = 20000) => String(v ?? "").slice(0, max).trim();

export const ESPACIOS = {
  cabecera: { nombre: "Banner principal", donde: "Debajo de la portada y arriba de cada noticia", medida: "1500 × 500 px (3:1)", proporcion: 3 },
  lateral: { nombre: "Lateral fijo", donde: "Columna derecha, se queda visible al bajar", medida: "600 × 1200 px (1:2)", proporcion: 0.5 },
  entreNoticias: { nombre: "Entre noticias", donde: "En la lista de noticias y dentro del texto de cada nota", medida: "1500 × 500 px (3:1)", proporcion: 3 },
  franja: { nombre: "Franja de video", donde: "A todo lo ancho, en medio de la portada", medida: "1920 × 1080 px (16:9)", proporcion: 16 / 9 },
  flotante: { nombre: "Flotante", donde: "Ventanita abajo a la derecha (se puede cerrar)", medida: "1280 × 720 px (16:9)", proporcion: 16 / 9 },
};

/* ---------------- Sesión ---------------- */
api.post("/ingresar", limiteIngreso, (req, res) => {
  const { usuario, clave } = req.body || {};
  const u = db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(texto(usuario, 60));
  if (!u || !verificarClave(String(clave || ""), u.clave)) return error(res, 401, "Usuario o contraseña incorrectos.");
  limpiarIntentos(req.ip);
  iniciarSesion(res, u.id);
  res.json({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
});
api.post("/salir", (req, res) => { cerrarSesion(req, res); res.json({ ok: true }); });
api.get("/yo", requiere(), (req, res) => res.json(req.usuario));
api.put("/yo/clave", requiere(), (req, res) => {
  const { actual, nueva } = req.body || {};
  const u = db.prepare("SELECT clave FROM usuarios WHERE id = ?").get(req.usuario.id);
  if (!verificarClave(String(actual || ""), u.clave)) return error(res, 400, "La contraseña actual no es correcta.");
  try { validarClave(nueva); } catch (e) { return error(res, 400, e.message); }
  db.prepare("UPDATE usuarios SET clave = ? WHERE id = ?").run(hashClave(nueva), req.usuario.id);
  res.json({ ok: true });
});

/* ---------------- Subida de archivos ---------------- */
const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const VIDEOS = ["video/mp4", "video/webm", "video/quicktime"];
const subida = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => {
      const carpeta = path.join(config.subidas, new Date().toISOString().slice(0, 7));
      fs.mkdirSync(carpeta, { recursive: true });
      cb(null, carpeta);
    },
    filename: (_req, f, cb) => cb(null, crypto.randomBytes(8).toString("hex") + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "")),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, IMAGENES.includes(f.mimetype) || VIDEOS.includes(f.mimetype)),
});

api.post("/subir", requiere(), (req, res) => {
  subida.single("archivo")(req, res, async (err) => {
    if (err) return error(res, 400, err.code === "LIMIT_FILE_SIZE" ? "El archivo pesa más de 300 MB." : "No se pudo subir el archivo.");
    const f = req.file;
    if (!f) return error(res, 400, "Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4 o WEBM.");
    const relativa = (p) => "/subidas/" + path.relative(config.subidas, p).split(path.sep).join("/");
    try {
      if (IMAGENES.includes(f.mimetype) && f.mimetype !== "image/gif") {
        // se optimiza: máximo 2000 px de ancho, formato WEBP
        const destino = f.path.replace(/\.[^.]+$/, "") + ".webp";
        const meta = await sharp(f.path).rotate().metadata();
        await sharp(f.path).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 84 }).toFile(destino + ".tmp");
        fs.rmSync(f.path);
        fs.renameSync(destino + ".tmp", destino);
        return res.json({ url: relativa(destino), tipo: "imagen", ancho: Math.min(meta.width, 2000), alto: meta.height });
      }
      res.json({ url: relativa(f.path), tipo: VIDEOS.includes(f.mimetype) ? "video" : "imagen" });
    } catch {
      fs.rmSync(f.path, { force: true });
      error(res, 400, "La imagen está dañada o no se puede leer.");
    }
  });
});

/* ---------------- Noticias (admin y editor) ---------------- */
function noticiaDesdeCuerpo(b) {
  const titulo = texto(b.titulo, 200);
  if (!titulo) throw new Error("Escribe el título de la noticia.");
  const canton = config.cantones.includes(b.canton) ? b.canton : "Provincia";
  let galeria = Array.isArray(b.galeria) ? b.galeria.filter((g) => typeof g === "string").slice(0, 30) : [];
  let fecha = b.publicada_en ? new Date(b.publicada_en) : new Date();
  if (isNaN(fecha)) fecha = new Date();
  return {
    titulo,
    resumen: texto(b.resumen, 400),
    contenido: texto(b.contenido, 60000),
    canton,
    imagen: texto(b.imagen, 500),
    imagen_texto: texto(b.imagen_texto, 300),
    video: texto(b.video, 500),
    galeria: JSON.stringify(galeria),
    enlace_facebook: texto(b.enlace_facebook, 500),
    urgente: bool(b.urgente),
    destacada: bool(b.destacada),
    estado: b.estado === "borrador" ? "borrador" : "publicada",
    publicada_en: fecha.toISOString(),
  };
}

const salidaNoticia = (n) => n && { ...n, galeria: JSON.parse(n.galeria || "[]"), urgente: !!n.urgente, destacada: !!n.destacada };

api.get("/noticias", requiere(), (req, res) => {
  const q = `%${texto(req.query.q, 100)}%`;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = 30;
  const filas = db.prepare(`SELECT n.id, n.slug, n.titulo, n.canton, n.imagen, n.estado, n.urgente, n.destacada, n.publicada_en,
      n.actualizada_en, n.vistas, n.video != '' AS tiene_video, u.nombre AS autor
    FROM noticias n LEFT JOIN usuarios u ON u.id = n.autor_id
    WHERE n.titulo LIKE ? ORDER BY n.publicada_en DESC LIMIT ? OFFSET ?`).all(q, porPagina, (pagina - 1) * porPagina);
  const total = db.prepare("SELECT COUNT(*) AS n FROM noticias WHERE titulo LIKE ?").get(q).n;
  res.json({ noticias: filas, total, pagina, paginas: Math.ceil(total / porPagina) });
});

api.get("/noticias/:id", requiere(), (req, res) => {
  const n = db.prepare("SELECT * FROM noticias WHERE id = ?").get(Number(req.params.id));
  if (!n) return error(res, 404, "Esa noticia ya no existe.");
  res.json(salidaNoticia(n));
});

function guardarDestacada(id, destacada) {
  if (destacada) db.prepare("UPDATE noticias SET destacada = 0 WHERE id != ?").run(id);
}

api.post("/noticias", requiere(), (req, res) => {
  let n;
  try { n = noticiaDesdeCuerpo(req.body || {}); } catch (e) { return error(res, 400, e.message); }
  const ahora = ahoraIso();
  const r = db.prepare(`INSERT INTO noticias (slug, titulo, resumen, contenido, canton, imagen, imagen_texto, video, galeria, enlace_facebook,
      urgente, destacada, estado, autor_id, publicada_en, actualizada_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slugUnico(n.titulo), n.titulo, n.resumen, n.contenido, n.canton,
    n.imagen, n.imagen_texto, n.video, n.galeria, n.enlace_facebook, n.urgente, n.destacada, n.estado, req.usuario.id, n.publicada_en, ahora);
  guardarDestacada(r.lastInsertRowid, n.destacada);
  res.status(201).json(salidaNoticia(db.prepare("SELECT * FROM noticias WHERE id = ?").get(r.lastInsertRowid)));
});

api.put("/noticias/:id", requiere(), (req, res) => {
  const id = Number(req.params.id);
  const actual = db.prepare("SELECT * FROM noticias WHERE id = ?").get(id);
  if (!actual) return error(res, 404, "Esa noticia ya no existe.");
  let n;
  try { n = noticiaDesdeCuerpo(req.body || {}); } catch (e) { return error(res, 400, e.message); }
  // el enlace solo cambia si la noticia aún es borrador, para no romper enlaces ya compartidos
  const nuevoSlug = actual.estado === "borrador" && n.titulo !== actual.titulo ? slugUnico(n.titulo, id) : actual.slug;
  db.prepare(`UPDATE noticias SET slug=?, titulo=?, resumen=?, contenido=?, canton=?, imagen=?, imagen_texto=?, video=?, galeria=?,
      enlace_facebook=?, urgente=?, destacada=?, estado=?, publicada_en=?, actualizada_en=? WHERE id=?`)
    .run(nuevoSlug, n.titulo, n.resumen, n.contenido, n.canton, n.imagen, n.imagen_texto, n.video, n.galeria, n.enlace_facebook,
      n.urgente, n.destacada, n.estado, n.publicada_en, ahoraIso(), id);
  guardarDestacada(id, n.destacada);
  res.json(salidaNoticia(db.prepare("SELECT * FROM noticias WHERE id = ?").get(id)));
});

api.delete("/noticias/:id", requiere(), (req, res) => {
  const n = db.prepare("SELECT imagen, video, galeria FROM noticias WHERE id = ?").get(Number(req.params.id));
  if (!n) return error(res, 404, "Esa noticia ya no existe.");
  db.prepare("DELETE FROM noticias WHERE id = ?").run(Number(req.params.id));
  borrarArchivosSueltos([n.imagen, n.video, ...JSON.parse(n.galeria || "[]")]);
  res.json({ ok: true });
});

/** Borra del disco los archivos subidos que ya no usa ninguna noticia ni anuncio */
function borrarArchivosSueltos(urls) {
  const enUso = db.prepare(`SELECT 1 FROM noticias WHERE imagen = ?1 OR video = ?1 OR galeria LIKE ?2
    UNION SELECT 1 FROM anuncios WHERE src = ?1 OR src_movil = ?1 OR poster = ?1 LIMIT 1`);
  for (const url of new Set(urls.filter((u) => typeof u === "string" && u.startsWith("/subidas/")))) {
    if (enUso.get(url, `%"${url}"%`)) continue;
    const archivo = path.resolve(config.subidas, url.slice("/subidas/".length));
    if (archivo.startsWith(config.subidas + path.sep)) fs.rmSync(archivo, { force: true });
  }
}

/* ---------------- Anuncios (solo admin) ---------------- */
function anuncioDesdeCuerpo(b) {
  if (!ESPACIOS[b.espacio]) throw new Error("Elige dónde va el anuncio.");
  const tipo = ["imagen", "video", "youtube", "html", "iframe"].includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw new Error("Elige el tipo de anuncio.");
  let src = texto(b.src, 500);
  if (tipo === "youtube") {
    src = idYoutube(src);
    if (!src) throw new Error("Pega el enlace del video de YouTube.");
  }
  if (["imagen", "video", "iframe"].includes(tipo) && !src) throw new Error("Sube el archivo o pega el enlace del anuncio.");
  if (tipo === "html" && !texto(b.html)) throw new Error("Escribe el contenido HTML del anuncio.");
  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
  return {
    espacio: b.espacio, tipo,
    nombre: texto(b.nombre, 120) || "Anuncio sin nombre",
    src, src_movil: texto(b.src_movil, 500), poster: texto(b.poster, 500),
    enlace: texto(b.enlace, 500), html: texto(b.html, 20000),
    desde: fecha(b.desde), hasta: fecha(b.hasta),
    duracion: Math.min(Math.max(Number(b.duracion) || 0, 0), 300),
    activo: b.activo === undefined ? 1 : bool(b.activo),
  };
}

api.get("/espacios", requiere("admin"), (_req, res) => res.json(ESPACIOS));
api.get("/anuncios", requiere("admin"), (_req, res) => {
  res.json(db.prepare("SELECT * FROM anuncios ORDER BY espacio, orden, id").all().map((a) => ({ ...a, activo: !!a.activo })));
});
api.post("/anuncios", requiere("admin"), (req, res) => {
  let a;
  try { a = anuncioDesdeCuerpo(req.body || {}); } catch (e) { return error(res, 400, e.message); }
  const orden = db.prepare("SELECT COALESCE(MAX(orden), -1) + 1 AS o FROM anuncios WHERE espacio = ?").get(a.espacio).o;
  const r = db.prepare(`INSERT INTO anuncios (espacio, tipo, nombre, src, src_movil, poster, enlace, html, desde, hasta, duracion, activo, orden, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.espacio, a.tipo, a.nombre, a.src, a.src_movil, a.poster, a.enlace, a.html,
    a.desde, a.hasta, a.duracion, a.activo, orden, ahoraIso());
  res.status(201).json(db.prepare("SELECT * FROM anuncios WHERE id = ?").get(r.lastInsertRowid));
});
api.put("/anuncios/:id", requiere("admin"), (req, res) => {
  let a;
  try { a = anuncioDesdeCuerpo(req.body || {}); } catch (e) { return error(res, 400, e.message); }
  const r = db.prepare(`UPDATE anuncios SET espacio=?, tipo=?, nombre=?, src=?, src_movil=?, poster=?, enlace=?, html=?, desde=?, hasta=?,
      duracion=?, activo=? WHERE id=?`).run(a.espacio, a.tipo, a.nombre, a.src, a.src_movil, a.poster, a.enlace, a.html, a.desde, a.hasta,
    a.duracion, a.activo, Number(req.params.id));
  if (!r.changes) return error(res, 404, "Ese anuncio ya no existe.");
  res.json(db.prepare("SELECT * FROM anuncios WHERE id = ?").get(Number(req.params.id)));
});
api.patch("/anuncios/orden", requiere("admin"), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  const upd = db.prepare("UPDATE anuncios SET orden = ? WHERE id = ?");
  ids.forEach((id, i) => upd.run(i, id));
  res.json({ ok: true });
});
api.delete("/anuncios/:id", requiere("admin"), (req, res) => {
  const a = db.prepare("SELECT src, src_movil, poster FROM anuncios WHERE id = ?").get(Number(req.params.id));
  if (!a) return error(res, 404, "Ese anuncio ya no existe.");
  db.prepare("DELETE FROM anuncios WHERE id = ?").run(Number(req.params.id));
  db.prepare("DELETE FROM eventos_anuncio WHERE anuncio_id = ?").run(Number(req.params.id));
  borrarArchivosSueltos([a.src, a.src_movil, a.poster]);
  res.json({ ok: true });
});

/* ---------------- Estadísticas (solo admin) ---------------- */
api.get("/estadisticas", requiere("admin"), (req, res) => res.json(resumen(req.query.dias)));

/* ---------------- Usuarios y ajustes (solo admin) ---------------- */
api.get("/usuarios", requiere("admin"), (_req, res) => {
  res.json(db.prepare("SELECT id, usuario, nombre, rol, creado_en FROM usuarios ORDER BY id").all());
});
api.post("/usuarios", requiere("admin"), (req, res) => {
  try {
    const id = crearUsuario({ usuario: texto(req.body?.usuario, 30), nombre: texto(req.body?.nombre, 80), rol: req.body?.rol, clave: req.body?.clave });
    res.status(201).json(db.prepare("SELECT id, usuario, nombre, rol, creado_en FROM usuarios WHERE id = ?").get(id));
  } catch (e) {
    error(res, 400, /UNIQUE/.test(e.message) ? "Ya existe un usuario con ese nombre." : e.message);
  }
});
api.put("/usuarios/:id", requiere("admin"), (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
  if (!u) return error(res, 404, "Ese usuario ya no existe.");
  const rol = ["admin", "editor"].includes(req.body?.rol) ? req.body.rol : u.rol;
  if (id === req.usuario.id && rol !== "admin") return error(res, 400, "No puedes quitarte el rol de administrador a ti mismo.");
  db.prepare("UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?").run(texto(req.body?.nombre, 80) || u.nombre, rol, id);
  if (req.body?.clave) {
    try { validarClave(req.body.clave); } catch (e) { return error(res, 400, e.message); }
    db.prepare("UPDATE usuarios SET clave = ? WHERE id = ?").run(hashClave(req.body.clave), id);
    db.prepare("DELETE FROM sesiones WHERE usuario_id = ?").run(id);
  }
  res.json(db.prepare("SELECT id, usuario, nombre, rol, creado_en FROM usuarios WHERE id = ?").get(id));
});
api.delete("/usuarios/:id", requiere("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) return error(res, 400, "No puedes borrar tu propio usuario.");
  db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
  res.json({ ok: true });
});

api.get("/ajustes", requiere("admin"), (_req, res) => {
  res.json({ whatsapp: ajuste("whatsapp"), seguidores: ajuste("seguidores", config.seguidores) });
});
api.put("/ajustes", requiere("admin"), (req, res) => {
  guardarAjuste("whatsapp", texto(req.body?.whatsapp, 20).replace(/[^\d]/g, ""));
  guardarAjuste("seguidores", texto(req.body?.seguidores, 12) || config.seguidores);
  res.json({ ok: true });
});

/* ---------------- Público: vistas y clics de anuncios ---------------- */
api.post("/evento", express.text({ type: "*/*", limit: "2kb" }), (req, res) => {
  try {
    const datos = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    registrarEventoAnuncio(req, Number(datos.anuncio), datos.tipo);
  } catch {}
  res.status(204).end();
});

api.use((_req, res) => error(res, 404, "Esa dirección no existe."));
