# Novedades Sucumbíos — sitio web y panel

Web de noticias de Nueva Loja y toda la provincia de Sucumbíos, con panel para publicar noticias,
transmisiones en vivo, publicidad y estadísticas. Funciona en **Cloudflare**:

| Pieza | Servicio de Cloudflare |
|---|---|
| Servidor (páginas, panel, API) | Workers (`src/`) con Hono |
| Base de datos | D1 (SQLite), estructura en `migraciones/` |
| Fotos y videos | R2 (bucket `novedades-sucumbios-media`) |
| Archivos fijos (CSS, JS, logo, panel) | Static Assets (`public/`) |

## Panel

`https://novedadessucumbios.com/panel/`

- **admin:** resumen con estadísticas, noticias, en vivo, anuncios, usuarios y ajustes.
- **editor:** noticias, en vivo y su cuenta.

### Transmisiones en vivo

1. Empieza la transmisión en Facebook (o YouTube) como siempre. Debe ser pública.
2. En el panel → **En vivo** → **Empezar transmisión**, y pega el enlace del video.
3. La web muestra al instante una barra roja en todas las páginas, el reproductor en la portada y la página `/en-vivo`.
4. Al terminar, pulsa **Terminar transmisión**: queda en "Transmisiones anteriores".

## Comandos

```bash
npm install
npm run db:local                   # crea la base local de pruebas
npm run dev                        # web en http://localhost:8787
npm run desplegar                  # publica en Cloudflare
npm run db:remoto                  # aplica migraciones nuevas en Cloudflare
```

Para probar en local hace falta un archivo `.dev.vars` con `SECRETO=<texto largo al azar>`.
En Cloudflare el secreto se configura una vez con `npx wrangler secret put SECRETO`.

### Usuarios

```bash
npm run usuario -- crear juan admin "Juan Pérez" --remoto
npm run usuario -- crear maria editor "María López" --remoto
npm run usuario -- clave juan --remoto        # cambiar contraseña
npm run usuario -- lista --remoto
```

Sin `--remoto` trabaja con la base local. También se pueden crear usuarios desde el panel (sección Usuarios).

## Espacios de publicidad

| Espacio          | Dónde sale                                         | Medida recomendada |
|------------------|----------------------------------------------------|--------------------|
| Banner principal | Debajo de la portada y al final de cada noticia    | 1500 × 500 (3:1)   |
| Lateral fijo     | Columna derecha, visible mientras se lee           | 600 × 1200 (1:2)   |
| Entre noticias   | En la lista de noticias y dentro de cada nota      | 1500 × 500 (3:1)   |
| Franja de video  | A todo lo ancho, en la portada                     | 1920 × 1080 (16:9) |
| Flotante         | Ventanita abajo a la derecha (se puede cerrar)     | 1280 × 720 (16:9)  |

Si un anuncio no tiene la medida exacta, se muestra completo y el espacio que sobra se rellena con la misma imagen difuminada.

## Archivos

- **Fotos:** se optimizan en el navegador antes de subirse (máximo 2000 px, formato WEBP).
- **Videos:** hasta 1 GB. Los de más de 90 MB se suben por partes. Para videos muy largos conviene YouTube.

## SEO

- **Cada noticia:** título, descripción, enlace canónico, Open Graph y Twitter, y datos estructurados `NewsArticle`.
- **Transmisión en vivo:** datos `BroadcastEvent`.
- **Para buscadores:** `sitemap.xml` (con imágenes), `sitemap-noticias.xml` para Google News, `rss.xml` y `robots.txt`.
- **Al publicar:** registra el sitio en Google Search Console y envía `https://novedadessucumbios.com/sitemap.xml`.
