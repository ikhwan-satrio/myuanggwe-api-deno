import { schema } from "#server/lib/db/index.ts";
import { createHandler } from "graphql-http";

export const graphqlHandler = createHandler({
  schema,
});
