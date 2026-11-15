import { Hono } from "hono";
import { sesion } from "./auth.js";
import { api } from "./api.js";
import { paginas, noEncontrada } from "./paginas.js";

const app = new Hono();

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "frame-src https:",
  "connect-src 'self' https://cloudflareinsights.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  if ((c.res.headers.get("content-type") || "").includes("text/html")) {
    c.header("Content-Security-Policy", CSP);
    c.header("X-Frame-Options", "SAMEORIGIN");
  }
});

// www → dominio principal
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.use("*", sesion);
app.route("/api", api);
app.route("/", paginas);

app.notFound((c) => noEncontrada(c));
app.onError((err, c) => {
  console.error(err);
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Ocurrió un error en el servidor. Intenta de nuevo." }, 500);
  return c.text("Ocurrió un error en el servidor. Intenta de nuevo en unos minutos.", 500);
});

export default app;
