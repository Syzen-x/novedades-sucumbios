import express from "express";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config.js";
import { sesion } from "./auth.js";
import { api } from "./api.js";
import { paginas } from "./paginas.js";

const app = express();
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "media-src": ["'self'", "blob:", "https:"],
      "frame-src": ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://www.facebook.com", "https:"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": config.produccion ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
}));
app.use(compression());
app.use(sesion);

// Archivos
const largo = { maxAge: "30d" };
app.use("/subidas", express.static(config.subidas, { maxAge: "365d", immutable: true, index: false }));
app.use("/panel", express.static(config.panel, { index: "index.html", maxAge: 0 }));
app.use(express.static(config.publico, { index: false, ...largo }));

app.use("/api", api);
app.use(paginas);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send("Ocurrió un error en el servidor. Intenta de nuevo en unos minutos.");
});

app.listen(config.puerto, () => {
  console.log(`Novedades Sucumbíos en ${config.sitio} (puerto ${config.puerto})`);
});

export default app;
