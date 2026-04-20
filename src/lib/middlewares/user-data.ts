import { withBackendCache } from "#server/lib/redis/server.ts";
import { db } from "#server/lib/db/index.ts";
import * as schema from "#server/lib/db/schema.ts";
import { eq } from "drizzle-orm";
import { auth } from "../auth/auth.ts";
import { createMiddleware } from "hono/factory";

export const userDataMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user || !session?.session) {
    c.set("activeOrg", null);
    c.set("organizations", []);
    c.set("currentSession", null);
    await next(); // <-- next() bukan return object
    return;
  }

  const layoutData = await withBackendCache(
    `layout:${session.user.id}`,
    async () => {
      const [currentSessionData, userOrgs] = await Promise.all([
        db.query.session.findFirst({
          where: eq(schema.session.id, session.session.id),
          columns: { activeOrganizationId: true },
        }),
        db.query.member.findMany({
          where: eq(schema.member.userId, session.user.id),
          with: { organization: true },
        }),
      ]);
      return { currentSessionData, userOrgs };
    },
  );

  const activeOrg = layoutData.userOrgs.find(
    (o) =>
      o.organizationId === layoutData.currentSessionData?.activeOrganizationId,
  )?.organization;

  c.set("activeOrg", activeOrg ?? null);
  c.set("organizations", layoutData.userOrgs.map((o) => o.organization));
  c.set("currentSession", layoutData.currentSessionData);
  await next();
});
