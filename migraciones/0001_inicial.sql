-- Estructura inicial de la base de datos de Novedades Sucumbíos (Cloudflare D1)

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','editor')),
  clave TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE sesiones (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira TEXT NOT NULL
);

CREATE TABLE noticias (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  resumen TEXT NOT NULL DEFAULT '',
  contenido TEXT NOT NULL DEFAULT '',
  canton TEXT NOT NULL DEFAULT 'Provincia',
  imagen TEXT NOT NULL DEFAULT '',
  imagen_texto TEXT NOT NULL DEFAULT '',
  video TEXT NOT NULL DEFAULT '',
  galeria TEXT NOT NULL DEFAULT '[]',
  enlace_facebook TEXT NOT NULL DEFAULT '',
  urgente INTEGER NOT NULL DEFAULT 0,
  destacada INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'publicada' CHECK (estado IN ('publicada','borrador')),
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  publicada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL,
  vistas INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX noticias_fecha ON noticias(estado, publicada_en DESC);
CREATE INDEX noticias_canton ON noticias(canton, publicada_en DESC);

CREATE TABLE anuncios (
  id INTEGER PRIMARY KEY,
  espacio TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagen','video','youtube','html','iframe')),
  nombre TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT '',
  src_movil TEXT NOT NULL DEFAULT '',
  poster TEXT NOT NULL DEFAULT '',
  enlace TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  desde TEXT NOT NULL DEFAULT '',
  hasta TEXT NOT NULL DEFAULT '',
  duracion INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL
);

-- Transmisiones en vivo (Facebook o YouTube)
CREATE TABLE transmisiones (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  enlace TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_vivo' CHECK (estado IN ('programada','en_vivo','terminada')),
  programada_para TEXT NOT NULL DEFAULT '',
  inicio TEXT NOT NULL DEFAULT '',
  fin TEXT NOT NULL DEFAULT '',
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL
);
CREATE INDEX transmisiones_estado ON transmisiones(estado, inicio DESC);

CREATE TABLE visitas (
  id INTEGER PRIMARY KEY,
  dia TEXT NOT NULL,
  ruta TEXT NOT NULL,
  noticia_id INTEGER,
  visitante TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT ''
);
CREATE INDEX visitas_dia ON visitas(dia);
CREATE INDEX visitas_noticia ON visitas(noticia_id, dia);

CREATE TABLE eventos_anuncio (
  id INTEGER PRIMARY KEY,
  dia TEXT NOT NULL,
  anuncio_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vista','clic'))
);
CREATE INDEX eventos_dia ON eventos_anuncio(dia, anuncio_id);

CREATE TABLE ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
