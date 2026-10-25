# senorbakBolsa

App web instalable (PWA) de bolsa y bitcoin: precios en directo, gráficas, tu cartera en euros, señales de compra y venta con su fiabilidad histórica, noticias con su tono, calendario, simulador, comparativa de brókers y avisos al móvil con ntfy.

- `index.html`, `style.css`, `src/`: la app.
- `config.js`: dirección de tu servidor de Cloudflare.
- `worker/worker.js`: el servidor (pegar en Cloudflare Workers, con un KV enlazado como `STATE` y un cron `*/2 * * * *`).

No es asesoramiento financiero.
