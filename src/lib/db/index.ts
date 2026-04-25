// src/lib/db/index.ts - HANYA db
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as DBschema from "./schema.ts";

const client = createClient({
  url: Deno.env.get("DATABASE_URL") as string,
  authToken: Deno.env.get("DATABASE_AUTH_TOKEN") as string,
});

export const db = drizzle(client, { schema: DBschema });
