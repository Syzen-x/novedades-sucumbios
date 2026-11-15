export function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function slug(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 90) || "nota";
}

/** Texto del editor → HTML seguro.
 *  Párrafos separados por línea en blanco, "## " subtítulo, "> " cita,
 *  **negrita**, *cursiva*, [texto](https://enlace). */
export function textoAHtml(texto) {
  const enLinea = (t) =>
    escapar(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return String(texto || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      if (b.startsWith("## ")) return `<h2>${enLinea(b.slice(3))}</h2>`;
      if (b.startsWith("> ")) return `<blockquote>${enLinea(b.replace(/^> ?/gm, ""))}</blockquote>`;
      return `<p>${enLinea(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

export function textoPlano(texto, max = 160) {
  const t = String(texto || "").replace(/[#>*_\[\]]/g, "").replace(/\(https?:[^)]+\)/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
}

const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function fechaLarga(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const z = new Date(d.toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
  const h = String(z.getHours()).padStart(2, "0") + ":" + String(z.getMinutes()).padStart(2, "0");
  return `${z.getDate()} de ${meses[z.getMonth()]} de ${z.getFullYear()}, ${h}`;
}

/** ID de YouTube a partir de un enlace o del código suelto */
export function idYoutube(valor) {
  const v = String(valor || "").trim();
  const m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(v) ? v : "";
}

export function ahoraIso() {
  return new Date().toISOString();
}
