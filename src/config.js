import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datos = path.resolve(process.env.DATA_DIR || path.join(raiz, "data"));
fs.mkdirSync(path.join(datos, "subidas"), { recursive: true });

// Clave para firmar cookies y anonimizar visitas. Se crea una sola vez y se guarda.
function secreto() {
  if (process.env.SECRETO) return process.env.SECRETO;
  const archivo = path.join(datos, ".secreto");
  if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(archivo, "utf8").trim();
}

export const config = {
  raiz,
  publico: path.join(raiz, "public"),
  panel: path.join(raiz, "panel"),
  datos,
  subidas: path.join(datos, "subidas"),
  puerto: Number(process.env.PORT || 3000),
  sitio: (process.env.SITIO_URL || "http://localhost:3000").replace(/\/$/, ""),
  produccion: process.env.NODE_ENV === "production",
  secreto: secreto(),
  nombre: "Novedades Sucumbíos",
  descripcion: "Noticias de Nueva Loja, Lago Agrio, Shushufindi, Cascales, Putumayo, Cuyabeno y toda la provincia de Sucumbíos.",
  facebook: "https://www.facebook.com/novedadessucumbios",
  telegram: "https://t.me/novedadessucumbios",
  tiktok: "https://www.tiktok.com/@novedadesucumbio",
  correo: "sucumbiosaldia1@gmail.com",
  seguidores: "763K",
  cantones: ["Lago Agrio", "Shushufindi", "Cascales", "Gonzalo Pizarro", "Putumayo", "Sucumbíos", "Cuyabeno", "Provincia"],
};
