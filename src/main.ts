import { Hono } from "hono";
import { cors } from "hono/cors";
import { dashboardGroup } from "#server/lib/groups/dashboard";
import { walletsGroup } from "#server/lib/groups/wallets";
import { transactionsGroup } from "#server/lib/groups/transactions";
import { categoriesGroup } from "#server/lib/groups/categories";
import { budgetsGroup } from "#server/lib/groups/budgets";
import {
  processRecurringTransactions,
  recurringGroup,
} from "#server/lib/groups/recurring";
import { goalsGroup } from "#server/lib/groups/goals";
import { orgsGroups } from "#server/lib/groups/orgs/switch";
import { manageOrgsGroup } from "#server/lib/groups/orgs/manage";
import { auth } from "#server/lib/auth/auth";
import { betterAuthMiddleware } from "#server/lib/middlewares/better-auth";
import { userDataMiddleware } from "#server/lib/middlewares/user-data";

const app = new Hono().basePath("/api")
  .use(
    "*",
    cors({
      origin: [
        "http://localhost:5173",
        "https://myuanggwe.vercel.app",
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )
  // auth handler harus sebelum middleware lain
  .on(["POST", "GET"], "/auth/*", (c) => {
    return auth.handler(c.req.raw);
  })
  .use("*", betterAuthMiddleware)
  .use("*", userDataMiddleware)
  // layout route
  .get("/layout", async (c) => {
    const user = c.get("user");
    const authSession = c.get("session");
    const activeOrg = c.get("activeOrg");
    const organizations = c.get("organizations");

    if (!authSession) {
      return c.json({ user: null, activeOrg: null, organizations: [] });
    }

    await processRecurringTransactions(user.id, activeOrg?.id);
    return c.json({ user, session: authSession, organizations, activeOrg });
  })
  // health
  .get("/health", (c) => {
    return c.text("ok");
  })
  // route groups — pakai .route() bukan .use()
  .route("/orgs", orgsGroups)
  .route("/dashboard", dashboardGroup)
  .route("/wallets", walletsGroup)
  .route("/transactions", transactionsGroup)
  .route("/categories", categoriesGroup)
  .route("/manage-orgs", manageOrgsGroup)
  .route("/budgets", budgetsGroup)
  .route("/recurring", recurringGroup)
  .route("/goals", goalsGroup);

Deno.serve(app.fetch);
