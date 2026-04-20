import {
  inviteSchema,
  joinSchema,
  organizationSchema,
} from "#server/lib/schemas";
import { auth } from "#server/lib/auth/auth";
import { invalidateUserCache } from "#server/lib/composables/invalidateRedis";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

export const orgsGroups = new Hono()
  .post("/create", zValidator("json", organizationSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      const org = await auth.api.createOrganization({
        body: { name: body.name, slug: body.slug, userId: user.id },
        headers: c.req.raw.headers as any,
      });
      await invalidateUserCache(user.id);
      return c.json({ success: true, organization: org });
    } catch (e) {
      console.error("Create org error:", e);
      return c.json({
        success: false,
        message: e instanceof Error ? e.message : "Gagal membuat organisasi",
      }, 500);
    }
  })
  .post("/invite", zValidator("json", inviteSchema), async (c) => {
    const activeOrg = c.get("activeOrg");
    const body = c.req.valid("json");

    if (!activeOrg) {
      return c.json({
        success: false,
        message: "Harus memilih organisasi aktif",
      }, 400);
    }

    try {
      await auth.api.createInvitation({
        body: {
          email: body.email,
          role: body.role,
          organizationId: activeOrg.id,
        },
        headers: c.req.raw.headers as any,
      });
      return c.json({ success: true, message: "Undangan berhasil dikirim" });
    } catch (e) {
      console.error("Invite error:", e);
      return c.json({
        success: false,
        message: e instanceof Error ? e.message : "Gagal mengirim undangan",
      }, 500);
    }
  })
  .post("/accept-invitation", zValidator("json", joinSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      await auth.api.acceptInvitation({
        body: { invitationId: body.invitationId },
        headers: c.req.raw.headers as any,
      });
      await invalidateUserCache(user.id);
      return c.json({
        success: true,
        message: "Berhasil bergabung dengan organisasi",
      });
    } catch (e) {
      console.error("Accept invitation error:", e);
      return c.json({
        success: false,
        message: e instanceof Error ? e.message : "Gagal menerima undangan",
      }, 500);
    }
  })
  .put("/change/:id", async (c) => {
    const user = c.get("user");
    const { id: orgIdParam } = c.req.param();
    const targetOrgId = orgIdParam === "personal" ? null : orgIdParam;

    try {
      await auth.api.setActiveOrganization({
        body: { organizationId: targetOrgId },
        headers: c.req.raw.headers as any,
      });
      await invalidateUserCache(user.id, targetOrgId);
      return c.json({
        success: true,
        message: targetOrgId
          ? "Organization switched successfully!"
          : "Switched to personal account!",
        organizationId: targetOrgId,
      });
    } catch (e) {
      console.error("Change org error:", e);
      return c.json({
        success: false,
        error: e instanceof Error ? e.message : "Failed to switch organization",
      }, 500);
    }
  });
