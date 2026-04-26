import { buildSchema } from "drizzle-graphql";
import { createYoga } from "graphql-yoga";
import { getDb } from "#server/lib/db/index.ts"; // Use getDb()

let _yogaInstance: ReturnType<typeof createYoga> | undefined;

export function getYogaInstance() {
  if (!_yogaInstance) {
    const { schema } = buildSchema(getDb()); // Use getDb() here
    _yogaInstance = createYoga({
      schema,
      graphqlEndpoint: "/api/graphql",
      landingPage: true,
    });
  }
  return _yogaInstance;
}

export const yoga = getYogaInstance();
