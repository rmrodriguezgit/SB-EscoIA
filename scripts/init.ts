import { execFileSync } from "node:child_process";
import { mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../server/config.js";
import { Native } from "../server/native.js";
const encoded = "";
if (existsSync(config.database)&&!process.argv.includes("--bootstrap"))
  throw Error("La base ya existe; ejecuta migrate.ts");
await mkdir(resolve(config.root, "data"), { recursive: true });
if(!existsSync(config.database)){
execFileSync(
  config.native,
  [config.database, "--init", resolve(config.root, "db/schema.sql")],
  { stdio: "inherit" },
);
execFileSync(
  config.native,
  [config.database, "--init", resolve(config.root, "db/002.sql")],
  { stdio: "inherit" },
);
}
const native = new Native();
try {
  await native.call("user", ["admin", "local", encoded]);
} finally {
  native.close();
}
await chmod(config.database, 0o600);
console.log("Contexto local preparado.");
