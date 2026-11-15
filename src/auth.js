import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { base } from "./db.js";
import { ahoraIso } from "./util.js";

const COOKIE = "ns_sesion";
const DURACION_DIAS = 14;
const ITERACIONES = 100000; // máximo que permite Cloudflare Workers para PBKDF2

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

async function derivar(clave, sal, iteraciones) {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones }, llave, 256);
}

export async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${hex(sal)}$${hex(await derivar(clave, sal, ITERACIONES))}`;
}

export async function verificarClave(clave, guardada) {
  const [tipo, it, salHex, hashHex] = String(guardada || "").split("$");
  if (tipo !== "pbkdf2" || !salHex || !hashHex) return false;
  const calculado = new Uint8Array(await derivar(clave, deHex(salHex), Number(it)));
  const esperado = deHex(hashHex);
  if (calculado.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= calculado[i] ^ esperado[i];
  return dif === 0;
}

export function validarClave(clave) {
  if (String(clave || "").length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
}

export async function crearUsuario(env, { usuario, nombre, rol, clave }) {
  if (!/^[a-z0-9._-]{3,30}$/i.test(usuario || "")) throw new Error("El usuario debe tener de 3 a 30 letras, números, punto o guion.");
  if (!["admin", "editor"].includes(rol)) throw new Error("El rol debe ser admin o editor.");
  validarClave(clave);
  const r = await base(env).correr("INSERT INTO usuarios (usuario, nombre, rol, clave, creado_en) VALUES (?, ?, ?, ?, ?)",
    usuario, nombre || usuario, rol, await hashClave(clave), ahoraIso());
  return r.meta.last_row_id;
}

const opcionesCookie = (c, expira) => ({
  httpOnly: true, sameSite: "Lax", path: "/", expires: expira,
  secure: new URL(c.req.url).protocol === "https:",
});

export async function iniciarSesion(c, usuarioId) {
  const id = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expira = new Date(Date.now() + DURACION_DIAS * 864e5);
  const b = base(c.env);
  await b.lote([
    ["DELETE FROM sesiones WHERE expira < ?", ahoraIso()],
    ["INSERT INTO sesiones (id, usuario_id, expira) VALUES (?, ?, ?)", id, usuarioId, expira.toISOString()],
  ]);
  await setSignedCookie(c, COOKIE, id, c.env.SECRETO, opcionesCookie(c, expira));
}

export async function cerrarSesion(c) {
  const id = await getSignedCookie(c, c.env.SECRETO, COOKIE);
  if (id) await base(c.env).correr("DELETE FROM sesiones WHERE id = ?", id);
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Coloca c.var.usuario si la sesión es válida (solo cuando hay cookie) */
export async function sesion(c, next) {
  if ((c.req.header("cookie") || "").includes(COOKIE)) {
    const id = await getSignedCookie(c, c.env.SECRETO, COOKIE);
    if (id) {
      const u = await base(c.env).uno(`SELECT u.id, u.usuario, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = ? AND s.expira > ?`, id, ahoraIso());
      if (u) c.set("usuario", u);
    }
  }
  await next();
}

export function requiere(...roles) {
  return async (c, next) => {
    const u = c.get("usuario");
    if (!u) return c.json({ error: "Tu sesión terminó. Vuelve a ingresar." }, 401);
    if (roles.length && !roles.includes(u.rol)) return c.json({ error: "Tu usuario no tiene permiso para esta sección." }, 403);
    await next();
  };
}

/** Evita que otra página envíe datos al panel (CSRF): exige el mismo origen */
export async function mismoOrigen(c, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const origen = c.req.header("origin") || c.req.header("referer") || "";
  try {
    if (origen && new URL(origen).host === new URL(c.req.url).host) return next();
  } catch {}
  return c.json({ error: "Solicitud rechazada por seguridad. Recarga el panel e inténtalo de nuevo." }, 403);
}

/* Límite de intentos de ingreso por IP: 8 cada 15 minutos (guardado en la base) */
export async function limiteIngreso(c, next) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  const b = base(c.env);
  const clave = `intentos:${ip}`;
  const fila = await b.uno("SELECT valor FROM ajustes WHERE clave = ?", clave);
  const ahora = Date.now();
  const lista = (fila ? JSON.parse(fila.valor) : []).filter((t) => ahora - t < 15 * 60e3);
  if (lista.length >= 8) return c.json({ error: "Demasiados intentos. Espera 15 minutos y vuelve a probar." }, 429);
  lista.push(ahora);
  await b.correr("INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", clave, JSON.stringify(lista));
  c.set("claveIntentos", clave);
  await next();
}
