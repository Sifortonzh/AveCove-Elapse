import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
const sql = await readFile(new URL("../db/init.sql", import.meta.url), "utf8");
await pool.query(sql);
await pool.end();
console.log("Database schema is ready.");
