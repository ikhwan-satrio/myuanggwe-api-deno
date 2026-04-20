import { and, eq, isNull } from "drizzle-orm";
import { db } from "#server/lib/db";
import * as schema from "#server/lib/db/schema";
import { withBackendCache } from "#server/lib/redis/server";
import { walletSchema } from "#server/lib/schemas";
import { invalidateUserCache } from "../composables/invalidateRedis.ts";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

export const walletsGroup = new Hono()
  .get("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const cacheKey = activeOrg
      ? `wallets:org:${activeOrg.id}`
      : `wallets:user:${user.id}`;

    const walletList = await withBackendCache(cacheKey, async () => {
      return await db.query.wallets.findMany({
        where: activeOrg
          ? eq(schema.wallets.organizationId, activeOrg.id)
          : and(
            eq(schema.wallets.userId, user.id),
            isNull(schema.wallets.organizationId),
          ),
        orderBy: (wallets, { desc }) => [desc(wallets.createdAt)],
      });
    });

    return c.json({ walletList });
  })
  .post("/create", zValidator("json", walletSchema), async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const body = c.req.valid("json");

    try {
      await db.insert(schema.wallets).values({
        id: crypto.randomUUID(),
        name: body.name,
        type: body.type,
        balance: body.balance,
        userId: user.id,
        organizationId: activeOrg?.id ?? null,
      });
      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ message: "wallets created" });
    } catch (e) {
      console.error(e);
      return c.json({ message: "Gagal membuat dompet" }, 500);
    }
  })
  .put("/edit/:id", zValidator("json", walletSchema), async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const body = c.req.valid("json");
    const { id } = c.req.param();

    try {
      const walletContextQuery = activeOrg
        ? eq(schema.wallets.organizationId, activeOrg.id)
        : and(
          eq(schema.wallets.userId, user.id),
          isNull(schema.wallets.organizationId),
        );

      const result = await db
        .update(schema.wallets)
        .set({ name: body.name, type: body.type, balance: body.balance })
        .where(and(eq(schema.wallets.id, id), walletContextQuery));

      if (result.rowsAffected === 0) {
        return c.json({
          success: false,
          message: "Wallet not found or access denied",
        }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ message: "wallets updated" });
    } catch (e) {
      console.error(e);
      return c.json({ message: "Gagal update dompet" }, 500);
    }
  })
  .delete("/erase/:id", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const { id } = c.req.param();

    try {
      const walletContextQuery = activeOrg
        ? eq(schema.wallets.organizationId, activeOrg.id)
        : and(
          eq(schema.wallets.userId, user.id),
          isNull(schema.wallets.organizationId),
        );

      const result = await db
        .delete(schema.wallets)
        .where(and(eq(schema.wallets.id, id), walletContextQuery));

      if (result.rowsAffected === 0) {
        return c.json({
          success: false,
          message: "Wallet not found or access denied",
        }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ message: "wallets deleted" });
    } catch (e) {
      console.error(e);
      return c.json({ message: "Gagal hapus dompet" }, 500);
    }
  });
