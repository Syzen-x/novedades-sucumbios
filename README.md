# Novedades Sucumbíos — sitio web

Web de noticias de Nueva Loja y toda la provincia de Sucumbíos, con logo animado y espacios de publicidad propios.
Es una página estática: HTML, CSS y JavaScript, sin instalar nada.

## Ver la web en tu computadora

```bash
python -m http.server 5173
```

Luego abre http://localhost:5173

## Poner o cambiar anuncios

Todo se maneja en **`anuncios/anuncios.js`**. Copia tu imagen o video dentro de la carpeta `anuncios/` y agrégalo al espacio que quieras:

| Espacio          | Dónde sale                                   | Medida ideal          |
|------------------|----------------------------------------------|-----------------------|
| `cabecera`       | Banner grande debajo de la portada           | 1500 × 500 (3:1)      |
| `lateral`        | Columna derecha, fijo mientras se lee        | 300 × 600             |
| `entreNoticias`  | En medio de la lista de noticias             | 800 × 200             |
| `franja`         | A todo lo ancho, ideal para video            | 1920 × 720 (16:9)     |
| `flotante`       | Ventanita abajo a la derecha (se puede cerrar)| 360 × 200 (16:9)     |

Tipos de anuncio: `imagen` (JPG, PNG, GIF, SVG), `video` (MP4), `youtube`, `html` e `iframe`.
Si un espacio tiene varios anuncios, se turnan solos. Con `desde` y `hasta` programas las fechas en que sale cada uno.
Una imagen puede llevar `srcMovil` con otra versión para celulares.

Ejemplo:

```js
cabecera: [
  { tipo: "imagen", src: "anuncios/ferreteria.jpg", srcMovil: "anuncios/ferreteria-movil.jpg",
    enlace: "https://wa.me/593990000000", hasta: "2026-12-31" },
  { tipo: "video", src: "anuncios/promo.mp4", poster: "anuncios/promo.jpg" },
  { tipo: "youtube", id: "CODIGO_DEL_VIDEO" }
]
```

Si escribes un número en `contacto.whatsapp`, aparece el botón "Escribir por WhatsApp" en la sección para anunciantes.

## Publicar noticias

Edita **`datos/noticias.js`**. La primera noticia de la lista es la principal de la portada. Las que tienen `urgente: true` salen en la barra de "Última hora".
Las noticias que vienen ahora son ejemplos para ver el diseño.

## Estructura

```
index.html            la página
css/estilos.css       colores, letras y animaciones
js/app.js             noticias, logo animado y motor de anuncios
anuncios/anuncios.js  configuración de anuncios
anuncios/demo/        anuncios de ejemplo
datos/noticias.js     noticias
assets/               logo y foto de portada
```
