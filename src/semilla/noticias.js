/* =========================================================================
   NOTICIAS — Novedades Sucumbíos
   -------------------------------------------------------------------------
   La primera noticia de la lista es la principal (sale en la portada).
   Campos:
     titulo     (obligatorio)
     resumen    (2 o 3 líneas)
     canton     Lago Agrio, Shushufindi, Cascales, Gonzalo Pizarro, Putumayo,
                Sucumbíos (Cuyabeno), Provincia...
     fecha      "2026-11-15T08:30"
     imagen     ruta o enlace de la foto (opcional)
     enlace     enlace a la publicación de Facebook (opcional)
     video      true si la publicación es un video o transmisión
     urgente    true para que salga en la barra de "Última hora"

   ⚠ Las noticias de abajo son EJEMPLOS para ver el diseño. Reemplázalas.
   ========================================================================= */

window.NOTICIAS = [
  {
    titulo: "Amanece con lluvias fuertes en Nueva Loja: así están las vías hacia Shushufindi",
    resumen: "Conductores reportan tramos con agua en la vía Lago Agrio – Shushufindi. Recomiendan salir con tiempo y bajar la velocidad en las curvas cercanas al río.",
    canton: "Lago Agrio",
    fecha: "2026-11-15T07:40",
    imagen: "assets/portada.jpg",
    enlace: "https://www.facebook.com/novedadessucumbios",
    urgente: true
  },
  {
    titulo: "Motocaravana recorre las principales calles de Nueva Loja",
    resumen: "Cientos de motociclistas se concentraron en el parque central. Revive la transmisión completa en nuestra página.",
    canton: "Lago Agrio",
    fecha: "2026-11-14T14:52",
    enlace: "https://www.facebook.com/novedadessucumbios/live_videos",
    video: true
  },
  {
    titulo: "Mercado municipal amplía su horario los fines de semana",
    resumen: "Los comerciantes atenderán desde las 05:00 los sábados y domingos para recibir a productores de las parroquias.",
    canton: "Shushufindi",
    fecha: "2026-11-14T11:15"
  },
  {
    titulo: "Corte de energía programado para el martes en sectores de Cascales",
    resumen: "La distribuidora eléctrica anunció trabajos de mantenimiento entre las 08:00 y las 14:00.",
    canton: "Cascales",
    fecha: "2026-11-14T09:30",
    urgente: true
  },
  {
    titulo: "Estudiantes de Putumayo ganan feria provincial de ciencias",
    resumen: "El proyecto sobre purificación de agua con materiales de la zona representará a Sucumbíos a nivel nacional.",
    canton: "Putumayo",
    fecha: "2026-11-13T18:20"
  },
  {
    titulo: "Reabren el puente sobre el río Aguarico tras los trabajos de reparación",
    resumen: "El paso vehicular quedó habilitado desde la mañana de este viernes, con control de peso para camiones.",
    canton: "Gonzalo Pizarro",
    fecha: "2026-11-13T10:05",
    urgente: true
  },
  {
    titulo: "Campeonato barrial: la final se juega este domingo en el estadio",
    resumen: "Los equipos de la cooperativa 18 de Noviembre y del barrio Las Américas definen al campeón. Habrá transmisión en vivo.",
    canton: "Lago Agrio",
    fecha: "2026-11-12T20:40",
    video: true
  },
  {
    titulo: "Comunidades de Cuyabeno reciben brigada médica gratuita",
    resumen: "Médicos y odontólogos atendieron a más de 300 personas durante dos días de jornada.",
    canton: "Cuyabeno",
    fecha: "2026-11-12T16:00"
  },
  {
    titulo: "Precio del cacao sube y productores esperan una mejor cosecha",
    resumen: "Agricultores de la provincia cuentan cómo se preparan para la temporada y qué necesitan para vender mejor.",
    canton: "Provincia",
    fecha: "2026-11-11T12:30"
  }
];
