import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.ts";
import { organization, username } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import * as schema from "#server/lib/db/schema.ts";

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
  secret: Deno.env.get("BETTER_AUTH_SECRET")!,
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",   // ✅ Cross-domain
      secure: true,        // ✅ HTTPS
      partitioned: true    // ✅ CHIPS - standar browser baru
    }
  }
});
