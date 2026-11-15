import fs from "node:fs";
import path from "node:path";
import express from "express";
import sharp from "sharp";
import { db, ajuste } from "./db.js";
import { config } from "./config.js";
import { escapar as e, slug, textoAHtml, textoPlano, fechaLarga, idYoutube } from "./util.js";
import { registrarVisita, hoy } from "./estadisticas.js";

export const paginas = express.Router();

const POR_PAGINA = 12;
const absoluta = (u) => (!u ? "" : /^https?:\/\//.test(u) ? u : config.sitio + (u.startsWith("/") ? u : "/" + u));
const cantonSlug = (c) => slug(c);
const cantonDeSlug = (s) => config.cantones.find((c) => slug(c) === s);
const urlNoticia = (n) => `/noticia/${n.slug}`;

/* ---------------- Consultas ---------------- */
const publicadas = "estado = 'publicada' AND publicada_en <= strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const q = {
  destacada: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} ORDER BY destacada DESC, publicada_en DESC LIMIT 1`),
  lista: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} AND id != ? ORDER BY publicada_en DESC LIMIT ? OFFSET ?`),
  total: db.prepare(`SELECT COUNT(*) AS n FROM noticias WHERE ${publicadas}`),
  porCanton: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} AND canton = ? ORDER BY publicada_en DESC LIMIT ? OFFSET ?`),
  totalCanton: db.prepare(`SELECT COUNT(*) AS n FROM noticias WHERE ${publicadas} AND canton = ?`),
  porSlug: db.prepare("SELECT n.*, u.nombre AS autor FROM noticias n LEFT JOIN usuarios u ON u.id = n.autor_id WHERE n.slug = ?"),
  relacionadas: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} AND id != ? ORDER BY (canton = ?) DESC, publicada_en DESC LIMIT 6`),
  masLeidas: db.prepare(`SELECT n.* FROM noticias n JOIN (SELECT noticia_id, COUNT(*) AS c FROM visitas WHERE dia >= ? AND noticia_id IS NOT NULL
      GROUP BY noticia_id) v ON v.noticia_id = n.id WHERE n.${publicadas.replace(" AND ", " AND n.")} ORDER BY v.c DESC LIMIT 5`),
  urgentes: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} AND urgente = 1 ORDER BY publicada_en DESC LIMIT 8`),
  recientes: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} ORDER BY publicada_en DESC LIMIT ?`),
  buscar: db.prepare(`SELECT * FROM noticias WHERE ${publicadas} AND (titulo LIKE ? OR resumen LIKE ? OR contenido LIKE ?) ORDER BY publicada_en DESC LIMIT 30`),
  anuncios: db.prepare("SELECT * FROM anuncios WHERE activo = 1 ORDER BY espacio, orden, id"),
};

/* ---------------- Anuncios para la página ---------------- */
function configAnuncios() {
  const dia = hoy();
  const espacios = {};
  for (const a of q.anuncios.all()) {
    if ((a.desde && dia < a.desde) || (a.hasta && dia > a.hasta)) continue;
    (espacios[a.espacio] ||= []).push({
      id: a.id, tipo: a.tipo, src: a.src, srcMovil: a.src_movil, poster: a.poster,
      enlace: a.enlace, html: a.html, duracion: a.duracion || 0, texto: a.nombre,
    });
  }
  return { rotacion: 9, contacto: { correo: config.correo, whatsapp: ajuste("whatsapp") }, espacios };
}
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

/* ---------------- Piezas de la página ---------------- */
function cabeza({ titulo, descripcion, canonica, imagen, tipo = "website", jsonld = [], noindex = false, extra = "" }) {
  const t = titulo ? `${titulo} | ${config.nombre}` : `${config.nombre}: noticias de Nueva Loja y toda la provincia`;
  const img = absoluta(imagen || "/assets/portada.jpg");
  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(t)}</title>
  <meta name="description" content="${e(descripcion || config.descripcion)}">
  <link rel="canonical" href="${e(absoluta(canonica || "/"))}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
  <meta name="theme-color" content="#0E1A12">
  <meta property="og:site_name" content="${e(config.nombre)}">
  <meta property="og:locale" content="es_EC">
  <meta property="og:type" content="${tipo}">
  <meta property="og:title" content="${e(titulo || config.nombre)}">
  <meta property="og:description" content="${e(descripcion || config.descripcion)}">
  <meta property="og:url" content="${e(absoluta(canonica || "/"))}">
  <meta property="og:image" content="${e(img)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(titulo || config.nombre)}">
  <meta name="twitter:description" content="${e(descripcion || config.descripcion)}">
  <meta name="twitter:image" content="${e(img)}">
  ${extra}
  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/logo-512.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="alternate" type="application/rss+xml" title="${e(config.nombre)}" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/estilos.css?v=3">
  <script>try{if(sessionStorage.getItem("intro-vista")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("sin-intro")}catch(e){document.documentElement.classList.add("sin-intro")}</script>
  ${jsonld.map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`).join("\n  ")}
</head>`;
}

function cinta() {
  let lista = q.urgentes.all();
  if (!lista.length) lista = q.recientes.all(5);
  const items = lista.map((n) => `<a href="${urlNoticia(n)}"><span>${e(n.canton)}</span>${e(n.titulo)}</a>`).join("");
  const copia = lista.map((n) => `<a href="${urlNoticia(n)}" tabindex="-1" aria-hidden="true"><span>${e(n.canton)}</span>${e(n.titulo)}</a>`).join("");
  return `<div class="ultima" role="region" aria-label="Última hora">
    <span class="ultima-tag"><span class="punto" aria-hidden="true"></span>Última hora</span>
    <div class="ultima-cinta"><div class="ultima-pista" style="--duracion:${Math.max(25, lista.length * 9)}s">${items}${copia}</div></div>
  </div>`;
}

function encabezado(actual = "") {
  const enlaces = [`<a href="/"${actual === "" ? ' aria-current="page"' : ""}>Todo</a>`]
    .concat(config.cantones.map((c) => `<a href="/canton/${cantonSlug(c)}"${actual === c ? ' aria-current="page"' : ""}>${e(c)}</a>`))
    .join("");
  return `<a class="saltar" href="#contenido">Ir al contenido</a>
  ${cinta()}
  <header class="cabecera">
    <a class="logo" href="/" aria-label="${e(config.nombre)}, inicio">
      <span class="marca marca--cabecera" aria-hidden="true"><img src="/assets/logo.webp" alt="" width="64" height="64"><span class="marca-brillo"></span></span>
      <span class="logo-texto">Novedades<br>Sucumbíos</span>
    </a>
    <nav class="cantones" aria-label="Noticias por cantón">${enlaces}</nav>
    <form class="buscador" action="/buscar" role="search">
      <label class="oculto" for="q">Buscar noticias</label>
      <input id="q" name="q" type="search" placeholder="Buscar" autocomplete="off">
    </form>
  </header>`;
}

const anuncio = (espacio, clase = espacio) =>
  `<aside class="anuncio anuncio--${clase}" data-espacio="${espacio}" aria-label="Publicidad"></aside>`;

function tarjetaFacebook() {
  const seguidores = ajuste("seguidores", config.seguidores);
  return `<section class="fb-tarjeta" aria-labelledby="fb-titulo">
    <div class="fb-portada"><img src="/assets/portada.webp" alt="" loading="lazy"></div>
    <img class="fb-logo" src="/assets/logo.webp" alt="" width="72" height="72" loading="lazy">
    <h2 id="fb-titulo">Síguenos en Facebook</h2>
    <p><strong>${e(seguidores)}</strong> personas ya reciben nuestras noticias y transmisiones en vivo.</p>
    <a class="boton boton--fb" href="${config.facebook}" target="_blank" rel="noopener">Seguir la página</a>
    <a class="fb-vivo" href="${config.facebook}/live_videos" target="_blank" rel="noopener"><span class="punto" aria-hidden="true"></span>Ver transmisiones en vivo</a>
  </section>`;
}

function lateral(extra = "") {
  return `<aside class="lateral">
    <div class="lateral-fijo">
      ${anuncio("lateral")}
      ${extra}
      ${tarjetaFacebook()}
    </div>
  </aside>`;
}

function pie() {
  const wa = ajuste("whatsapp");
  return `<section class="anunciate" id="anunciate" aria-labelledby="anunciate-titulo">
      <div class="envoltura anunciate-grid">
        <div>
          <h2 id="anunciate-titulo">Pon tu negocio frente a toda la provincia</h2>
          <p>Publicamos tu anuncio en imagen, GIF o video, en los espacios más vistos de la web. Tú eliges dónde sale y por cuántos días.</p>
          <div class="anunciate-acciones">
            <a class="boton boton--oro" href="mailto:${config.correo}?subject=${encodeURIComponent("Quiero anunciar en Novedades Sucumbíos")}">Escribir por correo</a>
            ${wa ? `<a class="boton boton--linea" href="https://wa.me/${e(wa)}?text=${encodeURIComponent("Hola, quiero anunciar en Novedades Sucumbíos")}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ""}
          </div>
        </div>
        <figure class="mapa-anuncios" aria-label="Lugares donde puede salir tu anuncio">
          <div class="ma-pagina">
            <div class="ma-portada">Portada</div>
            <div class="ma ma--cabecera">Banner principal</div>
            <div class="ma-cuerpo">
              <div class="ma-noticias"><i></i><i></i><div class="ma ma--entre">Entre noticias</div><i></i></div>
              <div class="ma ma--lateral">Lateral fijo</div>
            </div>
            <div class="ma ma--franja">Franja de video</div>
            <div class="ma ma--flotante">Flotante</div>
          </div>
          <figcaption>Cinco espacios. Cada uno acepta imagen, GIF, video o YouTube.</figcaption>
        </figure>
      </div>
    </section>
  </main>
  <footer class="pie">
    <div class="envoltura pie-grid">
      <div class="logo logo--pie">
        <span class="marca marca--cabecera" aria-hidden="true"><img src="/assets/logo.webp" alt="" width="64" height="64" loading="lazy"><span class="marca-brillo"></span></span>
        <span class="logo-texto">Novedades<br>Sucumbíos</span>
      </div>
      <p>Tratamos de ser la voz de muchos. Nueva Loja, Sucumbíos, Ecuador.</p>
      <nav class="pie-enlaces" aria-label="Redes y contacto">
        <a href="${config.facebook}" target="_blank" rel="noopener">Facebook</a>
        <a href="${config.telegram}" target="_blank" rel="noopener">Telegram</a>
        <a href="${config.tiktok}" target="_blank" rel="noopener">TikTok</a>
        <a href="/rss.xml">RSS</a>
        <a href="mailto:${config.correo}">${config.correo}</a>
      </nav>
    </div>
  </footer>
  <aside class="flotante" id="flotante" aria-label="Publicidad" hidden>
    <button class="flotante-cerrar" type="button" aria-label="Cerrar anuncio">×</button>
    <div class="anuncio anuncio--flotante" data-espacio="flotante"></div>
  </aside>
  <script>window.ANUNCIOS = ${jsonSeguro(configAnuncios())};</script>
  <script src="/js/app.js?v=3" defer></script>
</body>
</html>`;
}

function intro() {
  return `<div class="intro" id="intro" aria-hidden="true">
    <div class="marca marca--intro"><img src="/assets/logo.webp" alt=""><span class="marca-brillo"></span></div>
  </div>`;
}

function comunidad() {
  return `<section class="envoltura comunidad" aria-labelledby="comunidad-titulo">
      <h2 id="comunidad-titulo">Recibe las noticias donde prefieras</h2>
      <div class="redes">
        <a class="red red--fb" href="${config.facebook}" target="_blank" rel="noopener"><strong>Facebook</strong><span>Noticias y transmisiones en vivo</span></a>
        <a class="red red--tg" href="${config.telegram}" target="_blank" rel="noopener"><strong>Telegram</strong><span>Alertas al instante en tu celular</span></a>
        <a class="red red--tt" href="${config.tiktok}" target="_blank" rel="noopener"><strong>TikTok</strong><span>Videos cortos de la provincia</span></a>
      </div>
    </section>`;
}

const tiempo = (iso) => `<time datetime="${e(iso)}" data-relativo>${e(fechaLarga(iso))}</time>`;

function nota(n, conAnuncio = false) {
  return `<article class="nota${n.urgente ? " nota--urgente" : ""}${n.imagen ? " nota--foto" : ""}">
      <div class="nota-texto">
        <div class="nota-meta"><a class="nota-canton" href="/canton/${cantonSlug(n.canton)}">${e(n.canton)}</a>${tiempo(n.publicada_en)}${n.video ? '<span class="nota-video">Video</span>' : ""}</div>
        <h3><a href="${urlNoticia(n)}">${e(n.titulo)}</a></h3>
        ${n.resumen ? `<p>${e(n.resumen)}</p>` : ""}
      </div>
      ${n.imagen ? `<a class="nota-foto" href="${urlNoticia(n)}" tabindex="-1" aria-hidden="true"><img src="${e(n.imagen)}" alt="" loading="lazy"></a>` : ""}
    </article>${conAnuncio ? anuncio("entreNoticias", "entre") : ""}`;
}

function paginacion(base, pagina, total) {
  const paginas = Math.ceil(total / POR_PAGINA);
  if (paginas <= 1) return "";
  const url = (p) => (p === 1 ? base : `${base}${base.includes("?") ? "&" : "?"}pagina=${p}`);
  return `<nav class="paginacion" aria-label="Más noticias">
    ${pagina > 1 ? `<a href="${url(pagina - 1)}" rel="prev">Más recientes</a>` : "<span></span>"}
    <span>Página ${pagina} de ${paginas}</span>
    ${pagina < paginas ? `<a href="${url(pagina + 1)}" rel="next">Más antiguas</a>` : "<span></span>"}
  </nav>`;
}

function lista(noticias, vacio) {
  if (!noticias.length) return `<p class="vacio">${vacio}</p>`;
  return `<div class="noticias">${noticias.map((n, i) => nota(n, i === 2 || i === 7)).join("")}</div>`;
}

const organizacion = {
  "@type": "NewsMediaOrganization",
  "@id": `${config.sitio}/#organizacion`,
  name: config.nombre,
  url: config.sitio + "/",
  logo: { "@type": "ImageObject", url: absoluta("/assets/logo-512.png"), width: 512, height: 512 },
  sameAs: [config.facebook, config.telegram, config.tiktok],
  email: config.correo,
  address: { "@type": "PostalAddress", addressLocality: "Nueva Loja", addressRegion: "Sucumbíos", addressCountry: "EC" },
};

/* ---------------- Inicio y cantones ---------------- */
function portadaHtml(n) {
  if (!n) return "";
  return `<section class="portada" aria-labelledby="principal-titulo">
      <div class="portada-fondo" aria-hidden="true"><img src="/assets/portada.webp" alt="" fetchpriority="high"></div>
      <div class="portada-contenido">
        <article class="principal">
          <p class="etiqueta"><a href="/canton/${cantonSlug(n.canton)}">${e(n.canton)}</a> ${tiempo(n.publicada_en)}</p>
          <h1 id="principal-titulo"><a href="${urlNoticia(n)}">${e(n.titulo)}</a></h1>
          ${n.resumen ? `<p>${e(n.resumen)}</p>` : ""}
          <a class="boton boton--oro" href="${urlNoticia(n)}">Leer la nota completa</a>
        </article>
        <aside class="vivo">
          <a class="vivo-tarjeta" href="${config.facebook}/live_videos" target="_blank" rel="noopener">
            <span class="vivo-tag"><span class="punto" aria-hidden="true"></span>En vivo</span>
            <strong>Transmisiones desde la calle</strong>
            <span>Motocaravanas, eventos y lo que pasa en la provincia, en directo por Facebook.</span>
            <span class="vivo-ver">Ver transmisiones</span>
          </a>
          <div class="seguidores"><strong>${e(ajuste("seguidores", config.seguidores))}</strong><span>personas siguen la página en Facebook</span></div>
        </aside>
      </div>
    </section>`;
}

paginas.get(["/", "/index.html"], (req, res) => {
  if (req.path === "/index.html") return res.redirect(301, "/");
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const principal = q.destacada.get();
  const noticias = q.lista.all(principal?.id || 0, POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const total = Math.max(0, q.total.get().n - 1);
  registrarVisita(req, "/");
  const canonica = pagina > 1 ? `/?pagina=${pagina}` : "/";
  res.send(`${cabeza({
    canonica,
    titulo: pagina > 1 ? `Noticias, página ${pagina}` : "",
    jsonld: [
      organizacion,
      { "@context": "https://schema.org", "@type": "WebSite", "@id": `${config.sitio}/#sitio`, url: config.sitio + "/", name: config.nombre,
        inLanguage: "es-EC", publisher: { "@id": organizacion["@id"] },
        potentialAction: { "@type": "SearchAction", target: `${config.sitio}/buscar?q={q}`, "query-input": "required name=q" } },
    ].map((j) => ({ "@context": "https://schema.org", ...j })),
  })}
<body class="inicio">
  ${pagina === 1 ? intro() : ""}
  ${encabezado("")}
  <main id="contenido">
    ${pagina === 1 ? portadaHtml(principal) : `<h1 class="envoltura titulo-seccion">Noticias de Sucumbíos <small>Página ${pagina}</small></h1>`}
    <div class="envoltura">${anuncio("cabecera")}</div>
    <div class="envoltura columnas">
      <section class="lista" aria-labelledby="lo-ultimo">
        <div class="lista-cabeza"><h2 id="lo-ultimo">Lo último</h2><p class="lista-filtro">Toda la provincia</p></div>
        ${lista(noticias, "Todavía no hay más noticias publicadas.")}
        ${paginacion("/", pagina, total)}
      </section>
      ${lateral()}
    </div>
    <section class="franja" aria-label="Publicidad">${anuncio("franja")}</section>
    ${comunidad()}
  ${pie()}`);
});

paginas.get("/canton/:canton", (req, res, next) => {
  const canton = cantonDeSlug(req.params.canton);
  if (!canton) return next();
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const noticias = q.porCanton.all(canton, POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const total = q.totalCanton.get(canton).n;
  const base = `/canton/${req.params.canton}`;
  registrarVisita(req, base);
  const titulo = canton === "Provincia" ? "Noticias de toda la provincia" : `Noticias de ${canton}`;
  res.send(`${cabeza({
    titulo: titulo + (pagina > 1 ? `, página ${pagina}` : ""),
    descripcion: `Últimas noticias de ${canton}, Sucumbíos: sucesos, vías, comunidad, deportes y transmisiones en vivo.`,
    canonica: pagina > 1 ? `${base}?pagina=${pagina}` : base,
    jsonld: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: config.sitio + "/" },
      { "@type": "ListItem", position: 2, name: canton, item: config.sitio + base },
    ] }],
  })}
<body class="canton">
  ${encabezado(canton)}
  <main id="contenido">
    <div class="envoltura cabeza-seccion">
      <nav class="migas" aria-label="Estás en"><a href="/">Inicio</a><span aria-hidden="true">/</span><span>${e(canton)}</span></nav>
      <h1 class="titulo-seccion">${e(titulo)}</h1>
    </div>
    <div class="envoltura">${anuncio("cabecera")}</div>
    <div class="envoltura columnas">
      <section class="lista" aria-label="Noticias">
        ${lista(noticias, `Todavía no hay noticias de ${e(canton)}. <a href="/">Ver toda la provincia</a>`)}
        ${paginacion(base, pagina, total)}
      </section>
      ${lateral()}
    </div>
    ${comunidad()}
  ${pie()}`);
});

/* ---------------- Detalle de noticia ---------------- */
function videoHtml(n) {
  const v = n.video;
  if (!v) return "";
  const yt = idYoutube(v);
  if (yt) return `<div class="medio medio--video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0" title="${e(n.titulo)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  if (/facebook\.com|fb\.watch/.test(v)) {
    return `<div class="medio medio--video"><iframe src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v)}&show_text=false&width=1280" title="${e(n.titulo)}" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  }
  return `<div class="medio medio--video"><video controls playsinline preload="metadata"${n.imagen ? ` poster="${e(n.imagen)}"` : ""} src="${e(v)}"></video></div>`;
}

function insertarAnuncio(htmlCuerpo) {
  // anuncio "entre noticias" después del segundo párrafo
  let cuenta = 0;
  const pos = htmlCuerpo.replace(/<\/p>/g, (m) => (++cuenta === 2 ? m + anuncio("entreNoticias", "entre") : m));
  return cuenta >= 2 ? pos : htmlCuerpo + anuncio("entreNoticias", "entre");
}

function compartir(n) {
  const url = encodeURIComponent(absoluta(urlNoticia(n)));
  const texto = encodeURIComponent(n.titulo);
  return `<div class="compartir" aria-label="Compartir esta noticia">
    <a class="compartir-wa" href="https://wa.me/?text=${texto}%20${url}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="compartir-fb" href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">Facebook</a>
    <a class="compartir-tg" href="https://t.me/share/url?url=${url}&text=${texto}" target="_blank" rel="noopener">Telegram</a>
    <button type="button" class="compartir-copiar" data-url="${e(absoluta(urlNoticia(n)))}">Copiar enlace</button>
  </div>`;
}

paginas.get("/noticia/:slug", (req, res, next) => {
  const n = q.porSlug.get(req.params.slug);
  const visible = n && n.estado === "publicada" && new Date(n.publicada_en) <= new Date();
  if (!n || (!visible && !req.usuario)) return next();
  if (visible) registrarVisita(req, urlNoticia(n), n.id);

  const galeria = JSON.parse(n.galeria || "[]");
  const cuerpo = insertarAnuncio(textoAHtml(n.contenido || n.resumen));
  const descripcion = textoPlano(n.resumen || n.contenido, 158);
  const imagenOg = n.imagen ? `/og/${n.id}.jpg?v=${encodeURIComponent(n.actualizada_en)}` : "";
  const relacionadas = q.relacionadas.all(n.id, n.canton);
  const masLeidas = q.masLeidas.all(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).filter((m) => m.id !== n.id).slice(0, 5);

  const medio = n.video
    ? videoHtml(n)
    : n.imagen
      ? `<figure class="medio"><img src="${e(n.imagen)}" alt="${e(n.imagen_texto || n.titulo)}" fetchpriority="high">${n.imagen_texto ? `<figcaption>${e(n.imagen_texto)}</figcaption>` : ""}</figure>`
      : "";

  res.send(`${cabeza({
    titulo: n.titulo,
    descripcion,
    canonica: urlNoticia(n),
    imagen: imagenOg,
    tipo: "article",
    noindex: !visible,
    extra: `<meta property="article:published_time" content="${e(n.publicada_en)}">
  <meta property="article:modified_time" content="${e(n.actualizada_en)}">
  <meta property="article:section" content="${e(n.canton)}">`,
    jsonld: [
      { "@context": "https://schema.org", "@type": "NewsArticle",
        mainEntityOfPage: { "@type": "WebPage", "@id": absoluta(urlNoticia(n)) },
        headline: n.titulo.slice(0, 110), description: descripcion,
        image: n.imagen ? [absoluta(imagenOg), absoluta(n.imagen)] : [absoluta("/assets/portada.jpg")],
        datePublished: n.publicada_en, dateModified: n.actualizada_en,
        articleSection: n.canton, inLanguage: "es-EC",
        contentLocation: { "@type": "Place", name: `${n.canton}, Sucumbíos, Ecuador` },
        author: n.autor ? { "@type": "Person", name: n.autor } : { "@type": "Organization", name: config.nombre, url: config.sitio + "/" },
        publisher: { "@type": "NewsMediaOrganization", name: config.nombre, logo: { "@type": "ImageObject", url: absoluta("/assets/logo-512.png") } },
        ...(n.video && !/^https?:/.test(n.video) ? { video: { "@type": "VideoObject", name: n.titulo, description: descripcion, contentUrl: absoluta(n.video),
          thumbnailUrl: absoluta(n.imagen || "/assets/portada.jpg"), uploadDate: n.publicada_en } } : {}) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: config.sitio + "/" },
        { "@type": "ListItem", position: 2, name: n.canton, item: `${config.sitio}/canton/${cantonSlug(n.canton)}` },
        { "@type": "ListItem", position: 3, name: n.titulo },
      ] },
    ],
  })}
<body class="detalle">
  ${encabezado(n.canton)}
  <main id="contenido">
    ${!visible ? `<p class="aviso-borrador envoltura">Vista previa: esta noticia ${n.estado === "borrador" ? "es un borrador" : "está programada"} y el público todavía no la ve.</p>` : ""}
    <article class="articulo">
      <header class="envoltura articulo-cabeza">
        <nav class="migas" aria-label="Estás en"><a href="/">Inicio</a><span aria-hidden="true">/</span><a href="/canton/${cantonSlug(n.canton)}">${e(n.canton)}</a></nav>
        <h1>${e(n.titulo)}</h1>
        ${n.resumen ? `<p class="articulo-resumen">${e(n.resumen)}</p>` : ""}
        <div class="articulo-meta">
          ${n.urgente ? '<span class="sello-urgente"><span class="punto" aria-hidden="true"></span>Última hora</span>' : ""}
          <span>${n.autor ? `Por ${e(n.autor)}, ` : ""}${tiempo(n.publicada_en)}</span>
          ${n.actualizada_en.slice(0, 16) !== n.publicada_en.slice(0, 16) && new Date(n.actualizada_en) > new Date(n.publicada_en) ? `<span>Actualizada: <time datetime="${e(n.actualizada_en)}">${e(fechaLarga(n.actualizada_en))}</time></span>` : ""}
        </div>
        ${compartir(n)}
      </header>
      <div class="envoltura articulo-medio">${medio}</div>
      <div class="envoltura columnas">
        <div class="articulo-cuerpo">
          ${cuerpo}
          ${n.video && n.imagen ? `<figure class="medio medio--secundario"><img src="${e(n.imagen)}" alt="${e(n.imagen_texto || n.titulo)}" loading="lazy">${n.imagen_texto ? `<figcaption>${e(n.imagen_texto)}</figcaption>` : ""}</figure>` : ""}
          ${galeria.length ? `<section class="galeria" aria-label="Galería de fotos"><h2>Fotos</h2><div class="galeria-grid">${galeria.map((g, i) => `<a href="${e(g)}" data-galeria="${i}"><img src="${e(g)}" alt="Foto ${i + 1} de ${galeria.length}" loading="lazy"></a>`).join("")}</div></section>` : ""}
          ${n.enlace_facebook ? `<p class="articulo-fb"><a class="boton boton--fb" href="${e(n.enlace_facebook)}" target="_blank" rel="noopener">Comentar en Facebook</a></p>` : ""}
          ${compartir(n)}
        </div>
        ${lateral(masLeidas.length ? `<section class="mas-leidas" aria-labelledby="mas-leidas"><h2 id="mas-leidas">Lo más leído</h2><ol>${masLeidas.map((m) => `<li><a href="${urlNoticia(m)}">${e(m.titulo)}</a></li>`).join("")}</ol></section>` : "")}
      </div>
    </article>
    <div class="envoltura">${anuncio("cabecera")}</div>
    ${relacionadas.length ? `<section class="envoltura relacionadas" aria-labelledby="relacionadas"><h2 id="relacionadas">Más noticias</h2>
      <div class="relacionadas-grid">${relacionadas.map((r) => `<article><a href="${urlNoticia(r)}">
        <div class="rel-foto">${r.imagen ? `<img src="${e(r.imagen)}" alt="" loading="lazy">` : `<span>${e(r.canton)}</span>`}</div>
        <p class="nota-meta"><span class="nota-canton">${e(r.canton)}</span>${tiempo(r.publicada_en)}</p>
        <h3>${e(r.titulo)}</h3></a></article>`).join("")}</div></section>` : ""}
    ${comunidad()}
  ${pie()}`);
});

/* ---------------- Búsqueda ---------------- */
paginas.get("/buscar", (req, res) => {
  const termino = String(req.query.q || "").trim().slice(0, 80);
  const resultados = termino ? q.buscar.all(...Array(3).fill(`%${termino}%`)) : [];
  res.send(`${cabeza({ titulo: termino ? `Resultados para "${termino}"` : "Buscar noticias", canonica: "/buscar", noindex: true })}
<body class="busqueda">
  ${encabezado("-")}
  <main id="contenido">
    <div class="envoltura cabeza-seccion">
      <h1 class="titulo-seccion">${termino ? `Resultados para “${e(termino)}”` : "Buscar noticias"}</h1>
      <form class="buscador buscador--grande" action="/buscar" role="search"><label class="oculto" for="q2">Buscar noticias</label>
        <input id="q2" name="q" type="search" value="${e(termino)}" placeholder="Escribe un tema, un lugar o un nombre"><button class="boton boton--oro">Buscar</button></form>
    </div>
    <div class="envoltura columnas">
      <section class="lista" aria-label="Resultados">${termino ? lista(resultados, `No encontramos noticias con “${e(termino)}”. Prueba con otra palabra.`) : ""}</section>
      ${lateral()}
    </div>
  ${pie()}`);
});

/* ---------------- Imagen para compartir en Facebook/WhatsApp (1200×630) ---------------- */
const carpetaOg = path.join(config.datos, "og");
fs.mkdirSync(carpetaOg, { recursive: true });
paginas.get("/og/:id.jpg", async (req, res, next) => {
  const n = db.prepare("SELECT id, imagen, actualizada_en FROM noticias WHERE id = ?").get(Number(req.params.id));
  if (!n?.imagen) return next();
  const destino = path.join(carpetaOg, `${n.id}-${Date.parse(n.actualizada_en)}.jpg`);
  try {
    if (!fs.existsSync(destino)) {
      const origen = n.imagen.startsWith("/subidas/")
        ? path.join(config.subidas, n.imagen.slice(9))
        : path.join(config.publico, n.imagen.replace(/^\//, ""));
      if (!origen.startsWith(config.subidas) && !origen.startsWith(config.publico)) return next();
      await sharp(origen).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 82, mozjpeg: true }).toFile(destino);
    }
    res.set("Cache-Control", "public, max-age=604800").sendFile(destino);
  } catch {
    next();
  }
});

/* ---------------- SEO: robots, sitemaps, RSS, manifest ---------------- */
paginas.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /panel/\nDisallow: /api/\nDisallow: /buscar\n\nSitemap: ${config.sitio}/sitemap.xml\nSitemap: ${config.sitio}/sitemap-noticias.xml\n`);
});

paginas.get("/sitemap.xml", (_req, res) => {
  const noticias = db.prepare(`SELECT slug, actualizada_en, imagen FROM noticias WHERE ${publicadas} ORDER BY publicada_en DESC LIMIT 45000`).all();
  const urls = [
    `<url><loc>${config.sitio}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...config.cantones.map((c) => `<url><loc>${config.sitio}/canton/${cantonSlug(c)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`),
    ...noticias.map((n) => `<url><loc>${config.sitio}/noticia/${n.slug}</loc><lastmod>${n.actualizada_en}</lastmod>${n.imagen ? `<image:image><image:loc>${e(absoluta(n.imagen))}</image:loc></image:image>` : ""}</url>`),
  ];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`);
});

// Google News: solo las noticias de los últimos 2 días
paginas.get("/sitemap-noticias.xml", (_req, res) => {
  const desde = new Date(Date.now() - 2 * 864e5).toISOString();
  const noticias = db.prepare(`SELECT slug, titulo, publicada_en FROM noticias WHERE ${publicadas} AND publicada_en >= ? ORDER BY publicada_en DESC LIMIT 1000`).all(desde);
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${noticias.map((n) => `<url><loc>${config.sitio}/noticia/${n.slug}</loc><news:news><news:publication><news:name>${e(config.nombre)}</news:name><news:language>es</news:language></news:publication><news:publication_date>${n.publicada_en}</news:publication_date><news:title>${e(n.titulo)}</news:title></news:news></url>`).join("\n")}
</urlset>`);
});

paginas.get(["/rss.xml", "/feed"], (_req, res) => {
  const noticias = q.recientes.all(30);
  res.type("application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>${e(config.nombre)}</title>
  <link>${config.sitio}/</link>
  <description>${e(config.descripcion)}</description>
  <language>es-EC</language>
  <atom:link href="${config.sitio}/rss.xml" rel="self" type="application/rss+xml"/>
${noticias.map((n) => `  <item>
    <title>${e(n.titulo)}</title>
    <link>${config.sitio}/noticia/${n.slug}</link>
    <guid isPermaLink="true">${config.sitio}/noticia/${n.slug}</guid>
    <pubDate>${new Date(n.publicada_en).toUTCString()}</pubDate>
    <category>${e(n.canton)}</category>
    <description>${e(textoPlano(n.resumen || n.contenido, 300))}</description>${n.imagen ? `\n    <media:content url="${e(absoluta(n.imagen))}" medium="image"/>` : ""}
  </item>`).join("\n")}
</channel>
</rss>`);
});

paginas.get("/manifest.webmanifest", (_req, res) => {
  res.type("application/manifest+json").send(JSON.stringify({
    name: config.nombre, short_name: "Novedades", lang: "es-EC", start_url: "/", display: "standalone",
    background_color: "#0E1A12", theme_color: "#0E1A12",
    icons: [{ src: "/assets/favicon.png", sizes: "192x192", type: "image/png" }, { src: "/assets/logo-512.png", sizes: "512x512", type: "image/png" }],
  }));
});

/* ---------------- 404 ---------------- */
paginas.use((req, res) => {
  res.status(404).send(`${cabeza({ titulo: "Página no encontrada", canonica: req.path, noindex: true })}
<body class="error">
  ${encabezado("-")}
  <main id="contenido">
    <section class="envoltura no-encontrada">
      <h1>Esta página no existe o la noticia fue retirada</h1>
      <p>Revisa el enlace o vuelve a la portada para ver lo último de la provincia.</p>
      <a class="boton boton--oro" href="/">Ir a la portada</a>
    </section>
    <div class="envoltura columnas"><section class="lista" aria-label="Lo último">${lista(q.recientes.all(5), "")}</section></div>
  ${pie()}`);
});
