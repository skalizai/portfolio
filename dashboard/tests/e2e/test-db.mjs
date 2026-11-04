// A throwaway in-memory Postgres for browser tests, so they never touch the real database.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
for (const dir of readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  await db.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
}

const server = new PGLiteSocketServer({ db, port: 5544, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log("test database ready");
