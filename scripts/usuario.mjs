// Crear usuarios o cambiar contraseñas en la base de Cloudflare D1.
//   npm run usuario -- crear <usuario> <admin|editor> "<Nombre>" [--remoto]
//   npm run usuario -- clave <usuario> [--remoto]
//   npm run usuario -- lista [--remoto]
// Sin --remoto trabaja con la base local de pruebas (wrangler dev).
import { execFileSync } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const remoto = args.includes("--remoto");
const [accion, usuario, rol, nombre] = args.filter((a) => a !== "--remoto");
const ITERACIONES = 100000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: ITERACIONES }, llave, 256);
  return `pbkdf2$${ITERACIONES}$${hex(sal)}$${hex(bits)}`;
}
const sql = (t) => `'${String(t).replace(/'/g, "''")}'`;

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
function d1(comando) {
  const salida = execFileSync(process.execPath, [wrangler, "d1", "execute", "novedades-sucumbios", remoto ? "--remote" : "--local", "--json", "--command", comando],
    { encoding: "utf8" });
  return JSON.parse(salida)[0]?.results || [];
}

function preguntar(texto) {
  if (process.env.CLAVE) return Promise.resolve(process.env.CLAVE);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((ok) => rl.question(texto, (r) => { rl.close(); ok(r); }));
}

try {
  if (accion === "lista") {
    console.table(d1("SELECT usuario, nombre, rol, creado_en FROM usuarios"));
  } else if (accion === "crear" && usuario && ["admin", "editor"].includes(rol)) {
    const clave = await preguntar("Contraseña (mínimo 10 caracteres): ");
    if (clave.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
    d1(`INSERT INTO usuarios (usuario, nombre, rol, clave, creado_en) VALUES (${sql(usuario)}, ${sql(nombre || usuario)}, ${sql(rol)}, ${sql(await hashClave(clave))}, ${sql(new Date().toISOString())})`);
    console.log(`Usuario "${usuario}" creado como ${rol} en la base ${remoto ? "de Cloudflare" : "local"}.`);
  } else if (accion === "clave" && usuario) {
    const clave = await preguntar("Nueva contraseña (mínimo 10 caracteres): ");
    if (clave.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
    d1(`UPDATE usuarios SET clave = ${sql(await hashClave(clave))} WHERE usuario = ${sql(usuario)}`);
    d1(`DELETE FROM sesiones WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = ${sql(usuario)})`);
    console.log(`Contraseña de "${usuario}" actualizada.`);
  } else {
    console.log('Uso:\n  npm run usuario -- crear <usuario> <admin|editor> "<Nombre>" [--remoto]\n  npm run usuario -- clave <usuario> [--remoto]\n  npm run usuario -- lista [--remoto]');
    process.exitCode = 1;
  }
} catch (e) {
  console.error("Error:", e.message.split("\n")[0]);
  process.exitCode = 1;
}
