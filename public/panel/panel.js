/* Panel de administración — Novedades Sucumbíos */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var dialogo = document.getElementById("dialogo");
  var usuario = null;
  var sinGuardar = false;
  var CANTONES = ["Lago Agrio", "Shushufindi", "Cascales", "Gonzalo Pizarro", "Putumayo", "Sucumbíos", "Cuyabeno", "Provincia"];
  var TIPOS_ANUNCIO = { imagen: "Imagen o GIF", video: "Video (MP4)", youtube: "Video de YouTube", html: "Diseño en HTML", iframe: "Página externa (iframe)" };

  /* ================= Utilidades ================= */
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function num(n) { return Number(n || 0).toLocaleString("es-EC"); }
  function pct(parte, total) { return (total ? parte / total * 100 : 0).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %"; }
  var NOMBRE_ESPACIO = { cabecera: "Banner principal", lateral: "Lateral fijo", entreNoticias: "Entre noticias", franja: "Franja de video", flotante: "Flotante" };

  function fechaCorta(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  // datetime-local en hora de Ecuador (UTC-5, sin horario de verano)
  function aLocalEcuador(iso) {
    var d = iso ? new Date(iso) : new Date();
    return new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 16);
  }
  function desdeLocalEcuador(valor) {
    var d = new Date(valor + ":00-05:00");
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
  }
  function idYoutube(v) {
    v = String(v || "").trim();
    var m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(v) ? v : "";
  }
  function esVideoArchivo(u) { return /\.(mp4|webm|mov)(\?|$)/i.test(u || ""); }

  // Mismas reglas que el servidor (src/util.js → textoAHtml)
  function textoAHtml(texto) {
    function enLinea(t) {
      return esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }
    return String(texto || "").replace(/\r/g, "").split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean).map(function (b) {
      if (b.indexOf("## ") === 0) return "<h2>" + enLinea(b.slice(3)) + "</h2>";
      if (b.indexOf("> ") === 0) return "<blockquote>" + enLinea(b.replace(/^> ?/gm, "")) + "</blockquote>";
      return "<p>" + enLinea(b).replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
  }

  /* ================= Comunicación con el servidor ================= */
  function api(metodo, url, cuerpo) {
    var opciones = { method: metodo, credentials: "same-origin", headers: {} };
    if (cuerpo !== undefined) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }
    return fetch("/api" + url, opciones).then(function (r) {
      return r.text().then(function (t) {
        var datos = null;
        try { datos = t ? JSON.parse(t) : null; } catch (e) { datos = null; }
        if (r.status === 401 && url !== "/ingresar") {
          usuario = null;
          sinGuardar = false;
          mostrarIngreso("Tu sesión terminó. Vuelve a ingresar.");
          throw new Error("Tu sesión terminó. Vuelve a ingresar.");
        }
        if (!r.ok) throw new Error((datos && datos.error) || "No se pudo completar la acción (error " + r.status + ").");
        return datos;
      });
    }, function () {
      throw new Error("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
    });
  }

  /** Envía un trozo de datos con XHR (para poder mostrar el avance) */
  function enviar(metodo, url, datos, tipo, alAvanzar) {
    return new Promise(function (ok, falla) {
      var xhr = new XMLHttpRequest();
      xhr.open(metodo, url);
      if (tipo) xhr.setRequestHeader("Content-Type", tipo);
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && alAvanzar) alAvanzar(e.loaded / e.total); };
      xhr.onload = function () {
        var r = null;
        try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 401) { mostrarIngreso("Tu sesión terminó. Vuelve a ingresar."); return falla(new Error("Tu sesión terminó.")); }
        if (xhr.status >= 200 && xhr.status < 300 && r) ok(r);
        else falla(new Error((r && r.error) || "No se pudo subir el archivo."));
      };
      xhr.onerror = function () { falla(new Error("Se cortó la conexión mientras se subía el archivo.")); };
      xhr.send(datos);
    });
  }

  /** Las fotos se achican en el navegador (máx. 2000 px, WEBP) para que carguen rápido */
  function optimizarImagen(archivo) {
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return Promise.resolve(archivo);
    return new Promise(function (ok) {
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, 2000 / img.naturalWidth);
        var lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.naturalWidth * escala);
        lienzo.height = Math.round(img.naturalHeight * escala);
        lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(url);
        lienzo.toBlob(function (b) { ok(b && b.size < archivo.size ? b : archivo); }, "image/webp", 0.84);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(archivo); };
      img.src = url;
    });
  }

  /** Sube un archivo al servidor de archivos (VPS) y reporta el avance (0 a 100) */
  function subir(archivo, alAvanzar) {
    var avance = function (f) { if (alAvanzar) alAvanzar(Math.min(100, Math.round(f * 100))); };
    return optimizarImagen(archivo).then(function (a) {
      // 1) el servidor da un permiso firmado, 2) el archivo va directo al VPS
      return api("POST", "/subir/permiso", { tipo: a.type, tamano: a.size }).then(function (permiso) {
        return enviar("PUT", permiso.subir, a, a.type, avance).then(function () {
          return { url: permiso.url, tipo: permiso.tipo };
        });
      });
    });
  }

  /* ================= Avisos y diálogos ================= */
  function aviso(texto, tipo) {
    var el = document.createElement("div");
    el.className = "aviso" + (tipo === "error" ? " aviso--error" : "");
    el.setAttribute("role", tipo === "error" ? "alert" : "status");
    el.textContent = texto;
    $("#avisos").appendChild(el);
    setTimeout(function () { el.remove(); }, tipo === "error" ? 7000 : 3500);
  }
  function fallo(e) { aviso(e.message || String(e), "error"); }

  function abrirDialogo(html, alListo) {
    dialogo.innerHTML = html;
    if (!dialogo.open) dialogo.showModal();
    $$("[data-cerrar]", dialogo).forEach(function (b) { b.addEventListener("click", function () { dialogo.close(); }); });
    if (alListo) alListo(dialogo);
  }

  function confirmar(titulo, texto, botonTexto) {
    return new Promise(function (ok) {
      abrirDialogo(
        '<div class="dialogo-cuerpo"><h2>' + esc(titulo) + "</h2><p>" + esc(texto) + "</p>" +
        '<div class="dialogo-pie"><button class="btn" type="button" data-no>Cancelar</button>' +
        '<button class="btn btn--peligro" type="button" data-si>' + esc(botonTexto || "Borrar") + "</button></div></div>",
        function (d) {
          var respondio = false;
          function responder(v) { respondio = true; dialogo.close(); ok(v); }
          $("[data-no]", d).addEventListener("click", function () { responder(false); });
          $("[data-si]", d).addEventListener("click", function () { responder(true); });
          dialogo.addEventListener("close", function alCerrar() {
            dialogo.removeEventListener("close", alCerrar);
            if (!respondio) ok(false);
          });
          $("[data-no]", d).focus();
        });
    });
  }

  /* ================= Iconos ================= */
  var ICONOS = {
    resumen: '<path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>',
    noticias: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5"/>',
    anuncios: '<path d="M3 10v4h4l6 4V6L7 10H3Z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    cuenta: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    web: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    vivo: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  };
  function icono(n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[n] + "</svg>";
  }

  /* ================= Ingreso ================= */
  function mostrarIngreso(mensaje) {
    document.title = "Ingresar · Panel Novedades Sucumbíos";
    if (dialogo.open) dialogo.close();
    app.innerHTML =
      '<main class="ingreso"><div class="ingreso-caja">' +
      '<img src="/assets/logo.webp" alt="Novedades Sucumbíos">' +
      "<h1>Panel de la redacción</h1>" +
      '<form id="form-ingreso" novalidate>' +
      (mensaje ? '<p class="error-form" role="alert">' + esc(mensaje) + "</p>" : "") +
      '<label class="campo"><span>Usuario</span><input type="text" name="usuario" autocomplete="username" required autocapitalize="off" spellcheck="false"></label>' +
      '<label class="campo"><span>Contraseña</span><input type="password" name="clave" autocomplete="current-password" required></label>' +
      '<button class="btn btn--principal" type="submit">Ingresar</button>' +
      "</form></div></main>";
    var form = $("#form-ingreso");
    form.usuario.focus();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var boton = $("button", form);
      if (!form.usuario.value.trim() || !form.clave.value) {
        mostrarErrorIngreso(form, "Escribe tu usuario y tu contraseña.");
        return;
      }
      boton.disabled = true;
      boton.textContent = "Ingresando…";
      api("POST", "/ingresar", { usuario: form.usuario.value.trim(), clave: form.clave.value }).then(function (u) {
        usuario = u;
        if (!location.hash || location.hash === "#/") location.hash = inicioSegunRol();
        montarMarco();
      }).catch(function (err) {
        boton.disabled = false;
        boton.textContent = "Ingresar";
        mostrarErrorIngreso(form, err.message);
      });
    });
  }
  function mostrarErrorIngreso(form, texto) {
    var p = $(".error-form", form);
    if (!p) {
      p = document.createElement("p");
      p.className = "error-form";
      p.setAttribute("role", "alert");
      form.insertBefore(p, form.firstChild);
    }
    p.textContent = texto;
  }

  function inicioSegunRol() { return usuario && usuario.rol === "admin" ? "#/resumen" : "#/noticias"; }

  /* ================= Marco (menú + contenido) ================= */
  var SECCIONES = [
    { ruta: "resumen", nombre: "Resumen", icono: "resumen", rol: "admin" },
    { ruta: "noticias", nombre: "Noticias", icono: "noticias" },
    { ruta: "vivo", nombre: "En vivo", icono: "vivo" },
    { ruta: "anuncios", nombre: "Anuncios", icono: "anuncios", rol: "admin" },
    { ruta: "usuarios", nombre: "Usuarios", icono: "usuarios", rol: "admin" },
    { ruta: "ajustes", nombre: "Ajustes", icono: "ajustes", rol: "admin" },
    { ruta: "cuenta", nombre: "Mi cuenta", icono: "cuenta" },
  ];
  function puede(seccion) { return !seccion.rol || (usuario && usuario.rol === seccion.rol); }

  function montarMarco() {
    var menu = SECCIONES.filter(puede).map(function (s) {
      return '<a href="#/' + s.ruta + '" data-ruta="' + s.ruta + '">' + icono(s.icono) + s.nombre + "</a>";
    }).join("");
    app.innerHTML =
      '<div class="barra-movil"><button class="btn btn--icono btn--texto" type="button" id="abrir-menu" aria-label="Abrir menú" aria-expanded="false">' + icono("menu") + "</button>" +
      '<img src="/assets/logo.webp" alt=""><strong>Panel</strong></div>' +
      '<div class="marco">' +
      '<aside class="lateral" id="lateral">' +
      '<a class="marca" href="' + inicioSegunRol() + '"><img src="/assets/logo.webp" alt=""><span><strong>Novedades<br>Sucumbíos</strong><small>Panel de la redacción</small></span></a>' +
      '<nav class="menu" aria-label="Secciones del panel">' + menu + "</nav>" +
      '<div class="lateral-pie"><div class="quien">' + esc(usuario.nombre) + "<small>" + (usuario.rol === "admin" ? "Administrador" : "Editor") + "</small></div>" +
      '<div class="acciones"><a class="btn btn--chico" href="/" target="_blank" rel="noopener">' + icono("web").replace('aria-hidden="true"', 'aria-hidden="true" width="14" height="14"') + "Ver la web</a>" +
      '<button class="btn btn--chico btn--texto" type="button" id="salir">Salir</button></div></div>' +
      "</aside>" +
      '<main class="contenido" id="vista" tabindex="-1"></main></div>';

    $("#salir").addEventListener("click", function () {
      if (sinGuardar && !confirm("Tienes cambios sin guardar. ¿Salir de todas formas?")) return;
      sinGuardar = false;
      api("POST", "/salir").then(function () { usuario = null; location.hash = ""; mostrarIngreso(); }).catch(fallo);
    });
    var lateral = $("#lateral");
    $("#abrir-menu").addEventListener("click", function () {
      var abierto = lateral.classList.toggle("abierto");
      this.setAttribute("aria-expanded", abierto ? "true" : "false");
    });
    function cerrarMenu() {
      lateral.classList.remove("abierto");
      $("#abrir-menu").setAttribute("aria-expanded", "false");
    }
    $$(".menu a", lateral).forEach(function (a) { a.addEventListener("click", cerrarMenu); });
    $("#vista").addEventListener("click", cerrarMenu);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && lateral.classList.contains("abierto")) cerrarMenu(); });
    enrutar();
  }

  /* ================= Rutas ================= */
  var rutaActual = location.hash;
  window.addEventListener("hashchange", function () {
    if (!usuario) return;
    if (sinGuardar && location.hash !== rutaActual) {
      if (!confirm("Tienes cambios sin guardar en esta noticia. ¿Salir sin guardar?")) {
        history.replaceState(null, "", rutaActual);
        return;
      }
      sinGuardar = false;
    }
    enrutar();
  });
  window.addEventListener("beforeunload", function (e) {
    if (sinGuardar) { e.preventDefault(); e.returnValue = ""; }
  });

  function enrutar() {
    var partes = (location.hash.replace(/^#\/?/, "").split("?")[0] || "").split("/").filter(Boolean);
    var seccion = SECCIONES.filter(function (s) { return s.ruta === partes[0]; })[0];
    if (!seccion || !puede(seccion)) {
      location.replace(inicioSegunRol());
      return;
    }
    rutaActual = location.hash;
    sinGuardar = false;
    $$(".menu a").forEach(function (a) {
      if (a.dataset.ruta === seccion.ruta) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var vista = $("#vista");
    vista.innerHTML = '<p class="cargando">Cargando…</p>';
    document.title = seccion.nombre + " · Panel Novedades Sucumbíos";
    var vistas = { resumen: vistaResumen, noticias: vistaNoticias, vivo: vistaVivo, anuncios: vistaAnuncios, usuarios: vistaUsuarios, ajustes: vistaAjustes, cuenta: vistaCuenta };
    vistas[seccion.ruta](vista, partes.slice(1));
    window.scrollTo(0, 0);
  }

  /* ================= Noticias: lista ================= */
  function vistaNoticias(vista, partes) {
    if (partes[0] === "nueva") return editorNoticia(vista, null);
    if (partes[0]) return editorNoticia(vista, Number(partes[0]));

    var params = new URLSearchParams(location.hash.split("?")[1] || "");
    var q = params.get("q") || "";
    var pagina = Number(params.get("pagina")) || 1;

    vista.innerHTML =
      '<div class="cabeza"><div><h1>Noticias</h1><p>Publica, edita y borra las noticias de la web.</p></div>' +
      '<div class="cabeza-acciones"><a class="btn btn--principal" href="#/noticias/nueva">Nueva noticia</a></div></div>' +
      '<form class="filtros" id="buscar" role="search"><input type="search" name="q" placeholder="Buscar por título" value="' + esc(q) + '" aria-label="Buscar noticias por título">' +
      '<button class="btn" type="submit">Buscar</button></form>' +
      '<div class="tarjeta" style="padding:0"><div id="lista" class="lista-noticias"><p class="cargando">Cargando…</p></div></div>' +
      '<div class="paginacion" id="paginas"></div>';

    $("#buscar").addEventListener("submit", function (e) {
      e.preventDefault();
      var valor = this.q.value.trim();
      location.hash = "#/noticias" + (valor ? "?q=" + encodeURIComponent(valor) : "");
    });

    api("GET", "/noticias?q=" + encodeURIComponent(q) + "&pagina=" + pagina).then(function (r) {
      var lista = $("#lista");
      if (!r.noticias.length) {
        lista.innerHTML = q
          ? '<div class="vacio"><strong>No hay noticias con «' + esc(q) + '»</strong>Prueba con otra palabra del título.<br><a class="btn" href="#/noticias">Ver todas</a></div>'
          : '<div class="vacio"><strong>Todavía no hay noticias</strong>Publica la primera y aparecerá en la portada.<br><a class="btn btn--principal" href="#/noticias/nueva">Nueva noticia</a></div>';
        return;
      }
      lista.innerHTML = r.noticias.map(function (n) {
        return '<a class="fila-noticia" href="#/noticias/' + n.id + '">' +
          '<span class="miniatura"' + (n.imagen ? ' style="background-image:url(\'' + esc(n.imagen) + '\')"' : "") + ">" + (n.imagen ? "" : "Sin foto") + "</span>" +
          "<span><h3>" + esc(n.titulo) + '</h3><span class="meta">' +
          '<span class="canton">' + esc(n.canton) + "</span>" +
          '<span class="insignia insignia--' + n.estado + '">' + (n.estado === "publicada" ? "Publicada" : "Borrador") + "</span>" +
          (n.destacada ? '<span class="insignia insignia--destacada">Principal</span>' : "") +
          (n.urgente ? '<span class="insignia insignia--urgente">Última hora</span>' : "") +
          (n.tiene_video ? '<span class="insignia insignia--video">Video</span>' : "") +
          "<span>" + esc(fechaCorta(n.publicada_en)) + "</span>" +
          (n.autor ? "<span>por " + esc(n.autor) + "</span>" : "") +
          "</span></span>" +
          '<span class="lado"><strong>' + num(n.vistas) + "</strong> vistas</span></a>";
      }).join("");
      if (r.paginas > 1) {
        var base = "#/noticias?" + (q ? "q=" + encodeURIComponent(q) + "&" : "") + "pagina=";
        $("#paginas").innerHTML =
          (r.pagina > 1 ? '<a class="btn btn--chico" href="' + base + (r.pagina - 1) + '">Anterior</a>' : "") +
          "<span>Página " + r.pagina + " de " + r.paginas + " · " + num(r.total) + " noticias</span>" +
          (r.pagina < r.paginas ? '<a class="btn btn--chico" href="' + base + (r.pagina + 1) + '">Siguiente</a>' : "");
      }
    }).catch(function (e) {
      $("#lista").innerHTML = '<div class="vacio"><strong>No se pudo cargar la lista</strong>' + esc(e.message) + "</div>";
    });
  }

  /* ================= Noticias: editor ================= */
  function editorNoticia(vista, id) {
    var carga = id ? api("GET", "/noticias/" + id) : Promise.resolve({
      titulo: "", resumen: "", contenido: "", canton: "Lago Agrio", imagen: "", imagen_texto: "", video: "", galeria: [],
      enlace_facebook: "", urgente: false, destacada: false, estado: "publicada", publicada_en: new Date().toISOString(),
    });
    carga.then(function (n) { pintarEditor(vista, n, id); }).catch(function (e) {
      vista.innerHTML = '<div class="vacio"><strong>No se pudo abrir la noticia</strong>' + esc(e.message) + '<br><a class="btn" href="#/noticias">Volver a noticias</a></div>';
    });
  }

  function pintarEditor(vista, n, id) {
    var galeria = (n.galeria || []).slice();
    document.title = (id ? "Editar noticia" : "Nueva noticia") + " · Panel Novedades Sucumbíos";

    vista.innerHTML =
      '<div class="cabeza"><div><h1>' + (id ? "Editar noticia" : "Nueva noticia") + "</h1>" +
      "<p>" + (id ? (n.estado === "publicada" ? "Publicada el " + esc(fechaCorta(n.publicada_en)) + " · " + num(n.vistas) + " vistas" : "Borrador sin publicar") : "Completa los datos y publica.") + "</p></div>" +
      '<div class="cabeza-acciones"><a class="btn btn--texto" href="#/noticias">Volver a la lista</a></div></div>' +
      '<form id="form-noticia" class="editor" novalidate>' +
      '<div class="pila">' +
        '<section class="tarjeta">' +
          '<label class="campo"><span>Título</span><input class="titulo-input" type="text" name="titulo" maxlength="200" required value="' + esc(n.titulo) + '" placeholder="Qué pasó, dónde"></label>' +
          '<label class="campo"><span>Resumen</span><textarea name="resumen" rows="3" maxlength="400" placeholder="Dos o tres líneas que se ven en la portada, en Google y al compartir en Facebook">' + esc(n.resumen) + "</textarea>" +
          '<span class="contador" id="contador-resumen"></span></label>' +
          '<div class="campo"><span>Contenido</span>' +
            '<div class="pestanas" role="tablist"><button type="button" role="tab" aria-selected="true" data-pestana="escribir">Escribir</button><button type="button" role="tab" aria-selected="false" data-pestana="previa">Vista previa</button></div>' +
            '<textarea name="contenido" rows="16" placeholder="Escribe la noticia completa…">' + esc(n.contenido) + "</textarea>" +
            '<div class="vista-previa" id="previa" hidden></div>' +
            '<p class="ayuda">Deja una línea en blanco para empezar otro párrafo. <code>## </code> al inicio crea un subtítulo, <code>&gt; </code> una cita, <code>**negrita**</code>, <code>*cursiva*</code> y <code>[texto](https://enlace)</code> un enlace.</p>' +
          "</div>" +
        "</section>" +
        '<section class="tarjeta"><h2>Foto principal</h2>' +
          '<div class="subida" id="subida-foto"></div>' +
          '<label class="campo"><span>Pie de foto</span><input type="text" name="imagen_texto" maxlength="300" value="' + esc(n.imagen_texto) + '" placeholder="Qué se ve en la foto y quién la tomó"></label>' +
        "</section>" +
        '<section class="tarjeta"><h2>Video</h2>' +
          '<p class="sub">Sube un video MP4 o pega el enlace de YouTube o de Facebook.</p>' +
          '<div class="subida" id="subida-video"></div>' +
        "</section>" +
        '<section class="tarjeta"><h2>Galería de fotos</h2>' +
          '<p class="sub">Fotos extra que se ven al final de la noticia. Puedes subir varias a la vez.</p>' +
          '<div class="galeria" id="galeria"></div>' +
          '<button type="button" class="zona-subir" id="subir-galeria"><strong>Agregar fotos</strong>o arrástralas aquí</button>' +
          '<input type="file" id="archivo-galeria" accept="image/*" multiple hidden>' +
          '<div class="progreso" id="progreso-galeria" hidden><div></div></div>' +
        "</section>" +
      "</div>" +
      '<aside class="editor-lateral">' +
        '<section class="tarjeta barra-guardar">' +
          '<button class="btn btn--principal" type="submit" data-estado="publicada">' + (id && n.estado === "publicada" ? "Guardar cambios" : "Publicar") + "</button>" +
          '<button class="btn" type="submit" data-estado="borrador">' + (id && n.estado === "publicada" ? "Pasar a borrador" : "Guardar borrador") + "</button>" +
          (id && n.slug ? '<a class="btn" href="/noticia/' + esc(n.slug) + '" target="_blank" rel="noopener">Ver en la web</a>' : "") +
          '<p class="estado-guardado" id="estado-guardado">' + (id ? "Sin cambios" : "Aún no se guarda") + "</p>" +
        "</section>" +
        '<section class="tarjeta">' +
          '<label class="campo"><span>Cantón</span><select name="canton">' + CANTONES.map(function (c) {
            return "<option" + (c === n.canton ? " selected" : "") + ">" + esc(c) + "</option>";
          }).join("") + "</select></label>" +
          '<label class="campo"><span>Fecha de publicación</span><input type="datetime-local" name="publicada_en" value="' + aLocalEcuador(n.publicada_en) + '"><small class="ayuda">Hora de Ecuador.</small></label>' +
          '<label class="casilla"><input type="checkbox" name="destacada"' + (n.destacada ? " checked" : "") + "><span><strong>Principal de la portada</strong><small>Sale grande arriba. Solo una a la vez: reemplaza a la anterior.</small></span></label>" +
          '<label class="casilla"><input type="checkbox" name="urgente"' + (n.urgente ? " checked" : "") + "><span><strong>Última hora</strong><small>Aparece en la barra dorada de arriba.</small></span></label>" +
          '<label class="campo"><span>Publicación en Facebook</span><input type="url" name="enlace_facebook" value="' + esc(n.enlace_facebook) + '" placeholder="https://www.facebook.com/…"><small class="ayuda">Opcional. Enlace al post original.</small></label>' +
        "</section>" +
        (id ? '<section class="tarjeta"><button class="btn btn--peligro" type="button" id="borrar">Borrar noticia</button></section>' : "") +
      "</aside></form>";

    var form = $("#form-noticia");
    var estadoGuardado = $("#estado-guardado");
    function marcarCambio() {
      sinGuardar = true;
      estadoGuardado.textContent = "Cambios sin guardar";
      estadoGuardado.classList.add("pendiente");
    }
    form.addEventListener("input", marcarCambio);
    form.addEventListener("change", marcarCambio);

    // contador del resumen
    var contador = $("#contador-resumen");
    function contar() {
      var largo = form.resumen.value.length;
      contador.textContent = largo + " caracteres" + (largo > 160 ? " · ideal hasta 160 para Google" : "");
      contador.classList.toggle("excede", largo > 160);
    }
    form.resumen.addEventListener("input", contar);
    contar();

    // pestañas escribir / vista previa
    $$("[data-pestana]", form).forEach(function (b) {
      b.addEventListener("click", function () {
        var previa = b.dataset.pestana === "previa";
        $$("[data-pestana]", form).forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        form.contenido.hidden = previa;
        $("#previa").hidden = !previa;
        if (previa) $("#previa").innerHTML = textoAHtml(form.contenido.value) || '<p class="ayuda">Todavía no hay contenido.</p>';
      });
    });

    // foto principal
    var foto = { url: n.imagen };
    campoArchivo($("#subida-foto"), {
      valor: function () { return foto.url; },
      cambiar: function (u) { foto.url = u; marcarCambio(); },
      aceptar: "image/*",
      textoBoton: "Subir foto",
      textoVacio: "<strong>Subir foto principal</strong>JPG, PNG o WEBP. Ideal horizontal, 1600 px de ancho o más.",
      previa: function (u) { return '<img src="' + esc(u) + '" alt="Foto principal">'; },
      permitirEnlace: false,
    });

    // video
    var video = { url: n.video };
    campoArchivo($("#subida-video"), {
      valor: function () { return video.url; },
      cambiar: function (u) { video.url = u; marcarCambio(); },
      aceptar: "video/mp4,video/webm,video/quicktime",
      textoBoton: "Subir video",
      textoVacio: "<strong>Subir video</strong>MP4 o WEBM, hasta 1 GB.",
      previa: previaVideo,
      permitirEnlace: true,
      textoEnlace: "o pega un enlace de YouTube o Facebook",
    });

    // galería
    function pintarGaleria() {
      var cont = $("#galeria");
      cont.innerHTML = galeria.map(function (u, i) {
        return '<div class="galeria-item"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + ' de la galería" loading="lazy"><span class="orden">' + (i + 1) + "</span>" +
          '<div class="fila-acciones">' +
          '<button type="button" class="btn btn--icono btn--chico" data-mover="' + i + '" data-dir="-1" aria-label="Mover antes"' + (i === 0 ? " disabled" : "") + ">‹</button>" +
          '<button type="button" class="btn btn--icono btn--chico btn--peligro" data-quitar="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">×</button>' +
          '<button type="button" class="btn btn--icono btn--chico" data-mover="' + i + '" data-dir="1" aria-label="Mover después"' + (i === galeria.length - 1 ? " disabled" : "") + ">›</button>" +
          "</div></div>";
      }).join("");
    }
    pintarGaleria();
    $("#galeria").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.quitar != null) galeria.splice(Number(b.dataset.quitar), 1);
      if (b.dataset.mover != null) {
        var i = Number(b.dataset.mover), j = i + Number(b.dataset.dir);
        var t = galeria[i]; galeria[i] = galeria[j]; galeria[j] = t;
      }
      pintarGaleria();
      marcarCambio();
    });
    var entradaGaleria = $("#archivo-galeria");
    var botonGaleria = $("#subir-galeria");
    botonGaleria.addEventListener("click", function () { entradaGaleria.click(); });
    soltarArchivos(botonGaleria, function (archivos) { subirGaleria(archivos); });
    entradaGaleria.addEventListener("change", function () { subirGaleria(Array.prototype.slice.call(this.files)); this.value = ""; });
    function subirGaleria(archivos) {
      archivos = archivos.filter(function (f) { return /^image\//.test(f.type); });
      if (!archivos.length) return;
      var barra = $("#progreso-galeria");
      barra.hidden = false;
      var hechas = 0;
      var cadena = Promise.resolve();
      archivos.forEach(function (f) {
        cadena = cadena.then(function () {
          return subir(f, function (p) { $("div", barra).style.width = Math.round((hechas + p / 100) / archivos.length * 100) + "%"; })
            .then(function (r) { galeria.push(r.url); hechas++; pintarGaleria(); marcarCambio(); })
            .catch(function (e) { hechas++; aviso(f.name + ": " + e.message, "error"); });
        });
      });
      cadena.then(function () { barra.hidden = true; $("div", barra).style.width = "0"; });
    }

    // guardar
    var estadoPedido = "publicada";
    $$('button[type="submit"]', form).forEach(function (b) {
      b.addEventListener("click", function () { estadoPedido = b.dataset.estado; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.titulo.value.trim()) {
        aviso("Escribe el título de la noticia.", "error");
        form.titulo.focus();
        return;
      }
      var cuerpo = {
        titulo: form.titulo.value.trim(),
        resumen: form.resumen.value.trim(),
        contenido: form.contenido.value,
        canton: form.canton.value,
        imagen: foto.url || "",
        imagen_texto: form.imagen_texto.value.trim(),
        video: video.url || "",
        galeria: galeria,
        enlace_facebook: form.enlace_facebook.value.trim(),
        urgente: form.urgente.checked,
        destacada: form.destacada.checked,
        estado: estadoPedido,
        publicada_en: desdeLocalEcuador(form.publicada_en.value),
      };
      var botones = $$('button[type="submit"]', form);
      botones.forEach(function (b) { b.disabled = true; });
      api(id ? "PUT" : "POST", id ? "/noticias/" + id : "/noticias", cuerpo).then(function (guardada) {
        sinGuardar = false;
        aviso(guardada.estado === "publicada" ? (id ? "Cambios publicados." : "Noticia publicada.") : "Borrador guardado.");
        if (!id) { location.hash = "#/noticias/" + guardada.id; return; }
        pintarEditor(vista, guardada, guardada.id);
      }).catch(function (err) {
        botones.forEach(function (b) { b.disabled = false; });
        fallo(err);
      });
    });

    var borrar = $("#borrar");
    if (borrar) {
      borrar.addEventListener("click", function () {
        confirmar("¿Borrar esta noticia?", "Se borrará «" + n.titulo + "» de la web. Esto no se puede deshacer.", "Borrar noticia").then(function (si) {
          if (!si) return;
          api("DELETE", "/noticias/" + id).then(function () {
            sinGuardar = false;
            aviso("Noticia borrada.");
            location.hash = "#/noticias";
          }).catch(fallo);
        });
      });
    }
  }

  function previaVideo(u) {
    var yt = idYoutube(u);
    if (yt) return '<img src="https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg" alt="Miniatura del video de YouTube">';
    if (esVideoArchivo(u)) return '<video src="' + esc(u) + '" controls preload="metadata"></video>';
    if (/facebook\.com|fb\.watch/.test(u)) return '<p class="vacio" style="padding:20px"><strong>Video de Facebook</strong>' + esc(u) + "</p>";
    return '<p class="vacio" style="padding:20px"><strong>Enlace de video</strong>' + esc(u) + "</p>";
  }

  /** Campo para subir un archivo (con arrastrar y soltar) o pegar un enlace */
  function campoArchivo(cont, op) {
    function pintar() {
      var u = op.valor();
      cont.innerHTML =
        (u ? '<div class="subida-previa">' + op.previa(u) + "</div>" +
          '<div class="fila-acciones"><button type="button" class="btn btn--chico" data-cambiar>Cambiar</button><button type="button" class="btn btn--chico btn--peligro" data-quitar>Quitar</button></div>'
          : '<button type="button" class="zona-subir" data-elegir>' + op.textoVacio + "</button>") +
        '<input type="file" accept="' + op.aceptar + '" hidden>' +
        '<div class="progreso" hidden><div></div></div>' +
        (op.permitirEnlace && !u ? '<label class="campo"><span class="ayuda">' + esc(op.textoEnlace) + '</span><input type="url" data-enlace placeholder="https://www.youtube.com/watch?v=…"></label>' : "");
      var entrada = $('input[type="file"]', cont);
      var elegir = $("[data-elegir]", cont) || $("[data-cambiar]", cont);
      elegir.addEventListener("click", function () { entrada.click(); });
      if ($("[data-elegir]", cont)) soltarArchivos($("[data-elegir]", cont), function (f) { enviar(f[0]); });
      var quitar = $("[data-quitar]", cont);
      if (quitar) quitar.addEventListener("click", function () { op.cambiar(""); pintar(); });
      entrada.addEventListener("change", function () { if (this.files[0]) enviar(this.files[0]); });
      var enlace = $("[data-enlace]", cont);
      if (enlace) enlace.addEventListener("change", function () {
        var v = this.value.trim();
        if (!v) return;
        if (!/^https?:\/\//.test(v)) { aviso("Pega un enlace completo que empiece con https://", "error"); return; }
        op.cambiar(v);
        pintar();
      });
    }
    function enviar(archivo) {
      var barra = $(".progreso", cont);
      barra.hidden = false;
      subir(archivo, function (p) { $("div", barra).style.width = p + "%"; }).then(function (r) {
        op.cambiar(r.url);
        pintar();
        aviso("Archivo subido.");
      }).catch(function (e) {
        barra.hidden = true;
        fallo(e);
      });
    }
    pintar();
  }

  function soltarArchivos(zona, alSoltar) {
    zona.addEventListener("dragover", function (e) { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", function () { zona.classList.remove("encima"); });
    zona.addEventListener("drop", function (e) {
      e.preventDefault();
      zona.classList.remove("encima");
      var archivos = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (archivos.length) alSoltar(archivos);
    });
  }

  /* ================= Anuncios ================= */
  function vistaAnuncios(vista) {
    vista.innerHTML =
      '<div class="cabeza"><div><h1>Anuncios</h1><p>Lo que pongas aquí sale en la web al instante. Si un espacio tiene varios anuncios, se turnan solos.</p></div></div>' +
      '<div class="pila" id="espacios"><p class="cargando">Cargando…</p></div>';
    Promise.all([api("GET", "/espacios"), api("GET", "/anuncios"), api("GET", "/estadisticas?dias=30").catch(function () { return null; })])
      .then(function (r) { pintarAnuncios(r[0], r[1], r[2]); })
      .catch(function (e) { $("#espacios").innerHTML = '<div class="vacio"><strong>No se pudieron cargar los anuncios</strong>' + esc(e.message) + "</div>"; });
  }

  function pintarAnuncios(espacios, anuncios, estad) {
    var metricas = {};
    (estad && estad.anuncios || []).forEach(function (a) { metricas[a.id] = a; });
    var cont = $("#espacios");
    cont.innerHTML = Object.keys(espacios).map(function (clave) {
      var e = espacios[clave];
      var lista = anuncios.filter(function (a) { return a.espacio === clave; });
      return '<section class="tarjeta espacio">' +
        '<div class="espacio-cabeza"><div><h2>' + esc(e.nombre) + "</h2><p>" + esc(e.donde) + ' · Medida recomendada: <span class="medida">' + esc(e.medida) + "</span></p></div>" +
        '<button class="btn btn--principal btn--chico" type="button" data-nuevo="' + clave + '">Agregar anuncio</button></div>' +
        (lista.length ? '<div class="anuncios-grid">' + lista.map(function (a, i) {
          var m = metricas[a.id] || { vistas: 0, clics: 0 };
          return '<article class="anuncio-tarjeta' + (a.activo ? "" : " inactivo") + '">' +
            vistaPreviaAnuncio(a, e.proporcion) +
            "<div><h3>" + esc(a.nombre) + '</h3><div class="meta"><span>' + esc(TIPOS_ANUNCIO[a.tipo] || a.tipo) + "</span>" +
            (a.desde || a.hasta ? "<span>" + (a.desde ? "desde " + esc(a.desde) : "") + (a.hasta ? " hasta " + esc(a.hasta) : "") + "</span>" : "<span>Sin fecha de fin</span>") +
            "<span>" + num(m.vistas) + " vistas · " + num(m.clics) + " clics (30 días)</span></div></div>" +
            '<div class="anuncio-pie"><label><span class="interruptor"><input type="checkbox" data-activo="' + a.id + '"' + (a.activo ? " checked" : "") + "><span></span></span>" + (a.activo ? "Se muestra" : "Pausado") + "</label>" +
            '<div class="fila-acciones">' +
            '<button class="btn btn--icono btn--chico" type="button" data-subir="' + a.id + '" aria-label="Mover antes"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
            '<button class="btn btn--icono btn--chico" type="button" data-bajar="' + a.id + '" aria-label="Mover después"' + (i === lista.length - 1 ? " disabled" : "") + ">↓</button>" +
            '<button class="btn btn--chico" type="button" data-editar="' + a.id + '">Editar</button>' +
            '<button class="btn btn--chico btn--peligro" type="button" data-borrar="' + a.id + '">Borrar</button>' +
            "</div></div></article>";
        }).join("") + "</div>"
          : '<div class="vacio" style="padding:18px"><strong>Sin anuncios en este espacio</strong>Mientras esté vacío, la web muestra el aviso «Este espacio puede ser tuyo».</div>') +
        "</section>";
    }).join("");

    function recargar() { vistaAnuncios($("#vista")); }
    function buscar(id) { return anuncios.filter(function (a) { return a.id === Number(id); })[0]; }

    cont.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.nuevo) formularioAnuncio(espacios, { espacio: b.dataset.nuevo, tipo: "imagen", activo: true }, recargar);
      if (b.dataset.editar) formularioAnuncio(espacios, buscar(b.dataset.editar), recargar);
      if (b.dataset.borrar) {
        var a = buscar(b.dataset.borrar);
        confirmar("¿Borrar este anuncio?", "Se quitará «" + a.nombre + "» de la web y se borrarán sus estadísticas. Esto no se puede deshacer.", "Borrar anuncio").then(function (si) {
          if (si) api("DELETE", "/anuncios/" + a.id).then(function () { aviso("Anuncio borrado."); recargar(); }).catch(fallo);
        });
      }
      if (b.dataset.subir || b.dataset.bajar) {
        var mover = buscar(b.dataset.subir || b.dataset.bajar);
        var grupo = anuncios.filter(function (x) { return x.espacio === mover.espacio; });
        var i = grupo.indexOf(mover), j = i + (b.dataset.subir ? -1 : 1);
        if (j < 0 || j >= grupo.length) return;
        grupo[i] = grupo[j]; grupo[j] = mover;
        api("PATCH", "/anuncios/orden", { ids: grupo.map(function (x) { return x.id; }) }).then(recargar).catch(fallo);
      }
    });
    cont.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t.dataset.activo) return;
      var a = buscar(t.dataset.activo);
      var cuerpo = Object.assign({}, a, { activo: t.checked });
      api("PUT", "/anuncios/" + a.id, cuerpo).then(function () {
        aviso(t.checked ? "Anuncio activado." : "Anuncio pausado.");
        recargar();
      }).catch(function (e) { t.checked = !t.checked; fallo(e); });
    });
  }

  function vistaPreviaAnuncio(a, proporcion) {
    // el espacio lateral es alto: se limita el ancho para que la tarjeta no crezca demasiado
    var ancho = proporcion < 1 ? "max-width:" + Math.round(240 * proporcion * 1.6) + "px;" : "";
    var interior;
    if (a.tipo === "imagen") interior = '<img src="' + esc(a.src) + '" alt="" loading="lazy">';
    else if (a.tipo === "video") interior = '<video src="' + esc(a.src) + '"' + (a.poster ? ' poster="' + esc(a.poster) + '"' : "") + ' muted loop playsinline preload="metadata"></video>';
    else if (a.tipo === "youtube") interior = '<img src="https://i.ytimg.com/vi/' + esc(idYoutube(a.src) || a.src) + '/hqdefault.jpg" alt="" loading="lazy" style="object-fit:cover">';
    else if (a.tipo === "html") interior = '<iframe sandbox="" title="Vista previa del anuncio" srcdoc="' + esc('<style>body{margin:0;font-family:sans-serif;color:#EEF3E8;background:#0E3B1E;height:100vh}.ad-casa{height:100%;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 12px;text-align:center;padding:8px;font-size:12px}.ad-casa strong{width:100%}.ad-casa a{background:#E9C02A;color:#142012;padding:4px 10px;border-radius:99px;text-decoration:none}</style>' + (a.html || "")) + '"></iframe>';
    else interior = '<div class="vista-texto">Página externa<br>' + esc(a.src) + "</div>";
    return '<div class="vista-anuncio" style="aspect-ratio:' + proporcion + ";" + ancho + '">' + interior +
      '<span class="vista-etiqueta">Así se ve en la web</span></div>';
  }

  function formularioAnuncio(espacios, a, alGuardar) {
    var datos = Object.assign({ nombre: "", src: "", src_movil: "", poster: "", enlace: "", html: "", desde: "", hasta: "", duracion: 0 }, a);
    var opcionesEspacio = Object.keys(espacios).map(function (k) {
      return '<option value="' + k + '"' + (k === datos.espacio ? " selected" : "") + ">" + esc(espacios[k].nombre) + " (" + esc(espacios[k].medida) + ")</option>";
    }).join("");
    var opcionesTipo = Object.keys(TIPOS_ANUNCIO).map(function (k) {
      return '<option value="' + k + '"' + (k === datos.tipo ? " selected" : "") + ">" + TIPOS_ANUNCIO[k] + "</option>";
    }).join("");

    abrirDialogo(
      '<form method="dialog" id="form-anuncio" novalidate><h2>' + (datos.id ? "Editar anuncio" : "Nuevo anuncio") + "</h2>" +
      '<label class="campo"><span>Nombre interno</span><input type="text" name="nombre" maxlength="120" value="' + esc(datos.nombre) + '" placeholder="Ej.: Ferretería El Cofán – diciembre" required></label>' +
      '<div class="dos-columnas"><label class="campo"><span>Dónde sale</span><select name="espacio">' + opcionesEspacio + "</select></label>" +
      '<label class="campo"><span>Tipo</span><select name="tipo">' + opcionesTipo + "</select></label></div>" +
      '<div id="campos-tipo" class="pila"></div>' +
      '<label class="campo" id="campo-enlace"><span>Enlace al hacer clic</span><input type="url" name="enlace" value="' + esc(datos.enlace) + '" placeholder="https://wa.me/593… o la web del anunciante"><small class="ayuda">Opcional. Se abre en otra pestaña.</small></label>' +
      '<div class="dos-columnas"><label class="campo"><span>Desde</span><input type="date" name="desde" value="' + esc(datos.desde) + '"></label>' +
      '<label class="campo"><span>Hasta</span><input type="date" name="hasta" value="' + esc(datos.hasta) + '"></label></div>' +
      '<div class="dos-columnas"><label class="campo"><span>Segundos en pantalla</span><input type="number" name="duracion" min="0" max="300" value="' + (datos.duracion || "") + '" placeholder="Automático"><small class="ayuda">Si hay varios anuncios en el espacio. Vacío = 9 segundos (los videos, hasta que terminan).</small></label>' +
      '<label class="casilla" style="align-self:center"><input type="checkbox" name="activo"' + (datos.activo !== false && datos.activo !== 0 ? " checked" : "") + "><span><strong>Mostrar en la web</strong><small>Desmárcalo para pausarlo sin borrarlo.</small></span></label></div>" +
      '<div class="dialogo-pie"><button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">' + (datos.id ? "Guardar cambios" : "Agregar anuncio") + "</button></div></form>",
      function (d) {
        var form = $("#form-anuncio", d);
        var archivos = { src: datos.src, src_movil: datos.src_movil, poster: datos.poster };

        function proporcionEspacio() { return espacios[form.espacio.value].proporcion; }

        function pintarCamposTipo() {
          var tipo = form.tipo.value;
          var c = $("#campos-tipo", d);
          $("#campo-enlace", d).hidden = tipo === "html" || tipo === "iframe";
          if (tipo === "imagen") {
            c.innerHTML = '<div><span class="etiqueta">Imagen o GIF</span><div class="subida" id="a-src"></div><div id="aviso-medida"></div></div>' +
              '<div><span class="etiqueta">Versión para celular (opcional)</span><div class="subida" id="a-movil"></div></div>';
            campoArchivoAnuncio($("#a-src", d), "src", "image/*", true);
            campoArchivoAnuncio($("#a-movil", d), "src_movil", "image/*", false);
          } else if (tipo === "video") {
            c.innerHTML = '<div><span class="etiqueta">Video MP4</span><div class="subida" id="a-src"></div><div id="aviso-medida"></div></div>' +
              '<div><span class="etiqueta">Imagen de portada del video (opcional)</span><div class="subida" id="a-poster"></div></div>';
            campoArchivoAnuncio($("#a-src", d), "src", "video/mp4,video/webm", true);
            campoArchivoAnuncio($("#a-poster", d), "poster", "image/*", false);
          } else if (tipo === "youtube") {
            c.innerHTML = '<label class="campo"><span>Enlace de YouTube</span><input type="url" name="src" value="' + esc(archivos.src && idYoutube(archivos.src) ? "https://www.youtube.com/watch?v=" + idYoutube(archivos.src) : "") + '" placeholder="https://www.youtube.com/watch?v=…"></label>';
          } else if (tipo === "html") {
            c.innerHTML = '<label class="campo"><span>Código HTML</span><textarea name="html" rows="7" placeholder="&lt;div class=&quot;ad-casa&quot;&gt;…&lt;/div&gt;">' + esc(datos.html) + "</textarea><small class=\"ayuda\">Para diseños propios. La clase <code>ad-casa</code> usa el estilo verde de la web.</small></label>";
          } else {
            c.innerHTML = '<label class="campo"><span>Dirección de la página</span><input type="url" name="src" value="' + esc(/^https?:/.test(archivos.src) ? archivos.src : "") + '" placeholder="https://…"></label>';
          }
        }

        function campoArchivoAnuncio(cont, clave, aceptar, revisarMedida) {
          campoArchivo(cont, {
            valor: function () { return archivos[clave]; },
            cambiar: function (u) { archivos[clave] = u; if (revisarMedida) revisarProporcion(); },
            aceptar: aceptar,
            textoVacio: "<strong>Subir archivo</strong>" + (aceptar.indexOf("video") === 0 ? "MP4 o WEBM, hasta 1 GB." : "JPG, PNG, WEBP o GIF."),
            previa: function (u) { return /^video/.test(aceptar) || esVideoArchivo(u) ? '<video src="' + esc(u) + '" controls muted preload="metadata"></video>' : '<img src="' + esc(u) + '" alt="">'; },
            permitirEnlace: true,
            textoEnlace: "o pega el enlace del archivo",
          });
          if (revisarMedida) revisarProporcion();
        }

        function revisarProporcion() {
          var caja = $("#aviso-medida", d);
          if (!caja) return;
          caja.innerHTML = "";
          var u = archivos.src;
          if (!u) return;
          var esVideo = form.tipo.value === "video";
          var medir = new Promise(function (ok) {
            if (esVideo) {
              var v = document.createElement("video");
              v.preload = "metadata";
              v.onloadedmetadata = function () { ok(v.videoWidth / v.videoHeight); };
              v.onerror = function () { ok(0); };
              v.src = u;
            } else {
              var im = new Image();
              im.onload = function () { ok(im.naturalWidth / im.naturalHeight); };
              im.onerror = function () { ok(0); };
              im.src = u;
            }
          });
          medir.then(function (r) {
            if (!r || u !== archivos.src) return;
            var p = proporcionEspacio();
            if (Math.abs(r / p - 1) > 0.15) {
              var e = espacios[form.espacio.value];
              caja.innerHTML = '<p class="aviso-medida" role="status">Este ' + (esVideo ? "video" : "archivo") + " no tiene la forma del espacio «" + esc(e.nombre) + "». Se verá completo pero con franjas " +
                (r > p ? "arriba y abajo" : "a los lados") + ". Para que llene el espacio usa " + esc(e.medida) + ".</p>";
            }
          });
        }

        form.tipo.addEventListener("change", pintarCamposTipo);
        form.espacio.addEventListener("change", revisarProporcion);
        pintarCamposTipo();

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var tipo = form.tipo.value;
          var cuerpo = {
            espacio: form.espacio.value, tipo: tipo, nombre: form.nombre.value.trim(),
            src: tipo === "youtube" || tipo === "iframe" ? (form.src ? form.src.value.trim() : "") : (tipo === "html" ? "" : archivos.src || ""),
            src_movil: tipo === "imagen" ? archivos.src_movil || "" : "",
            poster: tipo === "video" ? archivos.poster || "" : "",
            enlace: tipo === "html" || tipo === "iframe" ? "" : form.enlace.value.trim(),
            html: tipo === "html" ? form.html.value : "",
            desde: form.desde.value, hasta: form.hasta.value,
            duracion: Number(form.duracion.value) || 0,
            activo: form.activo.checked,
          };
          if (cuerpo.desde && cuerpo.hasta && cuerpo.hasta < cuerpo.desde) { aviso("La fecha «Hasta» es anterior a «Desde».", "error"); return; }
          var boton = $('button[type="submit"]', form);
          boton.disabled = true;
          api(datos.id ? "PUT" : "POST", datos.id ? "/anuncios/" + datos.id : "/anuncios", cuerpo).then(function () {
            dialogo.close();
            aviso(datos.id ? "Anuncio actualizado." : "Anuncio agregado.");
            alGuardar();
          }).catch(function (err) { boton.disabled = false; fallo(err); });
        });
        form.nombre.focus();
      });
  }

  /* ================= Resumen / estadísticas ================= */
  var diasResumen = 30;
  function vistaResumen(vista) {
    vista.innerHTML =
      '<div class="cabeza"><div><h1>Resumen</h1><p>Visitas de la web y rendimiento de los anuncios. No se cuentan tus propias visitas mientras tengas la sesión abierta.</p></div>' +
      '<div class="periodo" role="group" aria-label="Periodo">' + [7, 30, 90].map(function (d) {
        return '<button type="button" data-dias="' + d + '" aria-pressed="' + (d === diasResumen) + '">' + d + " días</button>";
      }).join("") + "</div></div>" +
      '<div id="resumen" class="pila"><p class="cargando">Cargando…</p></div>';
    $$(".periodo button", vista).forEach(function (b) {
      b.addEventListener("click", function () { diasResumen = Number(b.dataset.dias); vistaResumen(vista); });
    });
    api("GET", "/estadisticas?dias=" + diasResumen).then(pintarResumen).catch(function (e) {
      $("#resumen").innerHTML = '<div class="vacio"><strong>No se pudieron cargar las estadísticas</strong>' + esc(e.message) + "</div>";
    });
  }

  function variacion(actual, previo) {
    if (!previo && !actual) return "Sin datos del periodo anterior";
    if (!previo) return "Sin visitas en el periodo anterior";
    var p = Math.round((actual - previo) / previo * 100);
    return '<span class="' + (p >= 0 ? "sube" : "baja") + '">' + (p >= 0 ? "▲ " : "▼ ") + Math.abs(p) + "%</span> frente a los " + diasResumen + " días anteriores";
  }

  function pintarResumen(r) {
    var cont = $("#resumen");
    var clics = r.anuncios.reduce(function (s, a) { return s + a.clics; }, 0);
    var vistasAd = r.anuncios.reduce(function (s, a) { return s + a.vistas; }, 0);
    var kpis =
      '<div class="kpis">' +
      '<div class="kpi"><span>Visitas</span><strong>' + num(r.actual.visitas) + "</strong><small>" + variacion(r.actual.visitas, r.previo.visitas) + "</small></div>" +
      '<div class="kpi"><span>Visitantes</span><strong>' + num(r.actual.visitantes) + "</strong><small>" + variacion(r.actual.visitantes, r.previo.visitantes) + "</small></div>" +
      '<div class="kpi"><span>Noticias publicadas</span><strong>' + num(r.publicadas) + "</strong><small>en los últimos " + r.dias + " días</small></div>" +
      '<div class="kpi"><span>Clics en anuncios</span><strong>' + num(clics) + "</strong><small>" + (vistasAd ? "de " + num(vistasAd) + " vistas · " + pct(clics, vistasAd) + " de clics" : "Aún sin vistas de anuncios") + "</small></div>" +
      "</div>";

    if (!r.actual.visitas) {
      cont.innerHTML = kpis +
        '<div class="tarjeta vacio"><strong>Todavía no hay visitas en este periodo</strong>Las visitas se cuentan solas cuando alguien abre la web. Comparte una noticia en Facebook o Telegram y vuelve en un rato.</div>' +
        tablaAnuncios(r);
      return;
    }

    var maxOrigen = Math.max.apply(null, r.origenes.map(function (o) { return o.visitas; }).concat([1]));
    var maxDisp = Math.max.apply(null, r.dispositivos.map(function (o) { return o.visitas; }).concat([1]));
    function barras(lista, max, total) {
      return '<div class="barras">' + lista.map(function (o) {
        var pct = total ? Math.round(o.visitas / total * 100) : 0;
        return '<div class="barra" title="' + esc(o.nombre) + ": " + num(o.visitas) + " visitas (" + pct + '%)"><span class="nombre">' + esc(o.nombre) + "</span>" +
          '<span class="pista"><span class="relleno" style="display:block;width:' + Math.max(1, o.visitas / max * 100) + '%"></span></span>' +
          '<span class="valor">' + num(o.visitas) + "<small>" + pct + "%</small></span></div>";
      }).join("") + "</div>";
    }

    cont.innerHTML = kpis +
      '<section class="tarjeta"><h2>Visitas por día</h2>' +
      '<div class="leyenda"><span><i style="background:var(--serie-1)"></i>Visitas</span><span><i style="background:var(--serie-2)"></i>Visitantes</span>' +
      '<button class="btn btn--chico btn--texto derecha ver-tabla" type="button" id="ver-tabla" aria-expanded="false">Ver como tabla</button></div>' +
      '<div class="grafico" id="grafico-dias"></div><div id="tabla-dias" hidden></div></section>' +
      '<div class="graficos">' +
        '<section class="tarjeta"><h2>De dónde llegan</h2>' + barras(r.origenes, maxOrigen, r.actual.visitas) + "</section>" +
        '<section class="tarjeta"><h2>Desde qué aparato</h2>' + barras(r.dispositivos, maxDisp, r.actual.visitas) + "</section>" +
      "</div>" +
      '<section class="tarjeta"><h2>Noticias más leídas</h2>' +
        (r.topNoticias.length ? '<div class="tabla-envoltura"><table><thead><tr><th>Noticia</th><th>Cantón</th><th class="num">Visitas</th></tr></thead><tbody>' +
          r.topNoticias.map(function (n) {
            return '<tr><td><a href="/noticia/' + esc(n.slug) + '" target="_blank" rel="noopener">' + esc(n.titulo) + "</a></td><td>" + esc(n.canton) + '</td><td class="num">' + num(n.visitas) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
          : '<p class="ayuda">Aún nadie abrió una noticia en este periodo; solo hay visitas a la portada.</p>') +
      "</section>" + tablaAnuncios(r);

    graficoLineas($("#grafico-dias"), r.serie);
    var tabla = $("#tabla-dias");
    tabla.innerHTML = '<div class="tabla-envoltura"><table><thead><tr><th>Día</th><th class="num">Visitas</th><th class="num">Visitantes</th></tr></thead><tbody>' +
      r.serie.slice().reverse().map(function (d) {
        return "<tr><td>" + esc(diaLargo(d.dia)) + '</td><td class="num">' + num(d.visitas) + '</td><td class="num">' + num(d.visitantes) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    $("#ver-tabla").addEventListener("click", function () {
      var ver = tabla.hidden;
      tabla.hidden = !ver;
      $("#grafico-dias").hidden = ver;
      this.textContent = ver ? "Ver como gráfico" : "Ver como tabla";
      this.setAttribute("aria-expanded", ver ? "true" : "false");
    });
  }

  function tablaAnuncios(r) {
    if (!r.anuncios.length) return "";
    return '<section class="tarjeta"><h2>Anuncios</h2><p class="sub">Vistas: veces que el anuncio apareció en pantalla. Clics: veces que alguien lo tocó.</p>' +
      '<div class="tabla-envoltura"><table><thead><tr><th>Anuncio</th><th>Espacio</th><th class="num">Vistas</th><th class="num">Clics</th><th class="num">% de clics</th></tr></thead><tbody>' +
      r.anuncios.map(function (a) {
        return "<tr><td>" + esc(a.nombre) + (a.activo ? "" : ' <span class="insignia insignia--borrador">Pausado</span>') + "</td><td>" + esc(NOMBRE_ESPACIO[a.espacio] || a.espacio) +
          '</td><td class="num">' + num(a.vistas) + '</td><td class="num">' + num(a.clics) + '</td><td class="num">' + (a.vistas ? pct(a.clics, a.vistas) : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function diaLargo(iso) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
  }
  function diaCorto(iso) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
  }

  /** Gráfico de líneas en SVG: visitas (área + línea) y visitantes (línea), con cruz y tooltip */
  function graficoLineas(cont, serie) {
    function dibujar() {
      var ancho = Math.max(300, cont.clientWidth || 600);
      var alto = ancho < 600 ? 220 : 280;
      var m = { arriba: 16, derecha: 70, abajo: 28, izquierda: 44 };
      var w = ancho - m.izquierda - m.derecha, h = alto - m.arriba - m.abajo;
      var max = Math.max.apply(null, serie.map(function (d) { return d.visitas; }).concat([1]));
      var paso = Math.pow(10, Math.floor(Math.log10(max)));
      var techo = Math.ceil(max / paso) * paso;
      if (techo / 4 !== Math.round(techo / 4) && techo > 4) techo = Math.ceil(max / (paso / 2)) * (paso / 2);
      var n = serie.length;
      function x(i) { return m.izquierda + (n === 1 ? w / 2 : i / (n - 1) * w); }
      function y(v) { return m.arriba + h - v / techo * h; }
      function linea(clave) { return serie.map(function (d, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d[clave]).toFixed(1); }).join(" "); }

      var rejilla = "";
      for (var k = 0; k <= 4; k++) {
        var v = techo / 4 * k;
        var yy = y(v);
        rejilla += '<line class="' + (k === 0 ? "base" : "rejilla") + '" x1="' + m.izquierda + '" x2="' + (m.izquierda + w) + '" y1="' + yy + '" y2="' + yy + '"/>' +
          '<text class="eje" x="' + (m.izquierda - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + num(Math.round(v)) + "</text>";
      }
      var marcas = "";
      var cada = Math.ceil(n / (ancho < 600 ? 4 : 7));
      for (var i = 0; i < n; i += cada) {
        marcas += '<text class="eje" x="' + x(i) + '" y="' + (alto - 8) + '" text-anchor="middle">' + esc(diaCorto(serie[i].dia)) + "</text>";
      }
      var ult = serie[n - 1];
      var yv = y(ult.visitas), yu = y(ult.visitantes);
      if (Math.abs(yv - yu) < 14) { if (yv <= yu) { yv -= 7; yu += 7; } else { yv += 7; yu -= 7; } }
      var area = linea("visitas") + " L" + x(n - 1).toFixed(1) + " " + y(0) + " L" + x(0).toFixed(1) + " " + y(0) + " Z";

      cont.innerHTML =
        '<svg viewBox="0 0 ' + ancho + " " + alto + '" role="img" aria-label="Visitas y visitantes por día">' +
        '<defs><linearGradient id="relleno-visitas" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3987e5" stop-opacity=".28"/><stop offset="1" stop-color="#3987e5" stop-opacity="0"/></linearGradient></defs>' +
        rejilla + marcas +
        '<path d="' + area + '" fill="url(#relleno-visitas)"/>' +
        '<path d="' + linea("visitas") + '" fill="none" stroke="var(--serie-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<path d="' + linea("visitantes") + '" fill="none" stroke="var(--serie-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text class="etiqueta-serie" x="' + (x(n - 1) + 8) + '" y="' + (yv + 4) + '">Visitas</text>' +
        '<text class="etiqueta-serie" x="' + (x(n - 1) + 8) + '" y="' + (yu + 4) + '">Visitantes</text>' +
        '<g id="cruz" style="display:none"><line x1="0" x2="0" y1="' + m.arriba + '" y2="' + (m.arriba + h) + '" stroke="#5B7A63" stroke-width="1"/>' +
        '<circle r="5" fill="var(--serie-1)" stroke="#15251A" stroke-width="2" data-p="visitas"/><circle r="5" fill="var(--serie-2)" stroke="#15251A" stroke-width="2" data-p="visitantes"/></g>' +
        '<rect x="' + m.izquierda + '" y="' + m.arriba + '" width="' + w + '" height="' + h + '" fill="transparent" id="captura"/>' +
        "</svg>" + '<div class="tip" hidden></div>';

      var svg = $("svg", cont), cruz = $("#cruz", cont), tip = $(".tip", cont);
      function mostrar(ev) {
        var caja = svg.getBoundingClientRect();
        var px = (ev.clientX - caja.left) * (ancho / caja.width);
        var i = Math.round((px - m.izquierda) / (w / Math.max(1, n - 1)));
        i = Math.max(0, Math.min(n - 1, i));
        var d = serie[i];
        cruz.style.display = "";
        $("line", cruz).setAttribute("x1", x(i)); $("line", cruz).setAttribute("x2", x(i));
        $('[data-p="visitas"]', cruz).setAttribute("cx", x(i)); $('[data-p="visitas"]', cruz).setAttribute("cy", y(d.visitas));
        $('[data-p="visitantes"]', cruz).setAttribute("cx", x(i)); $('[data-p="visitantes"]', cruz).setAttribute("cy", y(d.visitantes));
        tip.hidden = false;
        tip.innerHTML = "<b>" + esc(diaLargo(d.dia)) + "</b>" +
          '<div><span><i style="background:var(--serie-1)"></i>Visitas</span><span>' + num(d.visitas) + "</span></div>" +
          '<div><span><i style="background:var(--serie-2)"></i>Visitantes</span><span>' + num(d.visitantes) + "</span></div>";
        var escala = caja.width / ancho;
        var left = x(i) * escala;
        left = Math.max(80, Math.min(caja.width - 80, left));
        tip.style.left = left + "px";
        tip.style.top = (Math.min(y(d.visitas), y(d.visitantes)) * escala) + "px";
      }
      var captura = $("#captura", cont);
      captura.addEventListener("pointermove", mostrar);
      captura.addEventListener("pointerdown", mostrar);
      captura.addEventListener("pointerleave", function () { cruz.style.display = "none"; tip.hidden = true; });
    }
    dibujar();
    var t;
    var ro = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { if (document.body.contains(cont)) dibujar(); else ro.disconnect(); }, 120); });
    ro.observe(cont);
  }

  /* ================= Usuarios ================= */
  function vistaUsuarios(vista) {
    vista.innerHTML =
      '<div class="cabeza"><div><h1>Usuarios</h1><p>El administrador ve todo. El editor solo publica, edita y borra noticias.</p></div>' +
      '<div class="cabeza-acciones"><button class="btn btn--principal" type="button" id="nuevo-usuario">Nuevo usuario</button></div></div>' +
      '<div class="tarjeta" id="usuarios"><p class="cargando">Cargando…</p></div>';
    function cargar() {
      api("GET", "/usuarios").then(function (lista) {
        $("#usuarios").innerHTML = '<div class="tabla-envoltura"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Creado</th><th></th></tr></thead><tbody>' +
          lista.map(function (u) {
            var yo = u.id === usuario.id;
            return "<tr><td>" + esc(u.nombre) + (yo ? ' <span class="insignia insignia--destacada">Tú</span>' : "") + "</td><td>" + esc(u.usuario) + "</td><td>" + (u.rol === "admin" ? "Administrador" : "Editor") +
              "</td><td>" + esc(fechaCorta(u.creado_en)) + '</td><td class="num"><div class="fila-acciones" style="justify-content:flex-end">' +
              '<button class="btn btn--chico" type="button" data-editar="' + u.id + '">Editar</button>' +
              (yo ? "" : '<button class="btn btn--chico btn--peligro" type="button" data-borrar="' + u.id + '">Borrar</button>') +
              "</div></td></tr>";
          }).join("") + "</tbody></table></div>";
        $("#usuarios").onclick = function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var u = lista.filter(function (x) { return x.id === Number(b.dataset.editar || b.dataset.borrar); })[0];
          if (b.dataset.editar) formularioUsuario(u, cargar);
          if (b.dataset.borrar) {
            confirmar("¿Borrar este usuario?", "«" + u.nombre + "» ya no podrá entrar al panel. Sus noticias se mantienen.", "Borrar usuario").then(function (si) {
              if (si) api("DELETE", "/usuarios/" + u.id).then(function () { aviso("Usuario borrado."); cargar(); }).catch(fallo);
            });
          }
        };
      }).catch(function (e) { $("#usuarios").innerHTML = '<div class="vacio"><strong>No se pudo cargar la lista</strong>' + esc(e.message) + "</div>"; });
    }
    $("#nuevo-usuario").addEventListener("click", function () { formularioUsuario(null, cargar); });
    cargar();
  }

  function formularioUsuario(u, alGuardar) {
    var nuevo = !u;
    abrirDialogo(
      '<form method="dialog" id="form-usuario" novalidate><h2>' + (nuevo ? "Nuevo usuario" : "Editar a " + esc(u.nombre)) + "</h2>" +
      '<label class="campo"><span>Nombre</span><input type="text" name="nombre" maxlength="80" value="' + esc(u ? u.nombre : "") + '" placeholder="Nombre y apellido" required></label>' +
      (nuevo ? '<label class="campo"><span>Usuario para ingresar</span><input type="text" name="usuario" maxlength="30" autocapitalize="off" spellcheck="false" placeholder="ej.: maria.lopez" required><small class="ayuda">De 3 a 30 letras, números, punto o guion. No se puede cambiar después.</small></label>' : "") +
      '<label class="campo"><span>Rol</span><select name="rol"' + (u && u.id === usuario.id ? " disabled" : "") + '><option value="editor"' + (u && u.rol === "editor" ? " selected" : "") + ">Editor: solo noticias</option>" +
      '<option value="admin"' + (u && u.rol === "admin" ? " selected" : "") + ">Administrador: todo</option></select>" +
      (u && u.id === usuario.id ? '<small class="ayuda">No puedes cambiar tu propio rol.</small>' : "") + "</label>" +
      '<label class="campo"><span>' + (nuevo ? "Contraseña" : "Nueva contraseña (opcional)") + '</span><input type="password" name="clave" autocomplete="new-password" minlength="10" placeholder="Mínimo 10 caracteres"><small class="ayuda">' +
      (nuevo ? "Compártela con la persona por un medio privado." : "Déjala vacía para no cambiarla. Si la cambias, se cerrará su sesión.") + "</small></label>" +
      '<div class="dialogo-pie"><button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">' + (nuevo ? "Crear usuario" : "Guardar cambios") + "</button></div></form>",
      function (d) {
        var form = $("#form-usuario", d);
        form.nombre.focus();
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var cuerpo = { nombre: form.nombre.value.trim(), rol: form.rol.value };
          if (form.clave.value) cuerpo.clave = form.clave.value;
          if (nuevo) {
            cuerpo.usuario = form.usuario.value.trim();
            if (!cuerpo.clave) { aviso("Escribe una contraseña de al menos 10 caracteres.", "error"); return; }
          }
          if (cuerpo.clave && cuerpo.clave.length < 10) { aviso("La contraseña debe tener al menos 10 caracteres.", "error"); return; }
          api(nuevo ? "POST" : "PUT", nuevo ? "/usuarios" : "/usuarios/" + u.id, cuerpo).then(function () {
            dialogo.close();
            aviso(nuevo ? "Usuario creado." : "Usuario actualizado.");
            alGuardar();
          }).catch(fallo);
        });
      });
  }

  /* ================= En vivo ================= */
  var ESTADO_VIVO = { en_vivo: "En vivo ahora", programada: "Programada", terminada: "Terminada" };

  function vistaVivo(vista) {
    vista.innerHTML =
      '<div class="cabeza"><div><h1>En vivo</h1><p>Cuando transmitas en Facebook o YouTube, pega aquí el enlace: la transmisión aparece en la portada, en todas las páginas y en /en-vivo.</p></div>' +
      '<div class="cabeza-acciones"><a class="btn" href="/en-vivo" target="_blank" rel="noopener">Ver la página en vivo</a>' +
      '<button class="btn btn--principal" type="button" id="nueva-transmision">Empezar transmisión</button></div></div>' +
      '<div id="transmisiones" class="pila"><p class="cargando">Cargando…</p></div>';

    function cargar() {
      api("GET", "/transmisiones").then(function (lista) {
        var activa = lista.filter(function (t) { return t.estado === "en_vivo"; })[0];
        var cont = $("#transmisiones");
        cont.innerHTML =
          (activa
            ? '<section class="tarjeta vivo-activa"><p class="vivo-estado"><span class="punto-vivo" aria-hidden="true"></span>Se está mostrando en la web</p>' +
              "<h2>" + esc(activa.titulo) + "</h2>" +
              '<p class="sub">Empezó ' + esc(fechaCorta(activa.inicio)) + " · " + '<a href="' + esc(activa.enlace) + '" target="_blank" rel="noopener">Abrir en Facebook/YouTube</a></p>' +
              '<div class="fila-acciones"><button class="btn btn--peligro" type="button" data-terminar="' + activa.id + '">Terminar transmisión</button>' +
              '<button class="btn" type="button" data-editar="' + activa.id + '">Editar</button></div>' +
              '<small class="ayuda">Al terminarla deja de mostrarse como «en vivo» y queda guardada en «Transmisiones anteriores».</small></section>'
            : '<section class="tarjeta"><div class="vacio" style="padding:12px 0"><strong>No hay ninguna transmisión en vivo</strong>Cuando empieces a transmitir en Facebook, pulsa «Empezar transmisión» y pega el enlace del video en vivo.</div></section>') +
          '<section class="tarjeta"><h2>Historial</h2>' +
          (lista.length
            ? '<div class="tabla-envoltura"><table><thead><tr><th>Transmisión</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>' +
              lista.map(function (t) {
                var fecha = t.estado === "programada" ? t.programada_para : t.inicio || t.creado_en;
                return "<tr><td>" + esc(t.titulo) + (t.autor ? '<br><small class="sub">' + esc(t.autor) + "</small>" : "") + "</td>" +
                  '<td><span class="insignia' + (t.estado === "en_vivo" ? " insignia--urgente" : t.estado === "programada" ? " insignia--destacada" : "") + '">' + ESTADO_VIVO[t.estado] + "</span></td>" +
                  "<td>" + esc(fechaCorta(fecha)) + '</td><td class="num"><div class="fila-acciones" style="justify-content:flex-end">' +
                  (t.estado === "programada" ? '<button class="btn btn--chico btn--principal" type="button" data-iniciar="' + t.id + '">Iniciar ahora</button>' : "") +
                  '<button class="btn btn--chico" type="button" data-editar="' + t.id + '">Editar</button>' +
                  '<button class="btn btn--chico btn--peligro" type="button" data-borrar="' + t.id + '">Borrar</button></div></td></tr>';
              }).join("") + "</tbody></table></div>"
            : '<p class="sub">Todavía no hay transmisiones registradas.</p>') +
          "</section>";

        cont.onclick = function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var id = Number(b.dataset.terminar || b.dataset.editar || b.dataset.borrar || b.dataset.iniciar);
          var t = lista.filter(function (x) { return x.id === id; })[0];
          if (!t) return;
          var cambiar = function (estado, mensaje) {
            api("PUT", "/transmisiones/" + t.id, { titulo: t.titulo, descripcion: t.descripcion, enlace: t.enlace, estado: estado, programada_para: t.programada_para })
              .then(function () { aviso(mensaje); cargar(); }).catch(fallo);
          };
          if (b.dataset.terminar) {
            confirmar("¿Terminar la transmisión?", "«" + t.titulo + "» dejará de aparecer como en vivo en la web.", "Terminar").then(function (si) {
              if (si) cambiar("terminada", "Transmisión terminada. Quedó en el historial.");
            });
          }
          if (b.dataset.iniciar) {
            if (activa) { aviso("Ya hay una transmisión en vivo. Termínala primero.", "error"); return; }
            cambiar("en_vivo", "La transmisión ya se muestra en la web.");
          }
          if (b.dataset.editar) formularioTransmision(t, cargar);
          if (b.dataset.borrar) {
            confirmar("¿Borrar esta transmisión?", "«" + t.titulo + "» se quitará del historial de la web.", "Borrar").then(function (si) {
              if (si) api("DELETE", "/transmisiones/" + t.id).then(function () { aviso("Transmisión borrada."); cargar(); }).catch(fallo);
            });
          }
        };
        $("#nueva-transmision").onclick = function () {
          if (activa) { aviso("Ya hay una transmisión en vivo. Termínala antes de empezar otra.", "error"); return; }
          formularioTransmision(null, cargar);
        };
      }).catch(function (e) { $("#transmisiones").innerHTML = '<div class="vacio"><strong>No se pudo cargar</strong>' + esc(e.message) + "</div>"; });
    }
    cargar();
  }

  function formularioTransmision(t, alGuardar) {
    var nueva = !t;
    t = t || { titulo: "", descripcion: "", enlace: "", estado: "en_vivo", programada_para: "" };
    abrirDialogo(
      '<form method="dialog" id="form-vivo" novalidate><h2>' + (nueva ? "Empezar transmisión" : "Editar transmisión") + "</h2>" +
      '<label class="campo"><span>Título</span><input type="text" name="titulo" maxlength="160" value="' + esc(t.titulo) + '" placeholder="Ej.: Motocaravana por las calles de Nueva Loja" required></label>' +
      '<label class="campo"><span>Enlace del video en vivo</span><input type="url" name="enlace" value="' + esc(t.enlace) + '" placeholder="https://www.facebook.com/novedadessucumbios/videos/…" required>' +
      '<small class="ayuda">En Facebook: abre la transmisión, toca «Compartir» → «Copiar enlace». Debe ser pública. También sirve un enlace de YouTube.</small></label>' +
      '<label class="campo"><span>Descripción (opcional)</span><textarea name="descripcion" rows="2" maxlength="600">' + esc(t.descripcion) + "</textarea></label>" +
      '<label class="campo"><span>Estado</span><select name="estado">' +
      Object.keys(ESTADO_VIVO).map(function (k) { return '<option value="' + k + '"' + (t.estado === k ? " selected" : "") + ">" + ESTADO_VIVO[k] + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="campo" id="campo-programada"><span>Fecha y hora (hora de Ecuador)</span><input type="datetime-local" name="programada_para" value="' + (t.programada_para ? aLocalEcuador(t.programada_para) : "") + '"></label>' +
      '<div class="dialogo-pie"><button class="btn" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">' + (nueva ? "Mostrar en la web" : "Guardar cambios") + "</button></div></form>",
      function (d) {
        var form = $("#form-vivo", d);
        var mostrarFecha = function () { $("#campo-programada", d).hidden = form.estado.value !== "programada"; };
        form.estado.addEventListener("change", mostrarFecha);
        mostrarFecha();
        form.titulo.focus();
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var cuerpo = {
            titulo: form.titulo.value.trim(), enlace: form.enlace.value.trim(), descripcion: form.descripcion.value.trim(),
            estado: form.estado.value, programada_para: form.programada_para.value ? desdeLocalEcuador(form.programada_para.value) : "",
          };
          api(nueva ? "POST" : "PUT", nueva ? "/transmisiones" : "/transmisiones/" + t.id, cuerpo).then(function () {
            dialogo.close();
            aviso(cuerpo.estado === "en_vivo" ? "Listo: la transmisión ya se muestra en la web." : "Transmisión guardada.");
            alGuardar();
          }).catch(fallo);
        });
      });
  }

  /* ================= Ajustes ================= */
  function vistaAjustes(vista) {
    vista.innerHTML = '<div class="cabeza"><div><h1>Ajustes</h1><p>Datos que se muestran en la web.</p></div></div><div class="tarjeta" id="ajustes" style="max-width:560px"><p class="cargando">Cargando…</p></div>';
    api("GET", "/ajustes").then(function (a) {
      $("#ajustes").innerHTML =
        '<form id="form-ajustes" class="pila" novalidate>' +
        '<label class="campo"><span>WhatsApp para anunciantes</span><input type="tel" name="whatsapp" value="' + esc(a.whatsapp) + '" placeholder="593991234567" inputmode="numeric">' +
        '<small class="ayuda">Número con código de país, sin + ni espacios. Si lo llenas, aparece el botón «Escribir por WhatsApp» en la sección para anunciantes.</small></label>' +
        '<label class="campo"><span>Seguidores en Facebook</span><input type="text" name="seguidores" maxlength="12" value="' + esc(a.seguidores) + '" placeholder="763K">' +
        '<small class="ayuda">Así se muestra en la portada, por ejemplo «763K».</small></label>' +
        '<div><button class="btn btn--principal" type="submit">Guardar ajustes</button></div></form>';
      $("#form-ajustes").addEventListener("submit", function (e) {
        e.preventDefault();
        var wa = this.whatsapp.value.replace(/[^\d]/g, "");
        if (wa && wa.length < 9) { aviso("El número de WhatsApp parece incompleto. Incluye el código de país, por ejemplo 593.", "error"); return; }
        api("PUT", "/ajustes", { whatsapp: wa, seguidores: this.seguidores.value.trim() }).then(function () { aviso("Ajustes guardados."); }).catch(fallo);
      });
    }).catch(function (e) { $("#ajustes").innerHTML = '<div class="vacio"><strong>No se pudieron cargar los ajustes</strong>' + esc(e.message) + "</div>"; });
  }

  /* ================= Mi cuenta ================= */
  function vistaCuenta(vista) {
    vista.innerHTML =
      '<div class="cabeza"><div><h1>Mi cuenta</h1><p>' + esc(usuario.nombre) + " · usuario «" + esc(usuario.usuario) + "» · " + (usuario.rol === "admin" ? "Administrador" : "Editor") + "</p></div></div>" +
      '<section class="tarjeta" style="max-width:480px"><h2>Cambiar contraseña</h2>' +
      '<form id="form-clave" class="pila" novalidate>' +
      '<label class="campo"><span>Contraseña actual</span><input type="password" name="actual" autocomplete="current-password" required></label>' +
      '<label class="campo"><span>Nueva contraseña</span><input type="password" name="nueva" autocomplete="new-password" minlength="10" required><small class="ayuda">Mínimo 10 caracteres. Una frase corta es fácil de recordar y segura.</small></label>' +
      '<label class="campo"><span>Repite la nueva contraseña</span><input type="password" name="repetir" autocomplete="new-password" required></label>' +
      '<div><button class="btn btn--principal" type="submit">Cambiar contraseña</button></div></form></section>';
    $("#form-clave").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = this;
      if (f.nueva.value.length < 10) { aviso("La nueva contraseña debe tener al menos 10 caracteres.", "error"); return; }
      if (f.nueva.value !== f.repetir.value) { aviso("Las dos contraseñas nuevas no coinciden.", "error"); return; }
      api("PUT", "/yo/clave", { actual: f.actual.value, nueva: f.nueva.value }).then(function () {
        aviso("Contraseña cambiada.");
        f.reset();
      }).catch(fallo);
    });
  }

  /* ================= Inicio ================= */
  fetch("/api/yo", { credentials: "same-origin" }).then(function (r) {
    if (!r.ok) throw new Error("sin sesión");
    return r.json();
  }).then(function (u) {
    usuario = u;
    if (!location.hash || location.hash === "#/") history.replaceState(null, "", inicioSegunRol());
    montarMarco();
  }).catch(function () {
    mostrarIngreso();
  });
})();
