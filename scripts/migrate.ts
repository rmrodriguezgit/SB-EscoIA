import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Native } from "../server/native.js";
import { config } from "../server/config.js";
const native = new Native();
const [version] = await native.call<any[]>("version");
native.close();
if (version.user_version < 2) {
  execFileSync("sqlite3", [
    config.database,
    `.backup '${config.database.replace(/'/g, "''")}.pre-v2'`,
  ]);
  execFileSync(
    config.native,
    [config.database, "--init", resolve(config.root, "db/002.sql")],
    { stdio: "inherit" },
  );
  console.log("Base migrada a versión 2.");
} else console.log("Base ya actualizada.");
