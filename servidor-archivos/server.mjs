// Servidor de archivos de Novedades Sucumbíos (corre en el VPS).
// Recibe subidas y borrados firmados por la web en Cloudflare. Los archivos los entrega Caddy.
//   PUT    /subidas/AAAA-MM/xxxxxxxxxxxxxxxx.ext?expira=…&firma=…   → guarda el archivo
//   DELETE /subidas/AAAA-MM/xxxxxxxxxxxxxxxx.ext?expira=…&firma=…   → lo borra
// Variables: MEDIA_SECRETO (la misma que en Cloudflare), ORIGENES (dominios del panel), CARPETA, PUERTO.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";

const SECRETO = process.env.MEDIA_SECRETO;
const CARPETA = path.resolve(process.env.CARPETA || "/archivos");
const PUERTO = Number(process.env.PUERTO || 3000);
const ORIGENES = (process.env.ORIGENES || "").split(",").map((o) => o.trim()).filter(Boolean);
const MAXIMO = 1024 * 1024 * 1024;
const CLAVE = /^subidas\/\d{4}-\d{2}\/[a-f0-9]{16}\.(jpg|png|webp|gif|avif|mp4|webm|mov)$/;

if (!SECRETO || SECRETO.length < 32) {
  console.error("Falta MEDIA_SECRETO (mínimo 32 caracteres, el mismo que en Cloudflare).");
  process.exit(1);
}

function firmaValida(metodo, clave, expira, firma) {
  if (!/^\d+$/.test(expira || "") || Number(expira) < Date.now() / 1000) return false;
  const esperada = crypto.createHmac("sha256", SECRETO).update(`${metodo}\n${clave}\n${expira}`).digest("hex");
  const a = Buffer.from(String(firma || ""), "hex"), b = Buffer.from(esperada, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function responder(req, res, codigo, datos) {
  const origen = req.headers.origin;
  if (origen && ORIGENES.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
  }
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(datos === undefined ? "" : JSON.stringify(datos));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  const clave = decodeURIComponent(url.pathname.slice(1));

  if (req.method === "OPTIONS") {
    const origen = req.headers.origin;
    if (origen && ORIGENES.includes(origen)) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origen,
        "Access-Control-Allow-Methods": "PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      });
    } else res.writeHead(403);
    return res.end();
  }
  if (url.pathname === "/salud") return responder(req, res, 200, { ok: true });
  if (!["PUT", "DELETE"].includes(req.method)) return responder(req, res, 405, { error: "Método no permitido." });
  if (!CLAVE.test(clave)) return responder(req, res, 400, { error: "Ruta de archivo no válida." });
  if (!firmaValida(req.method, clave, url.searchParams.get("expira"), url.searchParams.get("firma"))) {
    return responder(req, res, 403, { error: "El permiso de subida no es válido o ya venció. Vuelve a intentarlo desde el panel." });
  }

  const destino = path.join(CARPETA, clave);
  if (!destino.startsWith(CARPETA + path.sep)) return responder(req, res, 400, { error: "Ruta de archivo no válida." });

  if (req.method === "DELETE") {
    fs.rmSync(destino, { force: true });
    return responder(req, res, 200, { ok: true });
  }

  const largo = Number(req.headers["content-length"] || 0);
  if (largo > MAXIMO) return responder(req, res, 413, { error: "El archivo pesa más de 1 GB." });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.${process.pid}.parcial`;
  let recibido = 0;
  req.on("data", (trozo) => {
    recibido += trozo.length;
    if (recibido > MAXIMO) req.destroy(new Error("demasiado grande"));
  });
  try {
    await pipeline(req, fs.createWriteStream(temporal, { flags: "wx" }));
    fs.renameSync(temporal, destino);
    responder(req, res, 201, { ok: true, url: "/" + clave, bytes: recibido });
  } catch (e) {
    fs.rmSync(temporal, { force: true });
    if (!res.headersSent) responder(req, res, 400, { error: "La subida se cortó. Revisa tu conexión e inténtalo de nuevo." });
  }
});

servidor.requestTimeout = 0; // videos grandes con internet lento
servidor.listen(PUERTO, () => console.log(`Servidor de archivos listo en el puerto ${PUERTO}, carpeta ${CARPETA}`));
