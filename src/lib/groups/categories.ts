import { and, eq, isNull } from "drizzle-orm";
import { db } from "#server/lib/db";
import * as schema from "#server/lib/db/schema";
import { withBackendCache } from "#server/lib/redis/server";
import { categorySchema } from "#server/lib/schemas";
import { invalidateUserCache } from "../composables/invalidateRedis.ts";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

export const categoriesGroup = new Hono()
  .get("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const currentSession = c.get("currentSession");
    const orgId = currentSession?.activeOrganizationId;
    const cacheKey = orgId
      ? `categories:org:${orgId}`
      : `categories:user:${user.id}`;

    const result = await withBackendCache(cacheKey, async () => {
      const categoryList = await db.query.categories.findMany({
        where: activeOrg
          ? eq(schema.categories.organizationId, activeOrg.id)
          : and(
            eq(schema.categories.userId, user.id),
            isNull(schema.categories.organizationId),
          ),
      });
      return { categoryList, activeOrg: activeOrg || null };
    });

    return c.json(result);
  })
  .post("/create", zValidator("json", categorySchema), async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const currentSession = c.get("currentSession");
    const body = c.req.valid("json");

    await db.insert(schema.categories).values({
      ...body,
      userId: user.id,
      organizationId: currentSession?.activeOrganizationId ?? null,
    });
    await invalidateUserCache(user.id, currentSession?.activeOrganizationId);
    return c.json({ message: "category created!" });
  })
  .delete("/remove/:id", async (c) => {
    const user = c.get("user");
    const currentSession = c.get("currentSession");
    const { id } = c.req.param();

    try {
      await db
        .delete(schema.categories)
        .where(
          and(
            eq(schema.categories.userId, user.id),
            eq(schema.categories.id, id),
          ),
        );
      await invalidateUserCache(user.id, currentSession?.activeOrganizationId);
      return c.json({ message: "delete category complete" });
    } catch (e) {
      return c.json({ message: (e as Error).message }, 500);
    }
  })
  .put("/edit/:id", zValidator("json", categorySchema), async (c) => {
    const user = c.get("user");
    const currentSession = c.get("currentSession");
    const body = c.req.valid("json");
    const { id } = c.req.param();

    try {
      await db
        .update(schema.categories)
        .set({ ...body })
        .where(
          and(
            eq(schema.categories.userId, user.id),
            eq(schema.categories.id, id),
          ),
        );
      await invalidateUserCache(user.id, currentSession?.activeOrganizationId);
      return c.json({ message: "category update" });
    } catch (e) {
      return c.json({ message: "cannot update category" }, 500);
    }
  });
