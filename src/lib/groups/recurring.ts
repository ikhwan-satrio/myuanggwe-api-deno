import { eq, and, isNull, lte } from 'drizzle-orm';
import { db } from '#server/lib/db';
import * as schema from '#server/lib/db/schema';
import { withBackendCache } from '#server/lib/redis/server';
import { recurringTransactionSchema } from '#server/lib/schemas';
import { invalidateUserCache } from '#server/lib/composables/invalidateRedis';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

export const recurringGroup = new Hono()

  .get('/', async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const cacheKey = activeOrg ? `recurring:org:${activeOrg.id}` : `recurring:user:${user.id}`;

    const recurringList = await withBackendCache(cacheKey, async () => {
      return await db.query.recurringTransactions.findMany({
        where: activeOrg
          ? eq(schema.recurringTransactions.organizationId, activeOrg.id)
          : and(
              eq(schema.recurringTransactions.userId, user.id),
              isNull(schema.recurringTransactions.organizationId)
            ),
        with: { wallet: true, toWallet: true, category: true },
        orderBy: (rec, { desc }) => [desc(rec.createdAt)]
      });
    });

    return c.json({ recurringList });
  })

  .post('/create', zValidator('json', recurringTransactionSchema), async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const body = c.req.valid('json');
    const { amount, type, frequency, startDate, walletId, toWalletId, categoryId, description } = body;

    try {
      const start = new Date(startDate);
      await db.insert(schema.recurringTransactions).values({
        id: crypto.randomUUID(),
        amount,
        type,
        frequency,
        startDate: start,
        nextRunDate: start,
        walletId,
        toWalletId: toWalletId || null,
        categoryId: categoryId || null,
        description: description || null,
        userId: user.id,
        organizationId: activeOrg?.id ?? null,
        isActive: true
      });
      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ success: true, message: 'Transaksi berulang berhasil dibuat' });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: 'Gagal membuat transaksi berulang' }, 500);
    }
  })

  .delete('/erase/:id', async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const { id } = c.req.param();

    try {
      const contextQuery = activeOrg
        ? eq(schema.recurringTransactions.organizationId, activeOrg.id)
        : and(
            eq(schema.recurringTransactions.userId, user.id),
            isNull(schema.recurringTransactions.organizationId)
          );

      const result = await db
        .delete(schema.recurringTransactions)
        .where(and(eq(schema.recurringTransactions.id, id), contextQuery));

      if (result.rowsAffected === 0) {
        return c.json({ success: false, message: 'Recurring transaction not found' }, 404);
      }

      await invalidateUserCache(user.id, activeOrg?.id);
      return c.json({ success: true, message: 'Transaksi berulang dihapus' });
    } catch (e) {
      console.error(e);
      return c.json({ success: false, message: 'Gagal hapus transaksi berulang' }, 500);
    }
  });

// processRecurringTransactions tidak berubah karena bukan route handler
export async function processRecurringTransactions(userId: string, orgId?: string | null) {
  const now = new Date();
  const pending = await db.query.recurringTransactions.findMany({
    where: and(
      eq(schema.recurringTransactions.userId, userId),
      orgId
        ? eq(schema.recurringTransactions.organizationId, orgId)
        : isNull(schema.recurringTransactions.organizationId),
      eq(schema.recurringTransactions.isActive, true),
      lte(schema.recurringTransactions.nextRunDate, now)
    )
  });

  if (pending.length === 0) return;

  for (const rec of pending) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.transactions).values({
          id: crypto.randomUUID(),
          amount: rec.amount,
          type: rec.type,
          description: `[Recurring] ${rec.description || ''}`,
          date: rec.nextRunDate,
          walletId: rec.walletId,
          toWalletId: rec.toWalletId,
          categoryId: rec.categoryId,
          userId: rec.userId,
          organizationId: rec.organizationId
        });

        const walletSource = await tx.query.wallets.findFirst({
          where: eq(schema.wallets.id, rec.walletId)
        });

        if (walletSource) {
          if (rec.type === 'transfer') {
            await tx
              .update(schema.wallets)
              .set({ balance: walletSource.balance - rec.amount })
              .where(eq(schema.wallets.id, rec.walletId));

            if (rec.toWalletId) {
              const walletDest = await tx.query.wallets.findFirst({
                where: eq(schema.wallets.id, rec.toWalletId)
              });
              if (walletDest) {
                await tx
                  .update(schema.wallets)
                  .set({ balance: walletDest.balance + rec.amount })
                  .where(eq(schema.wallets.id, rec.toWalletId));
              }
            }
          } else {
            const change = rec.type === 'income' ? rec.amount : -rec.amount;
            await tx
              .update(schema.wallets)
              .set({ balance: walletSource.balance + change })
              .where(eq(schema.wallets.id, rec.walletId));
          }
        }

        const nextDate = new Date(rec.nextRunDate);
        if (rec.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (rec.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (rec.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (rec.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

        await tx
          .update(schema.recurringTransactions)
          .set({ lastRunDate: rec.nextRunDate, nextRunDate: nextDate })
          .where(eq(schema.recurringTransactions.id, rec.id));
      });
    } catch (err) {
      console.error(`Failed to process recurring transaction ${rec.id}:`, err);
    }
  }

  await invalidateUserCache(userId, orgId);
}
