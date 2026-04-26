// src/lib/db/index.ts - HANYA db
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as DBschema from "./schema.ts";

let _db: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!_db) {
    const client = createClient({
      url: Deno.env.get("DATABASE_URL") as string,
      authToken: Deno.env.get("DATABASE_AUTH_TOKEN") as string,
    });
    _db = drizzle(client, { schema: DBschema });
  }
  return _db;
}

export const db = getDb();
