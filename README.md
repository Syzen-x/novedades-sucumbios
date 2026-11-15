# Novedades Sucumbíos — sitio web y panel

Web de noticias de Nueva Loja y toda la provincia de Sucumbíos, con panel para publicar noticias,
manejar la publicidad y ver estadísticas.

- **Servidor:** Node.js 22+ con Express. Las páginas se arman en el servidor, así Google y Facebook ven cada noticia completa.
- **Base de datos:** SQLite, en un solo archivo dentro de `data/`.
- **Fotos y videos:** se guardan en `data/subidas/`. Las fotos se optimizan solas a WEBP.
- **Panel:** en `/panel/`, con dos tipos de usuario:
  - **admin:** todo (noticias, anuncios, estadísticas, usuarios y ajustes).
  - **editor:** solo publica, edita y borra noticias.

## Probar en tu computadora

```bash
npm install
npm run usuario -- crear admin admin "Administrador"
npm run dev
```

Abre http://localhost:3000 (web) y http://localhost:3000/panel/ (panel).

## Instalar en el VPS (Docker)

1. Apunta el dominio (registro A) a la IP del VPS.
2. En el VPS, con Docker instalado:

```bash
git clone https://github.com/Syzen-x/novedades-sucumbios.git
cd novedades-sucumbios
cp .env.example .env    # y completa DOMINIO y SITIO_URL
docker compose up -d --build
docker compose exec web node src/cli-usuario.js crear admin admin "Administrador"
docker compose exec web node src/cli-usuario.js crear editor editor "Editor"
```

Caddy saca el certificado HTTPS solo. Si el VPS ya usa los puertos 80 y 443 con otro programa (por ejemplo Nginx),
quita el servicio `caddy` de `docker-compose.yml`, publica el puerto de `web` (`ports: ["127.0.0.1:3000:3000"]`)
y apunta tu Nginx a `http://127.0.0.1:3000`, con `client_max_body_size 320m;`.

### Actualizar

```bash
git pull && docker compose up -d --build
```

### Copias de seguridad

Todo lo que cambia (base de datos, fotos y videos) está en la carpeta `data/`. Copiarla es la copia de seguridad completa:

```bash
tar czf respaldo-$(date +%F).tgz data
```

### Usuarios desde la terminal

```bash
docker compose exec web node src/cli-usuario.js lista
docker compose exec web node src/cli-usuario.js clave admin      # cambiar contraseña
```

## Espacios de publicidad

| Espacio          | Dónde sale                                         | Medida recomendada |
|------------------|----------------------------------------------------|--------------------|
| Banner principal | Debajo de la portada y al final de cada noticia    | 1500 × 500 (3:1)   |
| Lateral fijo     | Columna derecha, visible mientras se lee           | 600 × 1200 (1:2)   |
| Entre noticias   | En la lista de noticias y dentro de cada nota      | 1500 × 500 (3:1)   |
| Franja de video  | A todo lo ancho, en la portada                     | 1920 × 1080 (16:9) |
| Flotante         | Ventanita abajo a la derecha (se puede cerrar)     | 1280 × 720 (16:9)  |

Si un anuncio no tiene la medida exacta, se muestra completo y el espacio que sobra se rellena con la misma imagen difuminada.

## SEO

- **Cada noticia:** título, descripción, enlace canónico, Open Graph y Twitter. Lleva una imagen de 1200 × 630 hecha a partir de la foto, para que se vea bien al compartirla en Facebook y WhatsApp, y datos estructurados `NewsArticle`.
- **Para buscadores:** `sitemap.xml` (con imágenes), `sitemap-noticias.xml` para Google News, `rss.xml` y `robots.txt`.
- **Al publicar:** registra el sitio en Google Search Console y envía `https://TU-DOMINIO/sitemap.xml`.
