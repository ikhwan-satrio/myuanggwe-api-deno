import { Hono } from "hono";
import { cors } from "hono/cors";
import { dashboardGroup } from "#server/lib/groups/dashboard.ts";
import { walletsGroup } from "#server/lib/groups/wallets.ts";
import { transactionsGroup } from "#server/lib/groups/transactions.ts";
import { categoriesGroup } from "#server/lib/groups/categories.ts";
import { budgetsGroup } from "#server/lib/groups/budgets.ts";
import {
  processRecurringTransactions,
  recurringGroup,
} from "#server/lib/groups/recurring.ts";
import { goalsGroup } from "#server/lib/groups/goals.ts";
import { orgsGroups } from "#server/lib/groups/orgs/switch.ts";
import { manageOrgsGroup } from "#server/lib/groups/orgs/manage.ts";
import { yoga } from "#server/lib/graphql/index.ts";
import { auth } from "#server/lib/auth/auth.ts";
import { betterAuthMiddleware } from "#server/lib/middlewares/better-auth.ts";
import { userDataMiddleware } from "#server/lib/middlewares/user-data.ts";

const app = new Hono().basePath("/api");

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://myuanggwe.vercel.app",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.use("*", betterAuthMiddleware);
app.use("*", userDataMiddleware);

app.on(["POST", "GET"], "/graphql", async (c) => {
  return await yoga.fetch(c.req.raw);
});

app.get("/layout", async (c) => {
  const user = c.get("user");
  const authSession = c.get("session");
  const activeOrg = c.get("activeOrg");
  const organizations = c.get("organizations");
  if (!authSession) {
    return c.json({ user: null, activeOrg: null, organizations: [] });
  }
  await processRecurringTransactions(user!.id, activeOrg?.id);
  return c.json({ user, session: authSession, organizations, activeOrg });
});

app.get("/health", (c) => c.text("ok"));

app.route("/orgs", orgsGroups);
app.route("/dashboard", dashboardGroup);
app.route("/wallets", walletsGroup);
app.route("/transactions", transactionsGroup);
app.route("/categories", categoriesGroup);
app.route("/manage-orgs", manageOrgsGroup);
app.route("/budgets", budgetsGroup);
app.route("/recurring", recurringGroup);
app.route("/goals", goalsGroup);

Deno.serve(app.fetch);
