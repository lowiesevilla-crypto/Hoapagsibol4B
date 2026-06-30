module.exports = {
  apps: [{
    name: "hoahub",
    cwd: __dirname,
    script: "node_modules/next/dist/bin/next",
    args: `start -p ${process.env.PORT || 3000}`,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "750M",
    env: { NODE_ENV: "production" },
  }],
};
