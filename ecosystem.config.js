// pm2 — arranque de Señal en la Raspberry Pi
// Uso: pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'senal',
      script: 'apps/api/dist/main.js',
      cwd: __dirname,
      // techo de memoria para el heap de Node (la extracción con jsdom es lo pesado)
      node_args: '--max-old-space-size=512',
      // reinicio si algo se descontrola
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
      },
      // las variables (OLLAMA_BASE_URL, etc.) se leen del .env de la raíz
      // vía @nestjs/config — no hace falta duplicarlas aquí
      out_file: './data/pm2-out.log',
      error_file: './data/pm2-error.log',
      time: true,
    },
  ],
};
