import { betterAuth } from "#server/lib/middlewares/better-auth";
import { userData } from "#server/lib/middlewares/user-data";
import { Elysia } from "elysia";

export const createServer = (props?: ConstructorParameters<typeof Elysia>[0]) =>
  new Elysia(props).use(betterAuth).use(userData);
