// Crear usuarios o cambiar contraseñas desde la terminal del servidor.
//   npm run usuario -- crear <usuario> <admin|editor> "<Nombre>"   (pide la contraseña)
//   npm run usuario -- clave <usuario>                              (pide la nueva contraseña)
//   npm run usuario -- lista
import readline from "node:readline";
import { db } from "./db.js";
import { crearUsuario, hashClave, validarClave } from "./auth.js";

const [accion, usuario, rol, nombre] = process.argv.slice(2);

function preguntar(texto) {
  if (process.env.CLAVE) return Promise.resolve(process.env.CLAVE);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((ok) => rl.question(texto, (r) => { rl.close(); ok(r); }));
}

try {
  if (accion === "lista") {
    console.table(db.prepare("SELECT usuario, nombre, rol, creado_en FROM usuarios").all());
  } else if (accion === "crear" && usuario && rol) {
    const clave = await preguntar("Contraseña (mínimo 10 caracteres): ");
    crearUsuario({ usuario, rol, nombre: nombre || usuario, clave });
    console.log(`Usuario "${usuario}" creado como ${rol}.`);
  } else if (accion === "clave" && usuario) {
    const clave = await preguntar("Nueva contraseña (mínimo 10 caracteres): ");
    validarClave(clave);
    const r = db.prepare("UPDATE usuarios SET clave = ? WHERE usuario = ?").run(hashClave(clave), usuario);
    if (!r.changes) throw new Error(`No existe el usuario "${usuario}".`);
    db.prepare("DELETE FROM sesiones WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = ?)").run(usuario);
    console.log(`Contraseña de "${usuario}" actualizada.`);
  } else {
    console.log('Uso:\n  npm run usuario -- crear <usuario> <admin|editor> "<Nombre>"\n  npm run usuario -- clave <usuario>\n  npm run usuario -- lista');
    process.exitCode = 1;
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
}
