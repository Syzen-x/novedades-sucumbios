import { Hono } from "hono";
import { base, slugUnico, ajustes, guardarAjuste } from "./db.js";
import { config } from "./config.js";
import { ahoraIso, idYoutube } from "./util.js";
import { requiere, mismoOrigen, limiteIngreso, iniciarSesion, cerrarSesion, verificarClave, hashClave, validarClave, crearUsuario } from "./auth.js";
import { resumen, registrarEventoAnuncio } from "./estadisticas.js";
import { TIPOS, MAXIMO, archivosListos, nuevaClave, urlFirmada, borrarArchivo } from "./archivos.js";

export const api = new Hono();
api.use("*", mismoOrigen);

const error = (c, codigo, mensaje) => c.json({ error: mensaje }, codigo);
const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const texto = (v, max = 20000) => String(v ?? "").slice(0, max).trim();
const cuerpo = async (c) => { try { return await c.req.json(); } catch { return {}; } };

export const ESPACIOS = {
  cabecera: { nombre: "Banner principal", donde: "Debajo de la portada y al final de cada noticia", medida: "1500 × 500 px (3:1)", proporcion: 3 },
  lateral: { nombre: "Lateral fijo", donde: "Columna derecha, se queda visible al bajar", medida: "600 × 1200 px (1:2)", proporcion: 0.5 },
  entreNoticias: { nombre: "Entre noticias", donde: "En la lista de noticias y dentro del texto de cada nota", medida: "1500 × 500 px (3:1)", proporcion: 3 },
  franja: { nombre: "Franja de video", donde: "A todo lo ancho, en medio de la portada", medida: "1920 × 1080 px (16:9)", proporcion: 16 / 9 },
  flotante: { nombre: "Flotante", donde: "Ventanita abajo a la derecha (se puede cerrar)", medida: "1280 × 720 px (16:9)", proporcion: 16 / 9 },
};

/* ---------------- Sesión ---------------- */
api.post("/ingresar", limiteIngreso, async (c) => {
  const { usuario, clave } = await cuerpo(c);
  const u = await base(c.env).uno("SELECT * FROM usuarios WHERE usuario = ?", texto(usuario, 60));
  if (!u || !(await verificarClave(String(clave || ""), u.clave))) return error(c, 401, "Usuario o contraseña incorrectos.");
  await base(c.env).correr("DELETE FROM ajustes WHERE clave = ?", c.get("claveIntentos"));
  await iniciarSesion(c, u.id);
  return c.json({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
});
api.post("/salir", async (c) => { await cerrarSesion(c); return c.json({ ok: true }); });
api.get("/yo", requiere(), (c) => c.json(c.get("usuario")));
api.put("/yo/clave", requiere(), async (c) => {
  const { actual, nueva } = await cuerpo(c);
  const u = await base(c.env).uno("SELECT clave FROM usuarios WHERE id = ?", c.get("usuario").id);
  if (!(await verificarClave(String(actual || ""), u.clave))) return error(c, 400, "La contraseña actual no es correcta.");
  try { validarClave(nueva); } catch (e) { return error(c, 400, e.message); }
  await base(c.env).correr("UPDATE usuarios SET clave = ? WHERE id = ?", await hashClave(nueva), c.get("usuario").id);
  return c.json({ ok: true });
});

/* ---------------- Subida de archivos al VPS ---------------- */
// El panel pide permiso aquí y luego sube el archivo directo al VPS con la dirección firmada.
api.post("/subir/permiso", requiere(), async (c) => {
  if (!archivosListos(c.env)) {
    return error(c, 503, "Todavía no está conectado el servidor de archivos (VPS). Mientras tanto, para videos pega un enlace de YouTube o Facebook.");
  }
  const { tipo, tamano } = await cuerpo(c);
  if (!TIPOS[tipo]) return error(c, 400, "Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4 o WEBM.");
  if (!(Number(tamano) > 0)) return error(c, 400, "El archivo está vacío.");
  if (Number(tamano) > MAXIMO) return error(c, 400, "El archivo pesa más de 1 GB. Recórtalo o súbelo a YouTube y pega el enlace.");
  const clave = nuevaClave(tipo);
  return c.json({ subir: await urlFirmada(c.env, "PUT", clave), url: "/" + clave, tipo: TIPOS[tipo][0] });
});

/** Borra del VPS los archivos que ya no usa ninguna noticia ni anuncio */
async function borrarArchivosSueltos(c, urls) {
  const b = base(c.env);
  for (const url of new Set(urls.filter((u) => typeof u === "string" && u.startsWith("/subidas/")))) {
    const enUso = await b.uno(`SELECT 1 FROM noticias WHERE imagen = ?1 OR video = ?1 OR galeria LIKE ?2
      UNION SELECT 1 FROM anuncios WHERE src = ?1 OR src_movil = ?1 OR poster = ?1 LIMIT 1`, url, `%"${url}"%`);
    if (!enUso) await borrarArchivo(c.env, url.slice(1));
  }
}

/* ---------------- Noticias (admin y editor) ---------------- */
function noticiaDesdeCuerpo(b) {
  const titulo = texto(b.titulo, 200);
  if (!titulo) throw new Error("Escribe el título de la noticia.");
  let fecha = b.publicada_en ? new Date(b.publicada_en) : new Date();
  if (isNaN(fecha)) fecha = new Date();
  return {
    titulo,
    resumen: texto(b.resumen, 400),
    contenido: texto(b.contenido, 60000),
    canton: config.cantones.includes(b.canton) ? b.canton : "Provincia",
    imagen: texto(b.imagen, 500),
    imagen_texto: texto(b.imagen_texto, 300),
    video: texto(b.video, 500),
    galeria: JSON.stringify(Array.isArray(b.galeria) ? b.galeria.filter((g) => typeof g === "string").slice(0, 30) : []),
    enlace_facebook: texto(b.enlace_facebook, 500),
    urgente: bool(b.urgente),
    destacada: bool(b.destacada),
    estado: b.estado === "borrador" ? "borrador" : "publicada",
    publicada_en: fecha.toISOString(),
  };
}
const salidaNoticia = (n) => n && { ...n, galeria: JSON.parse(n.galeria || "[]"), urgente: !!n.urgente, destacada: !!n.destacada };

api.get("/noticias", requiere(), async (c) => {
  const q = `%${texto(c.req.query("q"), 100)}%`;
  const pagina = Math.max(1, Number(c.req.query("pagina")) || 1);
  const porPagina = 30;
  const b = base(c.env);
  const [filas, total] = await Promise.all([
    b.todos(`SELECT n.id, n.slug, n.titulo, n.canton, n.imagen, n.estado, n.urgente, n.destacada, n.publicada_en,
        n.actualizada_en, n.vistas, n.video != '' AS tiene_video, u.nombre AS autor
      FROM noticias n LEFT JOIN usuarios u ON u.id = n.autor_id
      WHERE n.titulo LIKE ? ORDER BY n.publicada_en DESC LIMIT ? OFFSET ?`, q, porPagina, (pagina - 1) * porPagina),
    b.uno("SELECT COUNT(*) AS n FROM noticias WHERE titulo LIKE ?", q),
  ]);
  return c.json({ noticias: filas, total: total.n, pagina, paginas: Math.ceil(total.n / porPagina) });
});

api.get("/noticias/:id", requiere(), async (c) => {
  const n = await base(c.env).uno("SELECT * FROM noticias WHERE id = ?", Number(c.req.param("id")));
  return n ? c.json(salidaNoticia(n)) : error(c, 404, "Esa noticia ya no existe.");
});

api.post("/noticias", requiere(), async (c) => {
  let n;
  try { n = noticiaDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  const b = base(c.env);
  const r = await b.correr(`INSERT INTO noticias (slug, titulo, resumen, contenido, canton, imagen, imagen_texto, video, galeria, enlace_facebook,
      urgente, destacada, estado, autor_id, publicada_en, actualizada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    await slugUnico(c.env, n.titulo), n.titulo, n.resumen, n.contenido, n.canton, n.imagen, n.imagen_texto, n.video, n.galeria,
    n.enlace_facebook, n.urgente, n.destacada, n.estado, c.get("usuario").id, n.publicada_en, ahoraIso());
  const id = r.meta.last_row_id;
  if (n.destacada) await b.correr("UPDATE noticias SET destacada = 0 WHERE id != ?", id);
  return c.json(salidaNoticia(await b.uno("SELECT * FROM noticias WHERE id = ?", id)), 201);
});

api.put("/noticias/:id", requiere(), async (c) => {
  const id = Number(c.req.param("id"));
  const b = base(c.env);
  const actual = await b.uno("SELECT * FROM noticias WHERE id = ?", id);
  if (!actual) return error(c, 404, "Esa noticia ya no existe.");
  let n;
  try { n = noticiaDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  // el enlace solo cambia mientras es borrador, para no romper enlaces ya compartidos
  const nuevoSlug = actual.estado === "borrador" && n.titulo !== actual.titulo ? await slugUnico(c.env, n.titulo, id) : actual.slug;
  const sentencias = [[`UPDATE noticias SET slug=?, titulo=?, resumen=?, contenido=?, canton=?, imagen=?, imagen_texto=?, video=?, galeria=?,
      enlace_facebook=?, urgente=?, destacada=?, estado=?, publicada_en=?, actualizada_en=? WHERE id=?`,
    nuevoSlug, n.titulo, n.resumen, n.contenido, n.canton, n.imagen, n.imagen_texto, n.video, n.galeria, n.enlace_facebook,
    n.urgente, n.destacada, n.estado, n.publicada_en, ahoraIso(), id]];
  if (n.destacada) sentencias.push(["UPDATE noticias SET destacada = 0 WHERE id != ?", id]);
  await b.lote(sentencias);
  const quitados = [actual.imagen, actual.video, ...JSON.parse(actual.galeria || "[]")].filter((u) => u && !n.galeria.includes(`"${u}"`) && u !== n.imagen && u !== n.video);
  c.executionCtx.waitUntil(borrarArchivosSueltos(c, quitados));
  return c.json(salidaNoticia(await b.uno("SELECT * FROM noticias WHERE id = ?", id)));
});

api.delete("/noticias/:id", requiere(), async (c) => {
  const id = Number(c.req.param("id"));
  const b = base(c.env);
  const n = await b.uno("SELECT imagen, video, galeria FROM noticias WHERE id = ?", id);
  if (!n) return error(c, 404, "Esa noticia ya no existe.");
  await b.correr("DELETE FROM noticias WHERE id = ?", id);
  c.executionCtx.waitUntil(borrarArchivosSueltos(c, [n.imagen, n.video, ...JSON.parse(n.galeria || "[]")]));
  return c.json({ ok: true });
});

/* ---------------- Transmisiones en vivo (admin y editor) ---------------- */
function transmisionDesdeCuerpo(b) {
  const titulo = texto(b.titulo, 160);
  const enlace = texto(b.enlace, 500);
  if (!titulo) throw new Error("Escribe el título de la transmisión.");
  if (!/^https:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch|youtube\.com|youtu\.be)\//.test(enlace)) {
    throw new Error("Pega el enlace de la transmisión de Facebook o de YouTube.");
  }
  const estado = ["programada", "en_vivo", "terminada"].includes(b.estado) ? b.estado : "en_vivo";
  let programada = "";
  if (estado === "programada") {
    const f = new Date(b.programada_para);
    if (isNaN(f)) throw new Error("Elige la fecha y hora de la transmisión programada.");
    programada = f.toISOString();
  }
  return { titulo, descripcion: texto(b.descripcion, 600), enlace, estado, programada_para: programada };
}

api.get("/transmisiones", requiere(), async (c) => {
  return c.json(await base(c.env).todos(`SELECT t.*, u.nombre AS autor FROM transmisiones t LEFT JOIN usuarios u ON u.id = t.autor_id
    ORDER BY CASE t.estado WHEN 'en_vivo' THEN 0 WHEN 'programada' THEN 1 ELSE 2 END, COALESCE(NULLIF(t.inicio,''), t.programada_para, t.creado_en) DESC LIMIT 100`));
});
api.post("/transmisiones", requiere(), async (c) => {
  let t;
  try { t = transmisionDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  const ahora = ahoraIso();
  const r = await base(c.env).correr(`INSERT INTO transmisiones (titulo, descripcion, enlace, estado, programada_para, inicio, fin, autor_id, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, t.titulo, t.descripcion, t.enlace, t.estado, t.programada_para,
    t.estado === "programada" ? "" : ahora, t.estado === "terminada" ? ahora : "", c.get("usuario").id, ahora);
  return c.json(await base(c.env).uno("SELECT * FROM transmisiones WHERE id = ?", r.meta.last_row_id), 201);
});
api.put("/transmisiones/:id", requiere(), async (c) => {
  const id = Number(c.req.param("id"));
  const b = base(c.env);
  const actual = await b.uno("SELECT * FROM transmisiones WHERE id = ?", id);
  if (!actual) return error(c, 404, "Esa transmisión ya no existe.");
  let t;
  try { t = transmisionDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  const ahora = ahoraIso();
  const inicio = t.estado !== "programada" && !actual.inicio ? ahora : actual.inicio;
  const fin = t.estado === "terminada" ? actual.fin || ahora : "";
  await b.correr("UPDATE transmisiones SET titulo=?, descripcion=?, enlace=?, estado=?, programada_para=?, inicio=?, fin=? WHERE id=?",
    t.titulo, t.descripcion, t.enlace, t.estado, t.programada_para, inicio, fin, id);
  return c.json(await b.uno("SELECT * FROM transmisiones WHERE id = ?", id));
});
api.delete("/transmisiones/:id", requiere(), async (c) => {
  await base(c.env).correr("DELETE FROM transmisiones WHERE id = ?", Number(c.req.param("id")));
  return c.json({ ok: true });
});

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
    espacio: b.espacio, tipo, nombre: texto(b.nombre, 120) || "Anuncio sin nombre",
    src, src_movil: texto(b.src_movil, 500), poster: texto(b.poster, 500),
    enlace: texto(b.enlace, 500), html: texto(b.html, 20000),
    desde: fecha(b.desde), hasta: fecha(b.hasta),
    duracion: Math.min(Math.max(Number(b.duracion) || 0, 0), 300),
    activo: b.activo === undefined ? 1 : bool(b.activo),
  };
}

api.get("/espacios", requiere("admin"), (c) => c.json(ESPACIOS));
api.get("/anuncios", requiere("admin"), async (c) => {
  const filas = await base(c.env).todos("SELECT * FROM anuncios ORDER BY espacio, orden, id");
  return c.json(filas.map((a) => ({ ...a, activo: !!a.activo })));
});
api.post("/anuncios", requiere("admin"), async (c) => {
  let a;
  try { a = anuncioDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  const b = base(c.env);
  const orden = (await b.uno("SELECT COALESCE(MAX(orden), -1) + 1 AS o FROM anuncios WHERE espacio = ?", a.espacio)).o;
  const r = await b.correr(`INSERT INTO anuncios (espacio, tipo, nombre, src, src_movil, poster, enlace, html, desde, hasta, duracion, activo, orden, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, a.espacio, a.tipo, a.nombre, a.src, a.src_movil, a.poster, a.enlace, a.html,
    a.desde, a.hasta, a.duracion, a.activo, orden, ahoraIso());
  return c.json(await b.uno("SELECT * FROM anuncios WHERE id = ?", r.meta.last_row_id), 201);
});
api.patch("/anuncios/orden", requiere("admin"), async (c) => {
  const d = await cuerpo(c);
  const ids = Array.isArray(d.ids) ? d.ids.map(Number) : [];
  if (ids.length) await base(c.env).lote(ids.map((id, i) => ["UPDATE anuncios SET orden = ? WHERE id = ?", i, id]));
  return c.json({ ok: true });
});
api.put("/anuncios/:id", requiere("admin"), async (c) => {
  let a;
  try { a = anuncioDesdeCuerpo(await cuerpo(c)); } catch (e) { return error(c, 400, e.message); }
  const id = Number(c.req.param("id"));
  const b = base(c.env);
  const previo = await b.uno("SELECT src, src_movil, poster FROM anuncios WHERE id = ?", id);
  if (!previo) return error(c, 404, "Ese anuncio ya no existe.");
  await b.correr(`UPDATE anuncios SET espacio=?, tipo=?, nombre=?, src=?, src_movil=?, poster=?, enlace=?, html=?, desde=?, hasta=?, duracion=?, activo=?
    WHERE id=?`, a.espacio, a.tipo, a.nombre, a.src, a.src_movil, a.poster, a.enlace, a.html, a.desde, a.hasta, a.duracion, a.activo, id);
  c.executionCtx.waitUntil(borrarArchivosSueltos(c, [previo.src, previo.src_movil, previo.poster]));
  return c.json(await b.uno("SELECT * FROM anuncios WHERE id = ?", id));
});
api.delete("/anuncios/:id", requiere("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = base(c.env);
  const a = await b.uno("SELECT src, src_movil, poster FROM anuncios WHERE id = ?", id);
  if (!a) return error(c, 404, "Ese anuncio ya no existe.");
  await b.lote([["DELETE FROM anuncios WHERE id = ?", id], ["DELETE FROM eventos_anuncio WHERE anuncio_id = ?", id]]);
  c.executionCtx.waitUntil(borrarArchivosSueltos(c, [a.src, a.src_movil, a.poster]));
  return c.json({ ok: true });
});

/* ---------------- Estadísticas, usuarios y ajustes (solo admin) ---------------- */
api.get("/estadisticas", requiere("admin"), async (c) => c.json(await resumen(c.env, c.req.query("dias"))));

const COLUMNAS_USUARIO = "id, usuario, nombre, rol, creado_en";
api.get("/usuarios", requiere("admin"), async (c) => c.json(await base(c.env).todos(`SELECT ${COLUMNAS_USUARIO} FROM usuarios ORDER BY id`)));
api.post("/usuarios", requiere("admin"), async (c) => {
  const d = await cuerpo(c);
  try {
    const id = await crearUsuario(c.env, { usuario: texto(d.usuario, 30), nombre: texto(d.nombre, 80), rol: d.rol, clave: d.clave });
    return c.json(await base(c.env).uno(`SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE id = ?`, id), 201);
  } catch (e) {
    return error(c, 400, /UNIQUE/.test(e.message) ? "Ya existe un usuario con ese nombre." : e.message);
  }
});
api.put("/usuarios/:id", requiere("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const d = await cuerpo(c);
  const b = base(c.env);
  const u = await b.uno("SELECT * FROM usuarios WHERE id = ?", id);
  if (!u) return error(c, 404, "Ese usuario ya no existe.");
  const rol = ["admin", "editor"].includes(d.rol) ? d.rol : u.rol;
  if (id === c.get("usuario").id && rol !== "admin") return error(c, 400, "No puedes quitarte el rol de administrador a ti mismo.");
  const sentencias = [["UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?", texto(d.nombre, 80) || u.nombre, rol, id]];
  if (d.clave) {
    try { validarClave(d.clave); } catch (e) { return error(c, 400, e.message); }
    sentencias.push(["UPDATE usuarios SET clave = ? WHERE id = ?", await hashClave(d.clave), id], ["DELETE FROM sesiones WHERE usuario_id = ?", id]);
  }
  await b.lote(sentencias);
  return c.json(await b.uno(`SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE id = ?`, id));
});
api.delete("/usuarios/:id", requiere("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("usuario").id) return error(c, 400, "No puedes borrar tu propio usuario.");
  await base(c.env).correr("DELETE FROM usuarios WHERE id = ?", id);
  return c.json({ ok: true });
});

api.get("/ajustes", requiere("admin"), async (c) => {
  const a = await ajustes(c.env);
  return c.json({ whatsapp: a.whatsapp || "", seguidores: a.seguidores || config.seguidores });
});
api.put("/ajustes", requiere("admin"), async (c) => {
  const d = await cuerpo(c);
  await guardarAjuste(c.env, "whatsapp", texto(d.whatsapp, 20).replace(/[^\d]/g, ""));
  await guardarAjuste(c.env, "seguidores", texto(d.seguidores, 12) || config.seguidores);
  return c.json({ ok: true });
});

/* ---------------- Público: vistas y clics de anuncios ---------------- */
api.post("/evento", async (c) => {
  try {
    const datos = JSON.parse(await c.req.text());
    await registrarEventoAnuncio(c, Number(datos.anuncio), datos.tipo);
  } catch {}
  return c.body(null, 204);
});

api.all("*", (c) => error(c, 404, "Esa dirección no existe."));
