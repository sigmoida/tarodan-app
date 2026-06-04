/**
 * Tarodan PM2 Ecosystem
 *
 * Profesyonel dev ortamı: backend + web aynı anda daemon olarak çalışır.
 * Docker compose (postgres, redis, elasticsearch, kibana, mailhog) ayrı yönetilir.
 *
 * Kullanım:
 *   pm2 start ecosystem.config.js          # her şeyi başlat
 *   pm2 logs                                # canlı log
 *   pm2 logs api                            # sadece backend
 *   pm2 logs web                            # sadece web
 *   pm2 status                              # durum tablosu
 *   pm2 restart api                         # backend yeniden başlat
 *   pm2 stop all                            # hepsini durdur
 *   pm2 delete all                          # ecosystem'i kapat
 *
 * Sıfırdan ortam (sunum gecesi):
 *   docker compose -f infrastructure/docker-compose.yml up -d
 *   pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'api',
      cwd: __dirname + '/apps/api',
      script: 'pnpm',
      args: 'dev',
      // pnpm bir bash script — interpreter olarak shell kullanılmalı
      interpreter: 'none',
      // Watch mode'u Nest yapıyor; PM2 kendisi izlemesin
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 10000,
      env: {
        NODE_ENV: 'development',
      },
      // Output dosyaları — pm2 logs api ile okunur
      out_file: __dirname + '/logs/api.out.log',
      error_file: __dirname + '/logs/api.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'web',
      cwd: __dirname + '/apps/web',
      script: 'pnpm',
      args: 'dev',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 10000,
      env: {
        NODE_ENV: 'development',
      },
      out_file: __dirname + '/logs/web.out.log',
      error_file: __dirname + '/logs/web.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'admin',
      cwd: __dirname + '/apps/admin',
      script: 'pnpm',
      args: 'dev',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 10000,
      env: {
        NODE_ENV: 'development',
      },
      out_file: __dirname + '/logs/admin.out.log',
      error_file: __dirname + '/logs/admin.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
