/* Novedades Sucumbíos — comportamiento de la página pública */
(function () {
  "use strict";

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

  /* ---------- Logo animado de entrada (una vez por visita) ---------- */
  var intro = document.getElementById("intro");
  if (intro && !document.documentElement.classList.contains("sin-intro")) {
    intro.classList.add("activa");
    guardar("intro-vista", "1");
    var cerrarIntro = function () { intro.classList.add("oculta"); };
    setTimeout(cerrarIntro, 3300);
    window.addEventListener("click", cerrarIntro, { once: true });
    window.addEventListener("keydown", cerrarIntro, { once: true });
  }

  /* ---------- Fechas relativas ("hace 3 h") ---------- */
  function haceCuanto(d) {
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "ahora";
    if (min < 60) return "hace " + min + " min";
    var h = Math.round(min / 60);
    if (h < 24) return "hace " + h + " h";
    var dias = Math.round(h / 24);
    if (dias < 7) return dias === 1 ? "ayer" : "hace " + dias + " días";
    return null;
  }
  document.querySelectorAll("time[data-relativo]").forEach(function (t) {
    var d = new Date(t.getAttribute("datetime"));
    var r = !isNaN(d) && haceCuanto(d);
    if (r) { t.title = t.textContent; t.textContent = r; }
  });

  /* ---------- Motor de anuncios ---------- */
  var vistos = {};
  function evento(id, tipo) {
    if (!id) return;
    if (tipo === "vista") { if (vistos[id]) return; vistos[id] = true; }
    var datos = JSON.stringify({ anuncio: id, tipo: tipo });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/evento", new Blob([datos], { type: "application/json" }));
      else fetch("/api/evento", { method: "POST", body: datos, headers: { "Content-Type": "application/json" }, keepalive: true });
    } catch (e) {}
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
    var fondo = a.tipo === "imagen" ? a.src : a.tipo === "video" ? a.poster : "";
    // fondo difuminado con la misma imagen: así cualquier medida se ve bien
    if (fondo) envoltorio.style.setProperty("--fondo", "url('" + String(fondo).replace(/'/g, "%27") + "')");

    if (a.tipo === "imagen") {
      var img = "<picture>" + (a.srcMovil ? '<source media="(max-width: 640px)" srcset="' + escapar(a.srcMovil) + '">' : "") +
        '<img src="' + escapar(a.src) + '" alt="' + escapar(a.texto || "Anuncio") + '" loading="lazy"></picture>';
      interior = enlace ? '<a href="' + enlace + '"' + externo + ">" + img + "</a>" : img;
    } else if (a.tipo === "video") {
      var vid = '<video muted playsinline preload="metadata"' + (a.poster ? ' poster="' + escapar(a.poster) + '"' : "") +
        ' src="' + escapar(a.src) + '"></video>';
      interior = enlace ? '<a href="' + enlace + '"' + externo + ' aria-label="' + escapar(a.texto || "Ver anuncio") + '">' + vid + "</a>" : vid;
    } else if (a.tipo === "youtube") {
      envoltorio.dataset.youtube = a.src;
    } else if (a.tipo === "iframe") {
      interior = '<iframe src="' + escapar(a.src) + '" loading="lazy" title="Anuncio"></iframe>';
    } else {
      interior = '<div class="anuncio-html">' + (a.html || "") + "</div>";
    }
    envoltorio.innerHTML = interior;
    envoltorio._config = a;
    envoltorio.addEventListener("click", function (e) {
      if (e.target.closest("a")) evento(a.id, "clic");
    });
    return envoltorio;
  }

  function montarEspacio(el) {
    var lista = (CONFIG.espacios[el.dataset.espacio] || []).slice();
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
      if (visible) { cargarYoutube(pieza); evento(pieza._config.id, "vista"); }

      if (video) {
        video.loop = piezas.length === 1;
        if (visible) video.play().catch(function () {});
        if (piezas.length > 1) {
          video.onended = function () { siguiente(); };
          temporizador = setTimeout(siguiente, (pieza._config.duracion || 60) * 1000);
        }
      } else if (piezas.length > 1) {
        temporizador = setTimeout(siguiente, (pieza._config.duracion || CONFIG.rotacion || 9) * 1000);
      }
    }
    function siguiente() { mostrar((actual + 1) % piezas.length); }

    // los videos solo se reproducen y las vistas solo se cuentan cuando el anuncio está en pantalla
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entradas) {
        visible = entradas[0].isIntersecting;
        var p = piezas[actual];
        var v = p.querySelector("video");
        if (visible) { cargarYoutube(p); evento(p._config.id, "vista"); if (v) v.play().catch(function () {}); }
        else if (v) v.pause();
      }, { threshold: 0.5 }).observe(el);
    } else {
      visible = true;
    }

    mostrar(0);
  }

  document.querySelectorAll(".anuncio[data-espacio]").forEach(function (el) {
    if (el.dataset.espacio !== "flotante") montarEspacio(el);
  });

  /* ---------- Anuncio flotante ---------- */
  var flotante = document.getElementById("flotante");
  var listaFlotante = CONFIG.espacios.flotante || [];
  if (flotante && listaFlotante.length && !leer("flotante-cerrado")) {
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

  /* ---------- Copiar enlace de la noticia ---------- */
  document.querySelectorAll(".compartir-copiar").forEach(function (b) {
    b.addEventListener("click", function () {
      var url = b.getAttribute("data-url");
      var listo = function () { b.textContent = "Enlace copiado"; setTimeout(function () { b.textContent = "Copiar enlace"; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(listo, function () { window.prompt("Copia el enlace:", url); });
      else window.prompt("Copia el enlace:", url);
    });
  });

  /* ---------- Galería de fotos ---------- */
  var fotos = Array.prototype.slice.call(document.querySelectorAll("[data-galeria]"));
  if (fotos.length) {
    var visor = crear("div", "visor");
    visor.setAttribute("role", "dialog");
    visor.setAttribute("aria-modal", "true");
    visor.setAttribute("aria-label", "Foto ampliada");
    visor.hidden = true;
    visor.innerHTML = '<button class="visor-cerrar" type="button" aria-label="Cerrar">×</button>' +
      '<button class="visor-ant" type="button" aria-label="Foto anterior">‹</button><img alt="">' +
      '<button class="visor-sig" type="button" aria-label="Foto siguiente">›</button><p class="visor-cuenta"></p>';
    document.body.appendChild(visor);
    var img = visor.querySelector("img"), cuenta = visor.querySelector(".visor-cuenta"), indice = 0, origenFoco = null;
    var ver = function (i) {
      indice = (i + fotos.length) % fotos.length;
      img.src = fotos[indice].getAttribute("href");
      img.alt = fotos[indice].querySelector("img").alt;
      cuenta.textContent = (indice + 1) + " de " + fotos.length;
    };
    var cerrar = function () { visor.hidden = true; document.body.style.overflow = ""; if (origenFoco) origenFoco.focus(); };
    fotos.forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        origenFoco = a;
        ver(i);
        visor.hidden = false;
        document.body.style.overflow = "hidden";
        visor.querySelector(".visor-cerrar").focus();
      });
    });
    visor.querySelector(".visor-cerrar").addEventListener("click", cerrar);
    visor.querySelector(".visor-ant").addEventListener("click", function () { ver(indice - 1); });
    visor.querySelector(".visor-sig").addEventListener("click", function () { ver(indice + 1); });
    visor.addEventListener("click", function (e) { if (e.target === visor) cerrar(); });
    document.addEventListener("keydown", function (e) {
      if (visor.hidden) return;
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowLeft") ver(indice - 1);
      if (e.key === "ArrowRight") ver(indice + 1);
    });
  }
})();
