import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Native } from "../server/native.js";
import { config } from "../server/config.js";
const native = new Native();
const [version] = await native.call<any[]>("version");
native.close();
const steps: [number, string][] = [[2, "db/002.sql"], [3, "db/003.sql"]];
let current = Number(version.user_version);
for (const [target, file] of steps) {
  if (current >= target) continue;
  execFileSync("sqlite3", [
    config.database,
    `.backup '${config.database.replace(/'/g, "''")}.pre-v${target}'`,
  ]);
  execFileSync(config.native, [config.database, "--init", resolve(config.root, file)], { stdio: "inherit" });
  current = target;
  console.log(`Base migrada a versión ${target}.`);
}
if (current === Number(version.user_version)) console.log("Base ya actualizada.");
