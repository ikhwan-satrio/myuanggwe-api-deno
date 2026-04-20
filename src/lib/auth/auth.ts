import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db.ts";
import { organization, username } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import * as schema from "#server/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  trustedOrigins: [
    "http://localhost:5173",
    "https://myuanggwe.vercel.app",
  ],
  appName: "myuanggwe",
  plugins: [organization(), username()],
  secret: process.env.BETTER_AUTH_SECRET!,
  emailAndPassword: {
    enabled: true,
  },
});
