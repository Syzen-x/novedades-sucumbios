/* Novedades Sucumbíos — comportamiento de la página */
(function () {
  "use strict";

  var NOTICIAS = window.NOTICIAS || [];
  var CONFIG = window.ANUNCIOS || { espacios: {} };
  var reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function guardar(clave, valor) { try { sessionStorage.setItem(clave, valor); } catch (e) {} }
  function leer(clave) { try { return sessionStorage.getItem(clave); } catch (e) { return null; } }
  function crear(tag, clase, html) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function escapar(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Logo animado de entrada ---------- */
  var intro = document.getElementById("intro");
  if (!reducirMovimiento && !leer("intro-vista")) {
    intro.classList.add("activa");
    guardar("intro-vista", "1");
    var cerrarIntro = function () { intro.classList.add("oculta"); };
    setTimeout(cerrarIntro, 3300);
    window.addEventListener("click", cerrarIntro, { once: true });
    window.addEventListener("keydown", cerrarIntro, { once: true });
  } else {
    intro.classList.add("oculta");
  }

  /* ---------- Fechas ---------- */
  function haceCuanto(fecha) {
    var d = new Date(fecha);
    if (isNaN(d)) return "";
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "ahora";
    if (min < 60) return "hace " + min + " min";
    var h = Math.round(min / 60);
    if (h < 24) return "hace " + h + " h";
    var dias = Math.round(h / 24);
    if (dias < 7) return dias === 1 ? "ayer" : "hace " + dias + " días";
    return d.toLocaleDateString("es-EC", { day: "numeric", month: "long" });
  }

  /* ---------- Portada ---------- */
  var principal = NOTICIAS[0];
  if (principal) {
    document.getElementById("principal").innerHTML =
      '<p class="etiqueta">' + escapar(principal.canton || "Sucumbíos") +
      ' <time datetime="' + escapar(principal.fecha) + '">' + haceCuanto(principal.fecha) + "</time></p>" +
      '<h1 id="principal-titulo">' + escapar(principal.titulo) + "</h1>" +
      (principal.resumen ? "<p>" + escapar(principal.resumen) + "</p>" : "") +
      (principal.enlace ? '<a class="boton boton--oro" href="' + escapar(principal.enlace) + '" target="_blank" rel="noopener">Leer la nota completa</a>' : "");
  }

  /* ---------- Última hora ---------- */
  var urgentes = NOTICIAS.filter(function (n) { return n.urgente; });
  if (!urgentes.length) urgentes = NOTICIAS.slice(0, 5);
  var cinta = document.getElementById("cinta");
  var htmlCinta = urgentes.map(function (n) {
    return '<a href="' + escapar(n.enlace || "#noticias") + '"' + (n.enlace ? ' target="_blank" rel="noopener"' : "") +
      "><span>" + escapar(n.canton || "") + "</span>" + escapar(n.titulo) + "</a>";
  }).join("");
  cinta.innerHTML = htmlCinta + htmlCinta.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
  cinta.style.setProperty("--duracion", Math.max(25, urgentes.length * 9) + "s");

  /* ---------- Lista de noticias con filtro por cantón ---------- */
  var contenedor = document.getElementById("noticias");
  var filtroTexto = document.getElementById("filtro-actual");
  var nav = document.getElementById("cantones");
  var cantones = ["Todo"];
  NOTICIAS.forEach(function (n) { if (n.canton && cantones.indexOf(n.canton) < 0) cantones.push(n.canton); });

  cantones.forEach(function (c, i) {
    var b = crear("button", "", escapar(c));
    b.type = "button";
    b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function () {
      nav.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      pintarNoticias(c);
      if (c !== "Todo") document.getElementById("lo-ultimo").scrollIntoView({ behavior: reducirMovimiento ? "auto" : "smooth", block: "start" });
    });
    nav.appendChild(b);
  });

  function tarjeta(n) {
    var art = crear("article", "nota" + (n.urgente ? " nota--urgente" : ""));
    var titulo = n.enlace
      ? '<a href="' + escapar(n.enlace) + '" target="_blank" rel="noopener">' + escapar(n.titulo) + "</a>"
      : escapar(n.titulo);
    art.innerHTML =
      '<div class="nota-meta"><span class="nota-canton">' + escapar(n.canton || "Sucumbíos") + "</span>" +
      '<time datetime="' + escapar(n.fecha) + '">' + haceCuanto(n.fecha) + "</time>" +
      (n.video ? '<span class="nota-video">Video</span>' : "") + "</div>" +
      "<h3>" + titulo + "</h3>" +
      (n.resumen ? "<p>" + escapar(n.resumen) + "</p>" : "") +
      (n.imagen ? '<div class="nota-foto"><img src="' + escapar(n.imagen) + '" alt="" loading="lazy"></div>' : "");
    return art;
  }

  function pintarNoticias(canton) {
    contenedor.innerHTML = "";
    var lista = canton === "Todo"
      ? NOTICIAS.slice(1)
      : NOTICIAS.filter(function (n) { return n.canton === canton; });
    filtroTexto.textContent = canton === "Todo" ? "Toda la provincia" : canton;

    if (!lista.length) {
      var v = crear("p", "vacio", "Todavía no hay noticias de " + escapar(canton) + ". ");
      var volver = crear("button", "", "Ver toda la provincia");
      volver.type = "button";
      volver.addEventListener("click", function () { nav.querySelector("button").click(); });
      v.appendChild(volver);
      contenedor.appendChild(v);
      return;
    }
    lista.forEach(function (n, i) {
      contenedor.appendChild(tarjeta(n));
      // anuncio entre noticias después de la 3.ª y la 7.ª
      if (i === 2 || i === 6) {
        var ad = crear("aside", "anuncio anuncio--entre");
        ad.setAttribute("aria-label", "Publicidad");
        ad.dataset.espacio = "entreNoticias";
        contenedor.appendChild(ad);
        montarEspacio(ad);
      }
    });
  }

  /* ---------- Motor de anuncios ---------- */
  var hoy = new Date().toISOString().slice(0, 10);
  function vigente(a) {
    if (a.desde && hoy < a.desde) return false;
    if (a.hasta && hoy > a.hasta) return false;
    return true;
  }

  function avisoAnunciate() {
    return {
      tipo: "html",
      html: "<div class='ad-casa'><strong>Este espacio puede ser tuyo</strong>" +
        "<span>Anuncia tu negocio en Novedades Sucumbíos.</span><a href='#anunciate'>Quiero anunciar</a></div>"
    };
  }

  function piezaAnuncio(a) {
    var envoltorio = crear("div", "anuncio-item");
    var interior = "";
    var enlace = a.enlace ? escapar(a.enlace) : "";
    var externo = enlace && enlace.charAt(0) !== "#" ? ' target="_blank" rel="noopener sponsored"' : "";

    if (a.tipo === "imagen") {
      var img = '<picture>' + (a.srcMovil ? '<source media="(max-width: 640px)" srcset="' + escapar(a.srcMovil) + '">' : "") +
        '<img src="' + escapar(a.src) + '" alt="' + escapar(a.texto || "Anuncio") + '" loading="lazy"></picture>';
      interior = enlace ? '<a href="' + enlace + '"' + externo + ">" + img + "</a>" : img;
    } else if (a.tipo === "video") {
      var vid = '<video muted playsinline preload="metadata"' + (a.poster ? ' poster="' + escapar(a.poster) + '"' : "") +
        ' src="' + escapar(a.src) + '"></video>';
      interior = enlace ? '<a href="' + enlace + '"' + externo + ' aria-label="' + escapar(a.texto || "Ver anuncio") + '">' + vid + "</a>" : vid;
    } else if (a.tipo === "youtube") {
      envoltorio.dataset.youtube = a.id;
    } else if (a.tipo === "iframe") {
      interior = '<iframe src="' + escapar(a.src) + '" loading="lazy" title="Anuncio"></iframe>';
    } else {
      interior = '<div class="anuncio-html">' + (a.html || "") + "</div>";
    }
    envoltorio.innerHTML = interior;
    envoltorio._config = a;
    return envoltorio;
  }

  function montarEspacio(el) {
    var lista = (CONFIG.espacios[el.dataset.espacio] || []).filter(vigente);
    if (!lista.length) lista = [avisoAnunciate()];
    var piezas = lista.map(piezaAnuncio);
    piezas.forEach(function (p) { el.appendChild(p); });

    var actual = 0, temporizador = null, visible = false;
    var puntos = null, sonido = null;

    if (piezas.length > 1) {
      puntos = crear("div", "anuncio-puntos");
      piezas.forEach(function (_, i) {
        var b = crear("button");
        b.type = "button";
        b.setAttribute("aria-label", "Anuncio " + (i + 1) + " de " + piezas.length);
        b.addEventListener("click", function () { mostrar(i); });
        puntos.appendChild(b);
      });
      el.appendChild(puntos);
    }

    if (piezas.some(function (p) { return p._config.tipo === "video"; })) {
      sonido = crear("button", "anuncio-sonido", "Activar sonido");
      sonido.type = "button";
      sonido.hidden = true;
      sonido.addEventListener("click", function (e) {
        e.preventDefault();
        var v = piezas[actual].querySelector("video");
        if (!v) return;
        v.muted = !v.muted;
        sonido.textContent = v.muted ? "Activar sonido" : "Silenciar";
      });
      el.appendChild(sonido);
    }

    function cargarYoutube(p) {
      if (!p.dataset.youtube || p.querySelector("iframe")) return;
      var id = encodeURIComponent(p.dataset.youtube);
      p.innerHTML = '<iframe title="Anuncio en video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen ' +
        'src="https://www.youtube-nocookie.com/embed/' + id + "?autoplay=1&mute=1&loop=1&playlist=" + id + '&controls=1&rel=0&playsinline=1"></iframe>';
    }

    function mostrar(i) {
      clearTimeout(temporizador);
      piezas.forEach(function (p, j) {
        var activo = j === i;
        p.classList.toggle("activo", activo);
        p.setAttribute("aria-hidden", activo ? "false" : "true");
        var v = p.querySelector("video");
        if (v && !activo) { v.pause(); v.muted = true; }
      });
      actual = i;
      if (puntos) puntos.querySelectorAll("button").forEach(function (b, j) { b.setAttribute("aria-current", j === i ? "true" : "false"); });

      var pieza = piezas[i];
      var video = pieza.querySelector("video");
      if (sonido) { sonido.hidden = !video; sonido.textContent = "Activar sonido"; }
      if (visible) cargarYoutube(pieza);

      if (video) {
        video.loop = piezas.length === 1;
        if (visible) video.play().catch(function () {});
        if (piezas.length > 1) {
          video.onended = function () { siguiente(); };
          // por si el video es muy largo o no carga
          temporizador = setTimeout(siguiente, (pieza._config.duracion || 60) * 1000);
        }
      } else if (piezas.length > 1) {
        temporizador = setTimeout(siguiente, (pieza._config.duracion || CONFIG.rotacion || 9) * 1000);
      }
    }
    function siguiente() { mostrar((actual + 1) % piezas.length); }

    // Los videos solo se reproducen cuando el anuncio se ve en pantalla
    new IntersectionObserver(function (entradas) {
      visible = entradas[0].isIntersecting;
      var p = piezas[actual];
      var v = p.querySelector("video");
      if (visible) { cargarYoutube(p); if (v) v.play().catch(function () {}); }
      else if (v) v.pause();
    }, { threshold: 0.35 }).observe(el);

    mostrar(0);
  }

  document.querySelectorAll(".anuncio[data-espacio]").forEach(function (el) {
    if (el.dataset.espacio !== "flotante") montarEspacio(el);
  });
  pintarNoticias("Todo");

  /* ---------- Anuncio flotante ---------- */
  var flotante = document.getElementById("flotante");
  var listaFlotante = (CONFIG.espacios.flotante || []).filter(vigente);
  if (listaFlotante.length && !leer("flotante-cerrado")) {
    var montado = false;
    var revisar = function () {
      if (window.scrollY < 900) return;
      window.removeEventListener("scroll", revisar);
      flotante.hidden = false;
      if (!montado) { montarEspacio(flotante.querySelector(".anuncio")); montado = true; }
      requestAnimationFrame(function () { requestAnimationFrame(function () { flotante.classList.add("visible"); }); });
    };
    window.addEventListener("scroll", revisar, { passive: true });
    flotante.querySelector(".flotante-cerrar").addEventListener("click", function () {
      flotante.classList.remove("visible");
      flotante.querySelectorAll("video").forEach(function (v) { v.pause(); });
      guardar("flotante-cerrado", "1");
      setTimeout(function () { flotante.hidden = true; }, 600);
    });
  }

  /* ---------- Contacto para anunciantes ---------- */
  var wa = CONFIG.contacto && CONFIG.contacto.whatsapp;
  if (wa) {
    var b = crear("a", "boton boton--linea", "Escribir por WhatsApp");
    b.href = "https://wa.me/" + encodeURIComponent(wa) + "?text=" + encodeURIComponent("Hola, quiero anunciar en Novedades Sucumbíos");
    b.target = "_blank"; b.rel = "noopener";
    document.getElementById("contacto-anuncios").appendChild(b);
  }
})();
