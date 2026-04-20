import { and, eq } from "drizzle-orm";
import { db } from "#server/lib/db";
import * as schema from "#server/lib/db/schema";
import { invalidateUserCache } from "#server/lib/composables/invalidateRedis";
import { auth } from "#server/lib/auth/auth";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const manageOrgsGroup = new Hono()
  .get("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");

    if (!activeOrg) return c.json({ org: null, members: [] });

    const members = await db.query.member.findMany({
      where: eq(schema.member.organizationId, activeOrg.id),
      with: { user: true },
    });

    const currentUserMember = members.find((m) => m.userId === user.id);
    return c.json({
      org: activeOrg,
      members,
      currentUserRole: currentUserMember?.role || "member",
    });
  })
  .delete("/members/:id", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");
    const { id } = c.req.param();

    if (!activeOrg) return c.json({ message: "No active org" }, 400);

    const requester = await db.query.member.findFirst({
      where: and(
        eq(schema.member.organizationId, activeOrg.id),
        eq(schema.member.userId, user.id),
      ),
    });
    if (requester?.role !== "owner") {
      return c.json({ message: "Forbidden" }, 403);
    }

    await db.delete(schema.member).where(eq(schema.member.id, id));
    await invalidateUserCache(user.id, activeOrg.id);
    return c.json({ message: "Member removed" });
  })
  .put(
    "/members/:id/role",
    zValidator("json", z.object({ role: z.string() })),
    async (c) => {
      const user = c.get("user");
      const activeOrg = c.get("activeOrg");
      const { id } = c.req.param();
      const { role } = c.req.valid("json");

      if (!activeOrg) return c.json({ message: "No active org" }, 400);

      const requester = await db.query.member.findFirst({
        where: and(
          eq(schema.member.organizationId, activeOrg.id),
          eq(schema.member.userId, user.id),
        ),
      });
      if (requester?.role !== "owner") {
        return c.json(
          { message: "Forbidden" },
          403,
        );
      }

      await db.update(schema.member).set({ role }).where(
        eq(schema.member.id, id),
      );
      return c.json({ message: "Role updated" });
    },
  )
  .delete("/", async (c) => {
    const user = c.get("user");
    const activeOrg = c.get("activeOrg");

    if (!activeOrg) return c.json({ message: "No active org" }, 400);

    const requester = await db.query.member.findFirst({
      where: and(
        eq(schema.member.organizationId, activeOrg.id),
        eq(schema.member.userId, user.id),
      ),
    });
    if (requester?.role !== "owner") {
      return c.json({ message: "Forbidden" }, 403);
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(schema.transactions).where(
          eq(schema.transactions.organizationId, activeOrg.id),
        );
        await tx.delete(schema.wallets).where(
          eq(schema.wallets.organizationId, activeOrg.id),
        );
        await tx.delete(schema.categories).where(
          eq(schema.categories.organizationId, activeOrg.id),
        );
        await tx.delete(schema.member).where(
          eq(schema.member.organizationId, activeOrg.id),
        );

        await auth.api.deleteOrganization({
          body: { organizationId: activeOrg.id },
          headers: c.req.raw.headers as any,
        });

        await auth.api.setActiveOrganization({
          body: { organizationId: null },
          headers: c.req.raw.headers as any,
        });
      });

      await invalidateUserCache(user.id, activeOrg.id);
      return c.json({
        success: true,
        message: "Organization and all associated data deleted successfully",
      });
    } catch (e) {
      console.error("Delete organization error:", e);
      return c.json({
        success: false,
        message: e instanceof Error
          ? e.message
          : "Failed to delete organization",
      }, 500);
    }
  });
