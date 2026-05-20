module.exports = {
  apps: [
    {
      name: "autonews-api",
      script: "./api/dist/main.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        API_PORT: 4000
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      merge_logs: true
    },
    {
      name: "autonews-web",
      script: "./web/standalone/apps/web/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0"
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/web-error.log",
      out_file: "./logs/web-out.log",
      merge_logs: true
    }
  ]
};
