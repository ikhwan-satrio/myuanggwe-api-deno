import { buildSchema } from "drizzle-graphql";
import { createYoga } from "graphql-yoga";
import { db } from "#server/lib/db/index.ts";

const { schema } = buildSchema(db);

export const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  landingPage: true,
});
