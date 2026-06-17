import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";
import nextEnv from "@next/env";
import ws from "ws";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: databaseUrl,
});

const migrationsDir = path.join(process.cwd(), "db", "migrations");

try {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const existing = await pool.query(
      "select filename from schema_migrations where filename = $1",
      [filename],
    );

    if (existing.rows.length > 0) {
      console.log(`Skipping ${filename}`);
      continue;
    }

    const filePath = path.join(migrationsDir, filename);
    const migrationSql = (await readFile(filePath, "utf8")).trim();

    if (!migrationSql) {
      throw new Error(`${filename} is empty`);
    }

    console.log(`Applying ${filename}`);

    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(migrationSql);
      await client.query(
        "insert into schema_migrations (filename) values ($1)",
        [filename],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
