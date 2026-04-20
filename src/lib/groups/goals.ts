import { eq, and, isNull } from 'drizzle-orm';
import { db } from '#server/lib/db';
import * as schema from '#server/lib/db/schema';
import { withBackendCache } from '#server/lib/redis/server';
import { financialGoalSchema } from '#server/lib/schemas';
import { invalidateUserCache } from '#server/lib/composables/invalidateRedis';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const goalsGroup = new Hono()

  .get('/', async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const cacheKey = activeOrg ? `goals:org:${activeOrg.id}` : `goals:user:${user.id}`;

    const goalList = await withBackendCache(cacheKey, async () => {
      return await db.query.financialGoals.findMany({
        where: activeOrg
          ? eq(schema.financialGoals.organizationId, activeOrg.id)
          : and(
              eq(schema.financialGoals.userId, user.id),
              isNull(schema.financialGoals.organizationId)
            ),
        with: { wallet: true },
        orderBy: (goal, { desc }) => [desc(goal.createdAt)]
      });
    });

    return c.json({ goalList });
  })

  .post('/create', zValidator('json', financialGoalSchema), async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const body = c.req.valid('json');

    try {
      await db.insert(schema.financialGoals).values({
        id: crypto.randomUUID(),
        name: body.name,
        targetAmount: body.targetAmount,
        deadline: body.deadline ? new Date(body.deadline) : null,
        walletId: body.walletId,
        userId: user.id,
        organizationId: activeOrg?.id ?? null,
        currentAmount: 0
      });
      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ success: true, message: 'Target menabung berhasil dibuat' });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: 'Gagal membuat target menabung' }, 500);
    }
  })

  .put('/allocate/:id', zValidator('json', z.object({ amount: z.number() })), async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const { amount } = c.req.valid('json');
    const { id } = c.req.param();

    try {
      const contextQuery = activeOrg
        ? eq(schema.financialGoals.organizationId, activeOrg.id)
        : and(
            eq(schema.financialGoals.userId, user.id),
            isNull(schema.financialGoals.organizationId)
          );

      const goal = await db.query.financialGoals.findFirst({
        where: and(eq(schema.financialGoals.id, id), contextQuery)
      });

      if (!goal) return c.json({ success: false, message: 'Goal not found' }, 404);

      await db
        .update(schema.financialGoals)
        .set({ currentAmount: goal.currentAmount + amount })
        .where(eq(schema.financialGoals.id, id));

      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ success: true, message: 'Alokasi dana berhasil' });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: 'Gagal alokasi dana' }, 500);
    }
  })

  .delete('/erase/:id', async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const { id } = c.req.param();

    try {
      const contextQuery = activeOrg
        ? eq(schema.financialGoals.organizationId, activeOrg.id)
        : and(
            eq(schema.financialGoals.userId, user.id),
            isNull(schema.financialGoals.organizationId)
          );

      const result = await db
        .delete(schema.financialGoals)
        .where(and(eq(schema.financialGoals.id, id), contextQuery));

      if (result.rowsAffected === 0) {
        return c.json({ success: false, message: 'Goal not found' }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ success: true, message: 'Target menabung dihapus' });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: 'Gagal hapus target' }, 500);
    }
  });
