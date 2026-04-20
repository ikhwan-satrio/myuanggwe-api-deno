import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "#server/lib/db";
import * as schema from "#server/lib/db/schema";
import { withBackendCache } from "#server/lib/redis/server";
import { Hono } from "hono";

export const dashboardGroup = new Hono()
  .get("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const userId = user.id;
    const orgId = activeOrg?.id;
    const cacheKey = orgId
      ? `dashboard:org:${orgId}`
      : `dashboard:user:${userId}`;

    try {
      const dashboardData = await withBackendCache(cacheKey, async () => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const contextQuery = activeOrg
          ? eq(schema.transactions.organizationId, activeOrg.id)
          : and(
            eq(schema.transactions.userId, userId),
            isNull(schema.transactions.organizationId),
          );

        const walletContextQuery = activeOrg
          ? eq(schema.wallets.organizationId, activeOrg.id)
          : and(
            eq(schema.wallets.userId, userId),
            isNull(schema.wallets.organizationId),
          );

        const [userWallets, stats, recentTransactions] = await Promise.all([
          db.query.wallets.findMany({
            where: walletContextQuery,
            orderBy: [desc(schema.wallets.createdAt)],
          }),
          db
            .select({
              type: schema.transactions.type,
              total: sql<
                number
              >`cast(sum(${schema.transactions.amount}) as integer)`,
            })
            .from(schema.transactions)
            .where(
              and(contextQuery, gte(schema.transactions.date, startOfMonth)),
            )
            .groupBy(schema.transactions.type),
          db.query.transactions.findMany({
            where: contextQuery,
            with: { category: true, wallet: true, toWallet: true },
            orderBy: [desc(schema.transactions.date)],
            limit: 5,
          }),
        ]);

        return { userWallets, stats, recentTransactions };
      });

      const totalBalance = dashboardData.userWallets.reduce(
        (acc, curr) => acc + curr.balance,
        0,
      );
      const monthlyIncome = dashboardData.stats.find((s) =>
        s.type === "income"
      )?.total || 0;
      const monthlyExpense = dashboardData.stats.find((s) =>
        s.type === "expense"
      )?.total || 0;

      return c.json({
        walletList: dashboardData.userWallets,
        totalBalance,
        walletCount: dashboardData.userWallets.length,
        monthlyIncome,
        monthlyExpense,
        recentTransactions: dashboardData.recentTransactions,
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      return c.json({
        walletList: [],
        totalBalance: 0,
        walletCount: 0,
        monthlyIncome: 0,
        monthlyExpense: 0,
        recentTransactions: [],
      });
    }
  });
