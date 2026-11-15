export const config = {
  nombre: "Novedades Sucumbíos",
  descripcion: "Noticias de Nueva Loja, Lago Agrio, Shushufindi, Cascales, Putumayo, Cuyabeno y toda la provincia de Sucumbíos.",
  facebook: "https://www.facebook.com/novedadessucumbios",
  telegram: "https://t.me/novedadessucumbios",
  tiktok: "https://www.tiktok.com/@novedadesucumbio",
  correo: "sucumbiosaldia1@gmail.com",
  seguidores: "763K",
  cantones: ["Lago Agrio", "Shushufindi", "Cascales", "Gonzalo Pizarro", "Putumayo", "Sucumbíos", "Cuyabeno", "Provincia"],
};

/** Dirección pública del sitio: la variable SITIO_URL o, en pruebas, el host de la solicitud */
export function sitio(c) {
  const url = new URL(c.req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".workers.dev")) return url.origin;
  return (c.env.SITIO_URL || url.origin).replace(/\/$/, "");
}
