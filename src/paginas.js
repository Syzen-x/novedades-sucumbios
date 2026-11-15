import { Hono } from "hono";
import { base, ajustes } from "./db.js";
import { config, sitio } from "./config.js";
import { escapar as e, slug, textoAHtml, textoPlano, fechaLarga, idYoutube } from "./util.js";
import { registrarVisita, hoy } from "./estadisticas.js";

export const paginas = new Hono();

const POR_PAGINA = 12;
const cantonSlug = (c) => slug(c);
const cantonDeSlug = (s) => config.cantones.find((c) => slug(c) === s);
const urlNoticia = (n) => `/noticia/${n.slug}`;
const PUBLICADAS = "estado = 'publicada' AND publicada_en <= strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

/* ---------------- Datos que usan todas las páginas ---------------- */
async function comunes(c) {
  const b = base(c.env);
  const dia = hoy();
  const [aj, urgentes, recientes, anuncios, vivo, proxima] = await Promise.all([
    ajustes(c.env),
    b.todos(`SELECT slug, titulo, canton FROM noticias WHERE ${PUBLICADAS} AND urgente = 1 ORDER BY publicada_en DESC LIMIT 8`),
    b.todos(`SELECT slug, titulo, canton FROM noticias WHERE ${PUBLICADAS} ORDER BY publicada_en DESC LIMIT 5`),
    b.todos("SELECT * FROM anuncios WHERE activo = 1 ORDER BY espacio, orden, id"),
    b.uno("SELECT * FROM transmisiones WHERE estado = 'en_vivo' ORDER BY inicio DESC LIMIT 1"),
    b.uno("SELECT * FROM transmisiones WHERE estado = 'programada' AND programada_para > ? ORDER BY programada_para LIMIT 1", new Date().toISOString()),
  ]);
  const espacios = {};
  for (const a of anuncios) {
    if ((a.desde && dia < a.desde) || (a.hasta && dia > a.hasta)) continue;
    (espacios[a.espacio] ||= []).push({ id: a.id, tipo: a.tipo, src: a.src, srcMovil: a.src_movil, poster: a.poster,
      enlace: a.enlace, html: a.html, duracion: a.duracion || 0, texto: a.nombre });
  }
  const s = sitio(c);
  return {
    sitio: s,
    abs: (u) => (!u ? "" : /^https?:\/\//.test(u) ? u : s + (u.startsWith("/") ? u : "/" + u)),
    seguidores: aj.seguidores || config.seguidores,
    whatsapp: aj.whatsapp || "",
    cinta: urgentes.length ? urgentes : recientes,
    anuncios: { rotacion: 9, contacto: { correo: config.correo, whatsapp: aj.whatsapp || "" }, espacios },
    vivo,
    proxima,
  };
}

/* ---------------- Reproductor de Facebook o YouTube ---------------- */
function reproductor(enlace, titulo, { auto = false } = {}) {
  const yt = idYoutube(enlace);
  if (yt) {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0${auto ? "&autoplay=1&mute=1" : ""}" title="${e(titulo)}"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }
  if (/facebook\.com|fb\.watch/.test(enlace)) {
    return `<iframe src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(enlace)}&show_text=false&width=1280${auto ? "&autoplay=true&mute=true" : ""}"
      title="${e(titulo)}" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen" allowfullscreen></iframe>`;
  }
  return `<video controls playsinline preload="metadata" src="${e(enlace)}"></video>`;
}

const plataforma = (enlace) => (idYoutube(enlace) ? "Comentar en YouTube" : "Comentar en Facebook");

/* ---------------- Piezas de la página ---------------- */
function cabeza(d, { titulo, descripcion, canonica, imagen, tipo = "website", jsonld = [], noindex = false, extra = "" }) {
  const t = titulo ? `${titulo} | ${config.nombre}` : `${config.nombre}: noticias de Nueva Loja y toda la provincia`;
  const desc = descripcion || config.descripcion;
  const img = d.abs(imagen || "/assets/portada.jpg");
  const canon = d.abs(canonica || "/");
  return `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(t)}</title>
  <meta name="description" content="${e(desc)}">
  <link rel="canonical" href="${e(canon)}">
  <meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
  <meta name="theme-color" content="#0E1A12">
  <meta property="og:site_name" content="${e(config.nombre)}">
  <meta property="og:locale" content="es_EC">
  <meta property="og:type" content="${tipo}">
  <meta property="og:title" content="${e(titulo || config.nombre)}">
  <meta property="og:description" content="${e(desc)}">
  <meta property="og:url" content="${e(canon)}">
  <meta property="og:image" content="${e(img)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(titulo || config.nombre)}">
  <meta name="twitter:description" content="${e(desc)}">
  <meta name="twitter:image" content="${e(img)}">
  ${extra}
  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/logo-512.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="alternate" type="application/rss+xml" title="${e(config.nombre)}" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/estilos.css?v=4">
  <script>try{if(sessionStorage.getItem("intro-vista")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("sin-intro")}catch(e){document.documentElement.classList.add("sin-intro")}</script>
  ${jsonld.map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`).join("\n  ")}
</head>`;
}

function barraVivo(d, enPaginaVivo) {
  if (!d.vivo || enPaginaVivo) return "";
  return `<a class="barra-vivo" href="/en-vivo"><span class="vivo-sello"><span class="punto" aria-hidden="true"></span>En vivo ahora</span>
    <span class="barra-vivo-titulo">${e(d.vivo.titulo)}</span><span class="barra-vivo-ver">Ver transmisión</span></a>`;
}

function cinta(d) {
  const item = (n, oculto) => `<a href="${urlNoticia(n)}"${oculto ? ' tabindex="-1" aria-hidden="true"' : ""}><span>${e(n.canton)}</span>${e(n.titulo)}</a>`;
  return `<div class="ultima" role="region" aria-label="Última hora">
    <span class="ultima-tag"><span class="punto" aria-hidden="true"></span>Última hora</span>
    <div class="ultima-cinta"><div class="ultima-pista" style="--duracion:${Math.max(25, d.cinta.length * 9)}s">${d.cinta.map((n) => item(n)).join("")}${d.cinta.map((n) => item(n, true)).join("")}</div></div>
  </div>`;
}

function encabezado(d, actual = "") {
  const enlaces = [
    `<a class="nav-vivo${d.vivo ? " nav-vivo--activo" : ""}" href="/en-vivo"${actual === "vivo" ? ' aria-current="page"' : ""}>${d.vivo ? '<span class="punto" aria-hidden="true"></span>' : ""}En vivo</a>`,
    `<a href="/"${actual === "" ? ' aria-current="page"' : ""}>Todo</a>`,
    ...config.cantones.map((c) => `<a href="/canton/${cantonSlug(c)}"${actual === c ? ' aria-current="page"' : ""}>${e(c)}</a>`),
  ].join("");
  return `<a class="saltar" href="#contenido">Ir al contenido</a>
  ${barraVivo(d, actual === "vivo")}
  ${cinta(d)}
  <header class="cabecera">
    <a class="logo" href="/" aria-label="${e(config.nombre)}, inicio">
      <span class="marca marca--cabecera" aria-hidden="true"><img src="/assets/logo.webp" alt="" width="64" height="64"><span class="marca-brillo"></span></span>
      <span class="logo-texto">Novedades<br>Sucumbíos</span>
    </a>
    <nav class="cantones" aria-label="Secciones">${enlaces}</nav>
    <form class="buscador" action="/buscar" role="search">
      <label class="oculto" for="q">Buscar noticias</label>
      <input id="q" name="q" type="search" placeholder="Buscar" autocomplete="off">
    </form>
  </header>`;
}

const anuncio = (espacio, clase = espacio) => `<aside class="anuncio anuncio--${clase}" data-espacio="${espacio}" aria-label="Publicidad"></aside>`;

function tarjetaFacebook(d) {
  return `<section class="fb-tarjeta" aria-labelledby="fb-titulo">
    <div class="fb-portada"><img src="/assets/portada.webp" alt="" loading="lazy"></div>
    <img class="fb-logo" src="/assets/logo.webp" alt="" width="72" height="72" loading="lazy">
    <h2 id="fb-titulo">Síguenos en Facebook</h2>
    <p><strong>${e(d.seguidores)}</strong> personas ya reciben nuestras noticias y transmisiones en vivo.</p>
    <a class="boton boton--fb" href="${config.facebook}" target="_blank" rel="noopener">Seguir la página</a>
    <a class="fb-vivo" href="/en-vivo"><span class="punto" aria-hidden="true"></span>Ver transmisiones en vivo</a>
  </section>`;
}

const lateral = (d, extra = "") => `<aside class="lateral"><div class="lateral-fijo">${anuncio("lateral")}${extra}${tarjetaFacebook(d)}</div></aside>`;

function pie(d) {
  return `<section class="anunciate" id="anunciate" aria-labelledby="anunciate-titulo">
      <div class="envoltura anunciate-grid">
        <div>
          <h2 id="anunciate-titulo">Pon tu negocio frente a toda la provincia</h2>
          <p>Publicamos tu anuncio en imagen, GIF o video, en los espacios más vistos de la web. Tú eliges dónde sale y por cuántos días.</p>
          <div class="anunciate-acciones">
            <a class="boton boton--oro" href="mailto:${config.correo}?subject=${encodeURIComponent("Quiero anunciar en Novedades Sucumbíos")}">Escribir por correo</a>
            ${d.whatsapp ? `<a class="boton boton--linea" href="https://wa.me/${e(d.whatsapp)}?text=${encodeURIComponent("Hola, quiero anunciar en Novedades Sucumbíos")}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ""}
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
  <script>window.ANUNCIOS = ${jsonSeguro(d.anuncios)};</script>
  <script src="/js/app.js?v=4" defer></script>
</body>
</html>`;
}

const intro = () => `<div class="intro" id="intro" aria-hidden="true">
    <div class="marca marca--intro"><img src="/assets/logo.webp" alt=""><span class="marca-brillo"></span></div>
  </div>`;

const comunidad = () => `<section class="envoltura comunidad" aria-labelledby="comunidad-titulo">
      <h2 id="comunidad-titulo">Recibe las noticias donde prefieras</h2>
      <div class="redes">
        <a class="red red--fb" href="${config.facebook}" target="_blank" rel="noopener"><strong>Facebook</strong><span>Noticias y transmisiones en vivo</span></a>
        <a class="red red--tg" href="${config.telegram}" target="_blank" rel="noopener"><strong>Telegram</strong><span>Alertas al instante en tu celular</span></a>
        <a class="red red--tt" href="${config.tiktok}" target="_blank" rel="noopener"><strong>TikTok</strong><span>Videos cortos de la provincia</span></a>
      </div>
    </section>`;

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

function paginacion(raiz, pagina, total) {
  const paginas = Math.ceil(total / POR_PAGINA);
  if (paginas <= 1) return "";
  const url = (p) => (p === 1 ? raiz : `${raiz}?pagina=${p}`);
  return `<nav class="paginacion" aria-label="Más noticias">
    ${pagina > 1 ? `<a href="${url(pagina - 1)}" rel="prev">Más recientes</a>` : "<span></span>"}
    <span>Página ${pagina} de ${paginas}</span>
    ${pagina < paginas ? `<a href="${url(pagina + 1)}" rel="next">Más antiguas</a>` : "<span></span>"}
  </nav>`;
}

const lista = (noticias, vacio) => (!noticias.length ? `<p class="vacio">${vacio}</p>`
  : `<div class="noticias">${noticias.map((n, i) => nota(n, i === 2 || i === 7)).join("")}</div>`);

const organizacion = (d) => ({
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  "@id": `${d.sitio}/#organizacion`,
  name: config.nombre,
  url: d.sitio + "/",
  logo: { "@type": "ImageObject", url: d.abs("/assets/logo-512.png"), width: 512, height: 512 },
  sameAs: [config.facebook, config.telegram, config.tiktok],
  email: config.correo,
  address: { "@type": "PostalAddress", addressLocality: "Nueva Loja", addressRegion: "Sucumbíos", addressCountry: "EC" },
});

const html = (c, contenido, estado = 200) => {
  c.header("Cache-Control", "no-cache");
  return c.html(contenido, estado);
};

/* ---------------- En vivo dentro de la portada ---------------- */
function bloqueVivo(v) {
  return `<section class="vivo-portada" aria-labelledby="vivo-titulo">
    <div class="envoltura vivo-portada-grid">
      <div class="vivo-reproductor">${reproductor(v.enlace, v.titulo, { auto: true })}</div>
      <div class="vivo-info">
        <span class="vivo-sello"><span class="punto" aria-hidden="true"></span>En vivo ahora</span>
        <h2 id="vivo-titulo">${e(v.titulo)}</h2>
        ${v.descripcion ? `<p>${e(v.descripcion)}</p>` : ""}
        <p class="vivo-desde">Empezó ${tiempo(v.inicio)}</p>
        <div class="vivo-acciones">
          <a class="boton boton--oro" href="/en-vivo">Ver en pantalla grande</a>
          <a class="boton boton--linea" href="${e(v.enlace)}" target="_blank" rel="noopener">${plataforma(v.enlace)}</a>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---------------- Inicio y cantones ---------------- */
function portadaHtml(d, n) {
  if (!n) return "";
  const tarjeta = d.vivo
    ? `<a class="vivo-tarjeta vivo-tarjeta--activa" href="/en-vivo"><span class="vivo-tag"><span class="punto" aria-hidden="true"></span>En vivo ahora</span>
        <strong>${e(d.vivo.titulo)}</strong><span>Mírala aquí mismo, sin salir de la página.</span><span class="vivo-ver">Ver transmisión</span></a>`
    : d.proxima
      ? `<a class="vivo-tarjeta" href="/en-vivo"><span class="vivo-tag">Próxima transmisión</span><strong>${e(d.proxima.titulo)}</strong>
        <span>${e(fechaLarga(d.proxima.programada_para))}</span><span class="vivo-ver">Ver detalles</span></a>`
      : `<a class="vivo-tarjeta" href="/en-vivo"><span class="vivo-tag"><span class="punto" aria-hidden="true"></span>En vivo</span>
        <strong>Transmisiones desde la calle</strong><span>Motocaravanas, eventos y lo que pasa en la provincia, en directo.</span><span class="vivo-ver">Ver transmisiones</span></a>`;
  return `<section class="portada" aria-labelledby="principal-titulo">
      <div class="portada-fondo" aria-hidden="true"><img src="/assets/portada.webp" alt="" fetchpriority="high"></div>
      <div class="portada-contenido">
        <article class="principal">
          <p class="etiqueta"><a href="/canton/${cantonSlug(n.canton)}">${e(n.canton)}</a> ${tiempo(n.publicada_en)}</p>
          <h1 id="principal-titulo"><a href="${urlNoticia(n)}">${e(n.titulo)}</a></h1>
          ${n.resumen ? `<p>${e(n.resumen)}</p>` : ""}
          <a class="boton boton--oro" href="${urlNoticia(n)}">Leer la nota completa</a>
        </article>
        <aside class="vivo">${tarjeta}
          <div class="seguidores"><strong>${e(d.seguidores)}</strong><span>personas siguen la página en Facebook</span></div>
        </aside>
      </div>
    </section>`;
}

paginas.get("/", async (c) => {
  const b = base(c.env);
  const pagina = Math.max(1, Number(c.req.query("pagina")) || 1);
  const [d, principal] = await Promise.all([
    comunes(c),
    b.uno(`SELECT * FROM noticias WHERE ${PUBLICADAS} ORDER BY destacada DESC, publicada_en DESC LIMIT 1`),
  ]);
  const [noticias, total] = await Promise.all([
    b.todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} AND id != ? ORDER BY publicada_en DESC LIMIT ? OFFSET ?`, principal?.id || 0, POR_PAGINA, (pagina - 1) * POR_PAGINA),
    b.uno(`SELECT COUNT(*) AS n FROM noticias WHERE ${PUBLICADAS}`),
  ]);
  registrarVisita(c, "/");
  return html(c, `${cabeza(d, {
    canonica: pagina > 1 ? `/?pagina=${pagina}` : "/",
    titulo: pagina > 1 ? `Noticias, página ${pagina}` : "",
    jsonld: [organizacion(d), { "@context": "https://schema.org", "@type": "WebSite", "@id": `${d.sitio}/#sitio`, url: d.sitio + "/",
      name: config.nombre, inLanguage: "es-EC", publisher: { "@id": `${d.sitio}/#organizacion` },
      potentialAction: { "@type": "SearchAction", target: `${d.sitio}/buscar?q={q}`, "query-input": "required name=q" } }],
  })}
<body class="inicio">
  ${pagina === 1 && !d.vivo ? intro() : ""}
  ${encabezado(d, "")}
  <main id="contenido">
    ${pagina === 1 && d.vivo ? bloqueVivo(d.vivo) : ""}
    ${pagina === 1 ? portadaHtml(d, principal) : `<h1 class="envoltura titulo-seccion">Noticias de Sucumbíos <small>Página ${pagina}</small></h1>`}
    <div class="envoltura">${anuncio("cabecera")}</div>
    <div class="envoltura columnas">
      <section class="lista" aria-labelledby="lo-ultimo">
        <div class="lista-cabeza"><h2 id="lo-ultimo">Lo último</h2><p class="lista-filtro">Toda la provincia</p></div>
        ${lista(noticias, "Todavía no hay más noticias publicadas.")}
        ${paginacion("/", pagina, Math.max(0, total.n - 1))}
      </section>
      ${lateral(d)}
    </div>
    <section class="franja" aria-label="Publicidad">${anuncio("franja")}</section>
    ${comunidad()}
  ${pie(d)}`);
});

paginas.get("/index.html", (c) => c.redirect("/", 301));

paginas.get("/canton/:canton", async (c) => {
  const canton = cantonDeSlug(c.req.param("canton"));
  if (!canton) return noEncontrada(c);
  const b = base(c.env);
  const pagina = Math.max(1, Number(c.req.query("pagina")) || 1);
  const [d, noticias, total] = await Promise.all([
    comunes(c),
    b.todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} AND canton = ? ORDER BY publicada_en DESC LIMIT ? OFFSET ?`, canton, POR_PAGINA, (pagina - 1) * POR_PAGINA),
    b.uno(`SELECT COUNT(*) AS n FROM noticias WHERE ${PUBLICADAS} AND canton = ?`, canton),
  ]);
  const raiz = `/canton/${c.req.param("canton")}`;
  registrarVisita(c, raiz);
  const titulo = canton === "Provincia" ? "Noticias de toda la provincia" : `Noticias de ${canton}`;
  return html(c, `${cabeza(d, {
    titulo: titulo + (pagina > 1 ? `, página ${pagina}` : ""),
    descripcion: `Últimas noticias de ${canton}, Sucumbíos: sucesos, vías, comunidad, deportes y transmisiones en vivo.`,
    canonica: pagina > 1 ? `${raiz}?pagina=${pagina}` : raiz,
    jsonld: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: d.sitio + "/" },
      { "@type": "ListItem", position: 2, name: canton, item: d.sitio + raiz },
    ] }],
  })}
<body class="canton">
  ${encabezado(d, canton)}
  <main id="contenido">
    <div class="envoltura cabeza-seccion">
      <nav class="migas" aria-label="Estás en"><a href="/">Inicio</a><span aria-hidden="true">/</span><span>${e(canton)}</span></nav>
      <h1 class="titulo-seccion">${e(titulo)}</h1>
    </div>
    <div class="envoltura">${anuncio("cabecera")}</div>
    <div class="envoltura columnas">
      <section class="lista" aria-label="Noticias">
        ${lista(noticias, `Todavía no hay noticias de ${e(canton)}. <a href="/">Ver toda la provincia</a>`)}
        ${paginacion(raiz, pagina, total.n)}
      </section>
      ${lateral(d)}
    </div>
    ${comunidad()}
  ${pie(d)}`);
});

/* ---------------- En vivo ---------------- */
paginas.get("/en-vivo", async (c) => {
  const b = base(c.env);
  const [d, anteriores, programadas] = await Promise.all([
    comunes(c),
    b.todos("SELECT * FROM transmisiones WHERE estado = 'terminada' ORDER BY inicio DESC LIMIT 12"),
    b.todos("SELECT * FROM transmisiones WHERE estado = 'programada' AND programada_para > ? ORDER BY programada_para LIMIT 5", new Date().toISOString()),
  ]);
  registrarVisita(c, "/en-vivo");
  const v = d.vivo;
  const evento = (t, enVivo) => ({
    "@context": "https://schema.org", "@type": "VideoObject", name: t.titulo, description: t.descripcion || t.titulo,
    thumbnailUrl: d.abs("/assets/portada.jpg"), uploadDate: t.inicio || t.creado_en, embedUrl: t.enlace,
    publication: { "@type": "BroadcastEvent", isLiveBroadcast: true, startDate: t.inicio || t.programada_para, ...(enVivo ? {} : { endDate: t.fin || undefined }) },
  });
  return html(c, `${cabeza(d, {
    titulo: v ? `En vivo: ${v.titulo}` : "Transmisiones en vivo",
    descripcion: v ? textoPlano(v.descripcion || `Transmisión en vivo de ${config.nombre}: ${v.titulo}`, 158)
      : "Mira en vivo lo que pasa en Nueva Loja y toda la provincia de Sucumbíos: motocaravanas, eventos, sucesos y más.",
    canonica: "/en-vivo",
    jsonld: v ? [evento(v, true)] : [],
  })}
<body class="pagina-vivo">
  ${encabezado(d, "vivo")}
  <main id="contenido">
    <div class="envoltura cabeza-seccion">
      <nav class="migas" aria-label="Estás en"><a href="/">Inicio</a><span aria-hidden="true">/</span><span>En vivo</span></nav>
      ${v ? `<span class="vivo-sello vivo-sello--grande"><span class="punto" aria-hidden="true"></span>En vivo ahora</span>
      <h1 class="titulo-seccion">${e(v.titulo)}</h1>` : `<h1 class="titulo-seccion">Transmisiones en vivo</h1>`}
    </div>
    ${v ? `<div class="envoltura columnas">
      <div>
        <div class="medio medio--video vivo-grande">${reproductor(v.enlace, v.titulo, { auto: true })}</div>
        ${v.descripcion ? `<p class="vivo-descripcion">${e(v.descripcion)}</p>` : ""}
        <p class="vivo-desde">Empezó ${tiempo(v.inicio)}. Si no carga, <a href="${e(v.enlace)}" target="_blank" rel="noopener">mírala en ${idYoutube(v.enlace) ? "YouTube" : "Facebook"}</a>.</p>
        <div class="compartir">
          <a class="compartir-wa" href="https://wa.me/?text=${encodeURIComponent(`🔴 En vivo: ${v.titulo} ${d.sitio}/en-vivo`)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>
          <a class="compartir-fb" href="${e(v.enlace)}" target="_blank" rel="noopener">${plataforma(v.enlace)}</a>
          <button type="button" class="compartir-copiar" data-url="${e(d.sitio)}/en-vivo">Copiar enlace</button>
        </div>
      </div>
      ${lateral(d)}
    </div>` : `<div class="envoltura vivo-vacio">
      <p>${d.proxima ? `La próxima transmisión es <strong>${e(d.proxima.titulo)}</strong>, el ${e(fechaLarga(d.proxima.programada_para))}.` : "Ahora mismo no estamos transmitiendo."} Cuando salgamos en vivo, la transmisión aparece aquí y en la portada.</p>
      <div class="vivo-acciones">
        <a class="boton boton--fb" href="${config.facebook}" target="_blank" rel="noopener">Seguir en Facebook para recibir el aviso</a>
        <a class="boton boton--linea" href="${config.telegram}" target="_blank" rel="noopener">Avisos por Telegram</a>
      </div>
    </div>`}
    ${programadas.length && v ? `<section class="envoltura vivo-lista"><h2>Próximas transmisiones</h2><ul>${programadas.map((t) => `<li><strong>${e(t.titulo)}</strong> <span>${e(fechaLarga(t.programada_para))}</span></li>`).join("")}</ul></section>` : ""}
    ${anteriores.length ? `<section class="envoltura vivo-anteriores" aria-labelledby="anteriores"><h2 id="anteriores">Transmisiones anteriores</h2>
      <div class="vivo-anteriores-grid">${anteriores.map((t) => `<article>
        <div class="medio medio--video">${reproductor(t.enlace, t.titulo).replace("<iframe ", '<iframe loading="lazy" ')}</div>
        <h3>${e(t.titulo)}</h3><p class="nota-meta">${tiempo(t.inicio || t.creado_en)}</p></article>`).join("")}</div></section>` : ""}
    <div class="envoltura">${anuncio("cabecera")}</div>
    ${comunidad()}
  ${pie(d)}`);
});

/* ---------------- Detalle de noticia ---------------- */
function videoHtml(n) {
  if (!n.video) return "";
  if (idYoutube(n.video) || /facebook\.com|fb\.watch/.test(n.video)) {
    return `<div class="medio medio--video">${reproductor(n.video, n.titulo).replace("<iframe ", '<iframe loading="lazy" ')}</div>`;
  }
  return `<div class="medio medio--video"><video controls playsinline preload="metadata"${n.imagen ? ` poster="${e(n.imagen)}"` : ""} src="${e(n.video)}"></video></div>`;
}

function insertarAnuncio(cuerpo) {
  let cuenta = 0;
  const conAnuncio = cuerpo.replace(/<\/p>/g, (m) => (++cuenta === 2 ? m + anuncio("entreNoticias", "entre") : m));
  return cuenta >= 2 ? conAnuncio : cuerpo + anuncio("entreNoticias", "entre");
}

function compartir(d, n) {
  const enlace = d.abs(urlNoticia(n));
  const url = encodeURIComponent(enlace);
  const texto = encodeURIComponent(n.titulo);
  return `<div class="compartir" aria-label="Compartir esta noticia">
    <a class="compartir-wa" href="https://wa.me/?text=${texto}%20${url}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="compartir-fb" href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">Facebook</a>
    <a class="compartir-tg" href="https://t.me/share/url?url=${url}&text=${texto}" target="_blank" rel="noopener">Telegram</a>
    <button type="button" class="compartir-copiar" data-url="${e(enlace)}">Copiar enlace</button>
  </div>`;
}

paginas.get("/noticia/:slug", async (c) => {
  const b = base(c.env);
  const n = await b.uno("SELECT n.*, u.nombre AS autor FROM noticias n LEFT JOIN usuarios u ON u.id = n.autor_id WHERE n.slug = ?", c.req.param("slug"));
  const visible = n && n.estado === "publicada" && new Date(n.publicada_en) <= new Date();
  if (!n || (!visible && !c.get("usuario"))) return noEncontrada(c);
  if (visible) registrarVisita(c, urlNoticia(n), n.id);

  const desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const [d, relacionadas, masLeidas] = await Promise.all([
    comunes(c),
    b.todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} AND id != ? ORDER BY (canton = ?) DESC, publicada_en DESC LIMIT 6`, n.id, n.canton),
    b.todos(`SELECT n.slug, n.titulo FROM noticias n JOIN (SELECT noticia_id, COUNT(*) AS c FROM visitas WHERE dia >= ? AND noticia_id IS NOT NULL
      GROUP BY noticia_id) v ON v.noticia_id = n.id WHERE n.estado = 'publicada' AND n.id != ? ORDER BY v.c DESC LIMIT 5`, desde, n.id),
  ]);

  const galeria = JSON.parse(n.galeria || "[]");
  const cuerpo = insertarAnuncio(textoAHtml(n.contenido || n.resumen));
  const descripcion = textoPlano(n.resumen || n.contenido, 158);
  const medio = n.video ? videoHtml(n) : n.imagen
    ? `<figure class="medio"><img src="${e(n.imagen)}" alt="${e(n.imagen_texto || n.titulo)}" fetchpriority="high">${n.imagen_texto ? `<figcaption>${e(n.imagen_texto)}</figcaption>` : ""}</figure>`
    : "";
  const actualizada = new Date(n.actualizada_en) - new Date(n.publicada_en) > 60e3;

  return html(c, `${cabeza(d, {
    titulo: n.titulo, descripcion, canonica: urlNoticia(n), imagen: n.imagen, tipo: "article", noindex: !visible,
    extra: `<meta property="article:published_time" content="${e(n.publicada_en)}">
  <meta property="article:modified_time" content="${e(n.actualizada_en)}">
  <meta property="article:section" content="${e(n.canton)}">`,
    jsonld: [
      { "@context": "https://schema.org", "@type": "NewsArticle",
        mainEntityOfPage: { "@type": "WebPage", "@id": d.abs(urlNoticia(n)) },
        headline: n.titulo.slice(0, 110), description: descripcion,
        image: [d.abs(n.imagen || "/assets/portada.jpg")],
        datePublished: n.publicada_en, dateModified: n.actualizada_en, articleSection: n.canton, inLanguage: "es-EC",
        contentLocation: { "@type": "Place", name: `${n.canton}, Sucumbíos, Ecuador` },
        author: n.autor ? { "@type": "Person", name: n.autor } : { "@type": "Organization", name: config.nombre, url: d.sitio + "/" },
        publisher: { "@type": "NewsMediaOrganization", name: config.nombre, logo: { "@type": "ImageObject", url: d.abs("/assets/logo-512.png") } },
        ...(n.video && n.video.startsWith("/subidas/") ? { video: { "@type": "VideoObject", name: n.titulo, description: descripcion,
          contentUrl: d.abs(n.video), thumbnailUrl: d.abs(n.imagen || "/assets/portada.jpg"), uploadDate: n.publicada_en } } : {}) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: d.sitio + "/" },
        { "@type": "ListItem", position: 2, name: n.canton, item: `${d.sitio}/canton/${cantonSlug(n.canton)}` },
        { "@type": "ListItem", position: 3, name: n.titulo },
      ] },
    ],
  })}
<body class="detalle">
  ${encabezado(d, n.canton)}
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
          ${actualizada ? `<span>Actualizada: <time datetime="${e(n.actualizada_en)}">${e(fechaLarga(n.actualizada_en))}</time></span>` : ""}
        </div>
        ${compartir(d, n)}
      </header>
      <div class="envoltura articulo-medio">${medio}</div>
      <div class="envoltura columnas">
        <div class="articulo-cuerpo">
          ${cuerpo}
          ${n.video && n.imagen ? `<figure class="medio medio--secundario"><img src="${e(n.imagen)}" alt="${e(n.imagen_texto || n.titulo)}" loading="lazy">${n.imagen_texto ? `<figcaption>${e(n.imagen_texto)}</figcaption>` : ""}</figure>` : ""}
          ${galeria.length ? `<section class="galeria" aria-label="Galería de fotos"><h2>Fotos</h2><div class="galeria-grid">${galeria.map((g, i) => `<a href="${e(g)}" data-galeria="${i}"><img src="${e(g)}" alt="Foto ${i + 1} de ${galeria.length}" loading="lazy"></a>`).join("")}</div></section>` : ""}
          ${n.enlace_facebook ? `<p class="articulo-fb"><a class="boton boton--fb" href="${e(n.enlace_facebook)}" target="_blank" rel="noopener">Comentar en Facebook</a></p>` : ""}
          ${compartir(d, n)}
        </div>
        ${lateral(d, masLeidas.length ? `<section class="mas-leidas" aria-labelledby="mas-leidas"><h2 id="mas-leidas">Lo más leído</h2><ol>${masLeidas.map((m) => `<li><a href="${urlNoticia(m)}">${e(m.titulo)}</a></li>`).join("")}</ol></section>` : "")}
      </div>
    </article>
    <div class="envoltura">${anuncio("cabecera")}</div>
    ${relacionadas.length ? `<section class="envoltura relacionadas" aria-labelledby="relacionadas"><h2 id="relacionadas">Más noticias</h2>
      <div class="relacionadas-grid">${relacionadas.map((r) => `<article><a href="${urlNoticia(r)}">
        <div class="rel-foto">${r.imagen ? `<img src="${e(r.imagen)}" alt="" loading="lazy">` : `<span>${e(r.canton)}</span>`}</div>
        <p class="nota-meta"><span class="nota-canton">${e(r.canton)}</span>${tiempo(r.publicada_en)}</p>
        <h3>${e(r.titulo)}</h3></a></article>`).join("")}</div></section>` : ""}
    ${comunidad()}
  ${pie(d)}`);
});

/* ---------------- Búsqueda ---------------- */
paginas.get("/buscar", async (c) => {
  const termino = String(c.req.query("q") || "").trim().slice(0, 80);
  const patron = `%${termino}%`;
  const [d, resultados] = await Promise.all([
    comunes(c),
    termino ? base(c.env).todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} AND (titulo LIKE ? OR resumen LIKE ? OR contenido LIKE ?)
      ORDER BY publicada_en DESC LIMIT 30`, patron, patron, patron) : [],
  ]);
  return html(c, `${cabeza(d, { titulo: termino ? `Resultados para "${termino}"` : "Buscar noticias", canonica: "/buscar", noindex: true })}
<body class="busqueda">
  ${encabezado(d, "-")}
  <main id="contenido">
    <div class="envoltura cabeza-seccion">
      <h1 class="titulo-seccion">${termino ? `Resultados para “${e(termino)}”` : "Buscar noticias"}</h1>
      <form class="buscador buscador--grande" action="/buscar" role="search"><label class="oculto" for="q2">Buscar noticias</label>
        <input id="q2" name="q" type="search" value="${e(termino)}" placeholder="Escribe un tema, un lugar o un nombre"><button class="boton boton--oro">Buscar</button></form>
    </div>
    <div class="envoltura columnas">
      <section class="lista" aria-label="Resultados">${termino ? lista(resultados, `No encontramos noticias con “${e(termino)}”. Prueba con otra palabra.`) : ""}</section>
      ${lateral(d)}
    </div>
  ${pie(d)}`);
});

/* ---------------- Fotos y videos guardados en R2 ---------------- */
paginas.get("/subidas/*", async (c) => {
  const clave = decodeURIComponent(new URL(c.req.url).pathname.slice(1));
  const rango = c.req.header("range");
  const cache = caches.default;
  if (!rango) {
    const guardado = await cache.match(c.req.raw);
    if (guardado) return guardado;
  }
  const obj = await c.env.MEDIA.get(clave, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!obj) return c.text("Archivo no encontrado", 404);
  const cabeceras = new Headers();
  obj.writeHttpMetadata(cabeceras);
  cabeceras.set("etag", obj.httpEtag);
  cabeceras.set("accept-ranges", "bytes");
  cabeceras.set("cache-control", "public, max-age=31536000, immutable");
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers: cabeceras });
  if (rango && obj.range) {
    const inicio = obj.range.offset ?? 0;
    const largo = obj.range.length ?? obj.size - inicio;
    cabeceras.set("content-range", `bytes ${inicio}-${inicio + largo - 1}/${obj.size}`);
    cabeceras.set("content-length", String(largo));
    return new Response(obj.body, { status: 206, headers: cabeceras });
  }
  cabeceras.set("content-length", String(obj.size));
  const respuesta = new Response(obj.body, { headers: cabeceras });
  if (obj.size < 25 * 1024 * 1024) c.executionCtx.waitUntil(cache.put(c.req.raw, respuesta.clone()));
  return respuesta;
});

/* ---------------- SEO: robots, sitemaps, RSS, manifest ---------------- */
paginas.get("/robots.txt", (c) => {
  const s = sitio(c);
  return c.text(`User-agent: *\nAllow: /\nDisallow: /panel/\nDisallow: /api/\nDisallow: /buscar\n\nSitemap: ${s}/sitemap.xml\nSitemap: ${s}/sitemap-noticias.xml\n`);
});

const xml = (c, cuerpo, tipo = "application/xml") => c.body(cuerpo, 200, { "content-type": `${tipo}; charset=utf-8`, "cache-control": "public, max-age=600" });

paginas.get("/sitemap.xml", async (c) => {
  const s = sitio(c);
  const noticias = await base(c.env).todos(`SELECT slug, actualizada_en, imagen FROM noticias WHERE ${PUBLICADAS} ORDER BY publicada_en DESC LIMIT 45000`);
  const abs = (u) => (/^https?:/.test(u) ? u : s + u);
  return xml(c, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${s}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
<url><loc>${s}/en-vivo</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>
${config.cantones.map((ct) => `<url><loc>${s}/canton/${cantonSlug(ct)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`).join("\n")}
${noticias.map((n) => `<url><loc>${s}/noticia/${n.slug}</loc><lastmod>${n.actualizada_en}</lastmod>${n.imagen ? `<image:image><image:loc>${e(abs(n.imagen))}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`);
});

paginas.get("/sitemap-noticias.xml", async (c) => {
  const s = sitio(c);
  const desde = new Date(Date.now() - 2 * 864e5).toISOString();
  const noticias = await base(c.env).todos(`SELECT slug, titulo, publicada_en FROM noticias WHERE ${PUBLICADAS} AND publicada_en >= ? ORDER BY publicada_en DESC LIMIT 1000`, desde);
  return xml(c, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${noticias.map((n) => `<url><loc>${s}/noticia/${n.slug}</loc><news:news><news:publication><news:name>${e(config.nombre)}</news:name><news:language>es</news:language></news:publication><news:publication_date>${n.publicada_en}</news:publication_date><news:title>${e(n.titulo)}</news:title></news:news></url>`).join("\n")}
</urlset>`);
});

paginas.get("/rss.xml", async (c) => {
  const s = sitio(c);
  const noticias = await base(c.env).todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} ORDER BY publicada_en DESC LIMIT 30`);
  const abs = (u) => (/^https?:/.test(u) ? u : s + u);
  return xml(c, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>${e(config.nombre)}</title>
  <link>${s}/</link>
  <description>${e(config.descripcion)}</description>
  <language>es-EC</language>
  <atom:link href="${s}/rss.xml" rel="self" type="application/rss+xml"/>
${noticias.map((n) => `  <item>
    <title>${e(n.titulo)}</title>
    <link>${s}/noticia/${n.slug}</link>
    <guid isPermaLink="true">${s}/noticia/${n.slug}</guid>
    <pubDate>${new Date(n.publicada_en).toUTCString()}</pubDate>
    <category>${e(n.canton)}</category>
    <description>${e(textoPlano(n.resumen || n.contenido, 300))}</description>${n.imagen ? `\n    <media:content url="${e(abs(n.imagen))}" medium="image"/>` : ""}
  </item>`).join("\n")}
</channel>
</rss>`, "application/rss+xml");
});
paginas.get("/feed", (c) => c.redirect("/rss.xml", 301));

paginas.get("/manifest.webmanifest", (c) => c.body(JSON.stringify({
  name: config.nombre, short_name: "Novedades", lang: "es-EC", start_url: "/", display: "standalone",
  background_color: "#0E1A12", theme_color: "#0E1A12",
  icons: [{ src: "/assets/favicon.png", sizes: "192x192", type: "image/png" }, { src: "/assets/logo-512.png", sizes: "512x512", type: "image/png" }],
}), 200, { "content-type": "application/manifest+json" }));

/* ---------------- 404 ---------------- */
export async function noEncontrada(c) {
  const [d, recientes] = await Promise.all([
    comunes(c),
    base(c.env).todos(`SELECT * FROM noticias WHERE ${PUBLICADAS} ORDER BY publicada_en DESC LIMIT 5`),
  ]);
  return html(c, `${cabeza(d, { titulo: "Página no encontrada", canonica: new URL(c.req.url).pathname, noindex: true })}
<body class="error">
  ${encabezado(d, "-")}
  <main id="contenido">
    <section class="envoltura no-encontrada">
      <h1>Esta página no existe o la noticia fue retirada</h1>
      <p>Revisa el enlace o vuelve a la portada para ver lo último de la provincia.</p>
      <a class="boton boton--oro" href="/">Ir a la portada</a>
    </section>
    <div class="envoltura columnas"><section class="lista" aria-label="Lo último">${lista(recientes, "")}</section></div>
  ${pie(d)}`, 404);
}
