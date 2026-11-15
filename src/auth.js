import crypto from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import { ahoraIso } from "./util.js";

const COOKIE = "ns_sesion";
const DURACION_DIAS = 14;

export function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export function verificarClave(clave, guardada) {
  const [, salHex, hashHex] = String(guardada).split("$");
  if (!salHex || !hashHex) return false;
  const hash = crypto.scryptSync(clave, Buffer.from(salHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export function crearUsuario({ usuario, nombre, rol, clave }) {
  if (!/^[a-z0-9._-]{3,30}$/i.test(usuario)) throw new Error("El usuario debe tener de 3 a 30 letras, números, punto o guion.");
  if (!["admin", "editor"].includes(rol)) throw new Error("El rol debe ser admin o editor.");
  validarClave(clave);
  return db.prepare("INSERT INTO usuarios (usuario, nombre, rol, clave, creado_en) VALUES (?, ?, ?, ?, ?)")
    .run(usuario, nombre || usuario, rol, hashClave(clave), ahoraIso()).lastInsertRowid;
}

export function validarClave(clave) {
  if (String(clave || "").length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
}

function firmar(id) {
  const firma = crypto.createHmac("sha256", config.secreto).update(id).digest("base64url");
  return `${id}.${firma}`;
}
function leerFirmado(valor) {
  const [id, firma] = String(valor || "").split(".");
  if (!id || !firma) return null;
  const esperada = crypto.createHmac("sha256", config.secreto).update(id).digest("base64url");
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

function leerCookie(req, nombre) {
  const cab = req.headers.cookie || "";
  for (const parte of cab.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function iniciarSesion(res, usuarioId) {
  const id = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DURACION_DIAS * 864e5);
  db.prepare("DELETE FROM sesiones WHERE expira < ?").run(ahoraIso());
  db.prepare("INSERT INTO sesiones (id, usuario_id, expira) VALUES (?, ?, ?)").run(id, usuarioId, expira.toISOString());
  res.cookie(COOKIE, firmar(id), {
    httpOnly: true, sameSite: "lax", secure: config.produccion, expires: expira, path: "/",
  });
}

export function cerrarSesion(req, res) {
  const id = leerFirmado(leerCookie(req, COOKIE));
  if (id) db.prepare("DELETE FROM sesiones WHERE id = ?").run(id);
  res.clearCookie(COOKIE, { path: "/" });
}

/** Coloca req.usuario si la sesión es válida */
export function sesion(req, _res, next) {
  const id = leerFirmado(leerCookie(req, COOKIE));
  if (id) {
    req.usuario = db.prepare(`SELECT u.id, u.usuario, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ? AND s.expira > ?`).get(id, ahoraIso()) || null;
  }
  next();
}

export function requiere(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: "Tu sesión terminó. Vuelve a ingresar." });
    if (roles.length && !roles.includes(req.usuario.rol)) return res.status(403).json({ error: "Tu usuario no tiene permiso para esta sección." });
    next();
  };
}

/** Evita que otra página envíe formularios al panel (CSRF): exige el mismo origen */
export function mismoOrigen(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origen = req.headers.origin || req.headers.referer || "";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    if (origen && new URL(origen).host === host) return next();
  } catch {}
  res.status(403).json({ error: "Solicitud rechazada por seguridad. Recarga el panel e inténtalo de nuevo." });
}

/* Límite de intentos de ingreso: 8 cada 15 minutos por IP */
const intentos = new Map();
export function limiteIngreso(req, res, next) {
  const ip = req.ip;
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter((t) => ahora - t < 15 * 60e3);
  if (lista.length >= 8) return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos y vuelve a probar." });
  lista.push(ahora);
  intentos.set(ip, lista);
  next();
}
export function limpiarIntentos(ip) { intentos.delete(ip); }
