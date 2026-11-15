import { slug } from "./util.js";

/** Atajos para la base D1 */
export function base(env) {
  const db = env.DB;
  return {
    uno: (sql, ...p) => db.prepare(sql).bind(...p).first(),
    todos: async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [],
    correr: (sql, ...p) => db.prepare(sql).bind(...p).run(),
    lote: (sentencias) => db.batch(sentencias.map(([sql, ...p]) => db.prepare(sql).bind(...p))),
  };
}

export async function slugUnico(env, titulo, idActual = 0) {
  const b = base(env);
  const raiz = slug(titulo);
  let s = raiz, n = 2;
  while (await b.uno("SELECT id FROM noticias WHERE slug = ? AND id != ?", s, idActual)) s = `${raiz}-${n++}`;
  return s;
}

export async function ajustes(env) {
  const filas = await base(env).todos("SELECT clave, valor FROM ajustes");
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export function guardarAjuste(env, clave, valor) {
  return base(env).correr("INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", clave, String(valor));
}
