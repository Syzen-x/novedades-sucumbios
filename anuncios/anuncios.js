/* =========================================================================
   ANUNCIOS — Novedades Sucumbíos
   -------------------------------------------------------------------------
   Este es el ÚNICO archivo que hay que tocar para poner, cambiar o quitar
   anuncios. Cada "espacio" es un lugar de la web. Cada espacio puede tener
   varios anuncios: se van turnando solos.

   Tipos de anuncio que se pueden poner:
     { tipo: "imagen",  src: "anuncios/mi-banner.jpg", enlace: "https://...", texto: "Descripción" }
         (sirve para JPG, PNG, WEBP, SVG y GIF animados)
     { tipo: "video",   src: "anuncios/mi-video.mp4", poster: "anuncios/portada.jpg", enlace: "https://..." }
         (MP4 recomendado. Arranca sin sonido; el visitante puede activarlo)
     { tipo: "youtube", id: "dQw4w9WgXcQ" }
         (solo el código del video de YouTube)
     { tipo: "html",    html: "<div>...</div>" }
         (cualquier diseño propio hecho en HTML)
     { tipo: "iframe",  src: "https://..." }
         (otra página dentro del anuncio, por ejemplo un formulario)

   Opcionales para cualquier anuncio:
     desde: "2026-11-20"   → empieza a salir ese día
     hasta: "2026-12-31"   → deja de salir después de ese día
     duracion: 12          → segundos que se queda en pantalla (por defecto: "rotacion")

   Si un espacio queda vacío, se muestra solo el aviso "Anúnciate aquí".
   ========================================================================= */

window.ANUNCIOS = {
  // segundos que dura cada anuncio antes de pasar al siguiente
  rotacion: 9,

  // datos para el aviso "Anúnciate aquí"
  contacto: {
    correo: "sucumbiosaldia1@gmail.com",
    whatsapp: "" // ejemplo: "593991234567" (sin + ni espacios)
  },

  espacios: {
    /* Banner grande debajo de la portada (muy visible). Medida ideal: 1200 x 300 */
    cabecera: [
      { tipo: "imagen", src: "anuncios/demo/banner-cabecera.svg", enlace: "#anunciate", texto: "Anúnciate en Novedades Sucumbíos" },
      { tipo: "video", src: "anuncios/demo/video-demo.mp4", poster: "anuncios/demo/video-demo-poster.jpg", enlace: "#anunciate", duracion: 8 }
    ],

    /* Columna derecha, se queda fija al bajar. Medida ideal: 300 x 600 */
    lateral: [
      { tipo: "imagen", src: "anuncios/demo/banner-lateral.svg", enlace: "#anunciate", texto: "Tu negocio aquí" }
    ],

    /* Aparece en medio de la lista de noticias. Medida ideal: 800 x 200 */
    entreNoticias: [
      { tipo: "html", html: "<div class='ad-casa'><strong>¿Tienes un negocio en Sucumbíos?</strong><span>Pon tu anuncio entre las noticias más leídas de la provincia.</span><a href='#anunciate'>Ver precios</a></div>" }
    ],

    /* Franja a todo lo ancho, ideal para VIDEO. Medida ideal: 1920 x 600 (o video 16:9) */
    franja: [
      { tipo: "video", src: "anuncios/demo/video-demo.mp4", poster: "anuncios/demo/video-demo-poster.jpg", enlace: "#anunciate" }
    ],

    /* Ventanita flotante abajo a la derecha (se puede cerrar). Medida ideal: 360 x 200 o video vertical */
    flotante: [
      { tipo: "video", src: "anuncios/demo/video-demo.mp4", poster: "anuncios/demo/video-demo-poster.jpg", enlace: "#anunciate" }
    ]
  }
};
