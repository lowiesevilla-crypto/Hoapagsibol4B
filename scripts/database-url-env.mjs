const url = new URL(process.env.DATABASE_URL || "");
if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use the mysql:// protocol.");

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

const values = {
  DB_HOST: url.hostname,
  DB_PORT: url.port || "3306",
  DB_USER: decodeURIComponent(url.username),
  DB_PASSWORD: decodeURIComponent(url.password),
  DB_NAME: decodeURIComponent(url.pathname.replace(/^\//, "")),
};
for (const [key, value] of Object.entries(values)) console.log(`${key}=${shellQuote(value)}`);
