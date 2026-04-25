import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { buildSchema } from "drizzle-graphql";
import { createYoga } from "graphql-yoga";
import { auth } from "../auth/auth.ts";
import * as DBschema from "./schema.ts";

const client = createClient({
  url: Deno.env.get("DATABASE_URL") as string,
  authToken: Deno.env.get("DATABASE_AUTH_TOKEN") as string,
});

export const db = drizzle(client, { schema: DBschema });

const { schema } = buildSchema(db);
export const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return {
      user: session?.user ?? null,
      session: session?.session ?? null,
    };
  },
  graphqlEndpoint: "/api/graphql",
  landingPage: true,
});
