import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "#server/lib/db/index.ts";
import * as schema from "#server/lib/db/schema.ts";
import { withBackendCache } from "#server/lib/redis/server.ts";
import { budgetSchema } from "#server/lib/schemas.ts";
import { invalidateUserCache } from "#server/lib/composables/invalidateRedis.ts";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

export const budgetsGroup = new Hono()
  .get("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");

    const cacheKey = activeOrg
      ? `budgets:org:${activeOrg.id}`
      : `budgets:user:${user.id}`;

    const budgetList = await withBackendCache(cacheKey, async () => {
      const budgetsData = await db.query.budgets.findMany({
        where: activeOrg
          ? eq(schema.budgets.organizationId, activeOrg.id)
          : and(
            eq(schema.budgets.userId, user.id),
            isNull(schema.budgets.organizationId),
          ),
        with: { category: true },
        orderBy: (budgets, { desc }) => [desc(budgets.createdAt)],
      });

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const budgetsWithSpending = await Promise.all(
        budgetsData.map(async (budget) => {
          const contextQuery = activeOrg
            ? eq(schema.transactions.organizationId, activeOrg.id)
            : and(
              eq(schema.transactions.userId, user.id),
              isNull(schema.transactions.organizationId),
            );

          const spending = await db
            .select({
              total: sql<
                number
              >`cast(sum(${schema.transactions.amount}) as integer)`,
            })
            .from(schema.transactions)
            .where(
              and(
                contextQuery,
                eq(schema.transactions.categoryId, budget.categoryId),
                eq(schema.transactions.type, "expense"),
                gte(schema.transactions.date, startOfMonth),
              ),
            );

          return { ...budget, currentSpending: spending[0]?.total || 0 };
        }),
      );

      return budgetsWithSpending;
    });

    return c.json({ budgetList });
  })
  .post("/create", zValidator("json", budgetSchema), async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const body = c.req.valid("json");

    try {
      await db.insert(schema.budgets).values({
        id: crypto.randomUUID(),
        amount: body.amount,
        period: body.period,
        categoryId: body.categoryId,
        userId: user.id,
        organizationId: activeOrg?.id ?? null,
      });

      await invalidateUserCache(user.id, activeOrg?.id);

      return c.json({ success: true, message: "Budget created successfully" });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: "Gagal membuat anggaran" }, 500);
    }
  })
  .put("/edit/:id", zValidator("json", budgetSchema), async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const body = c.req.valid("json");
    const { id } = c.req.param();

    try {
      const contextQuery = activeOrg
        ? eq(schema.budgets.organizationId, activeOrg.id)
        : and(
          eq(schema.budgets.userId, user.id),
          isNull(schema.budgets.organizationId),
        );

      const result = await db
        .update(schema.budgets)
        .set({
          amount: body.amount,
          period: body.period,
          categoryId: body.categoryId,
        })
        .where(and(eq(schema.budgets.id, id), contextQuery));

      if (result.rowsAffected === 0) {
        return c.json({
          success: false,
          message: "Budget not found or access denied",
        }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);

      return c.json({ success: true, message: "Budget updated successfully" });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: "Gagal update anggaran" }, 500);
    }
  })
  .delete("/erase/:id", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const { id } = c.req.param();

    try {
      const contextQuery = activeOrg
        ? eq(schema.budgets.organizationId, activeOrg.id)
        : and(
          eq(schema.budgets.userId, user.id),
          isNull(schema.budgets.organizationId),
        );

      const result = await db
        .delete(schema.budgets)
        .where(and(eq(schema.budgets.id, id), contextQuery));

      if (result.rowsAffected === 0) {
        return c.json({
          success: false,
          message: "Budget not found or access denied",
        }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);

      return c.json({ success: true, message: "Budget deleted successfully" });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: "Gagal hapus anggaran" }, 500);
    }
  });
