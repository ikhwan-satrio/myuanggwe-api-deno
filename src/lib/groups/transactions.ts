import { eq, and, isNull } from 'drizzle-orm';
import { db } from '#server/lib/db';
import * as schema from '#server/lib/db/schema';
import { withBackendCache } from '#server/lib/redis/server';
import { transactionSchema } from '#server/lib/schemas';
import { invalidateUserCache } from '../composables/invalidateRedis';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

export const transactionsGroup = new Hono()

  .get('/', async (c) => {
    const user = c.get('user');
    const activeOrg = c.get('activeOrg');
    const cacheKey = activeOrg
      ? `transactions:org:${activeOrg.id}`
      : `transactions:user:${user.id}`;

    const transactionList = await withBackendCache(cacheKey, async () => {
      return await db.query.transactions.findMany({
        where: activeOrg
          ? eq(schema.transactions.organizationId, activeOrg.id)
          : and(
              eq(schema.transactions.userId, user.id),
              isNull(schema.transactions.organizationId)
            ),
        with: { wallet: true, toWallet: true, category: true },
        orderBy: (transactions, { desc }) => [desc(transactions.date)]
      });
    });

    return c.json({ transactionList });
  })

  .post('/create', zValidator('json', transactionSchema), async (c) => {
    const user = c.get('user');
    const currentSession = c.get('currentSession');
    const body = c.req.valid('json');
    const { amount, type, walletId, toWalletId, categoryId, description, date } = body;
    const orgId = currentSession?.activeOrganizationId ?? null;

    try {
      const walletContextQuery = orgId
        ? eq(schema.wallets.organizationId, orgId)
        : and(eq(schema.wallets.userId, user.id), isNull(schema.wallets.organizationId));

      await db.transaction(async (tx) => {
        const walletSource = await tx.query.wallets.findFirst({
          where: and(eq(schema.wallets.id, walletId), walletContextQuery)
        });
        if (!walletSource) throw new Error('Source wallet not found or access denied');

        if (type !== 'income' && walletSource.balance < amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        if (type === 'transfer') {
          if (!toWalletId) throw new Error('Destination wallet required for transfer');
          await tx
            .update(schema.wallets)
            .set({ balance: walletSource.balance - amount })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));

          const walletDest = await tx.query.wallets.findFirst({
            where: and(eq(schema.wallets.id, toWalletId), walletContextQuery)
          });
          if (!walletDest) throw new Error('Destination wallet not found or access denied');

          await tx
            .update(schema.wallets)
            .set({ balance: walletDest.balance + amount })
            .where(and(eq(schema.wallets.id, toWalletId), walletContextQuery));
        } else {
          const change = type === 'income' ? amount : -amount;
          await tx
            .update(schema.wallets)
            .set({ balance: walletSource.balance + change })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
        }

        const insertPayload: typeof schema.transactions.$inferInsert = {
          id: crypto.randomUUID(),
          amount,
          type,
          description: description || null,
          walletId,
          userId: user.id,
          organizationId: orgId,
          date: new Date(date),
          toWalletId: type === 'transfer' ? toWalletId : null,
          categoryId: type !== 'transfer' && categoryId ? categoryId : null
        };

        await tx.insert(schema.transactions).values(insertPayload);
      });

      await invalidateUserCache(user.id, orgId);
      return c.json({ message: 'transaksi berhasil!' });
    } catch (e: unknown) {
      console.error(e);
      const message =
        e instanceof Error && e.message === 'INSUFFICIENT_BALANCE'
          ? 'Saldo tidak mencukupi'
          : 'Gagal memproses transaksi';
      return c.json({ message }, 500);
    }
  })

  .put('/edit/:id', zValidator('json', transactionSchema), async (c) => {
    const user = c.get('user');
    const currentSession = c.get('currentSession');
    const body = c.req.valid('json');
    const { id: transactionId } = c.req.param();
    const { amount, type, walletId, toWalletId, categoryId, description, date } = body;
    const orgId = currentSession?.activeOrganizationId ?? null;

    try {
      const walletContextQuery = orgId
        ? eq(schema.wallets.organizationId, orgId)
        : and(eq(schema.wallets.userId, user.id), isNull(schema.wallets.organizationId));

      await db.transaction(async (tx) => {
        const oldTransaction = await tx.query.transactions.findFirst({
          where: and(
            eq(schema.transactions.id, transactionId),
            eq(schema.transactions.userId, user.id)
          )
        });
        if (!oldTransaction) throw new Error('Transaction not found');

        const { amount: oldAmount, type: oldType, walletId: oldWalletId, toWalletId: oldToWalletId } = oldTransaction;

        const currentOldWalletSource = await tx.query.wallets.findFirst({
          where: and(eq(schema.wallets.id, oldWalletId), walletContextQuery)
        });
        if (!currentOldWalletSource) throw new Error('Old source wallet not found or access denied');

        if (oldType === 'income') {
          await tx.update(schema.wallets)
            .set({ balance: currentOldWalletSource.balance - oldAmount })
            .where(and(eq(schema.wallets.id, oldWalletId), walletContextQuery));
        } else if (oldType === 'expense') {
          await tx.update(schema.wallets)
            .set({ balance: currentOldWalletSource.balance + oldAmount })
            .where(and(eq(schema.wallets.id, oldWalletId), walletContextQuery));
        } else if (oldType === 'transfer' && oldToWalletId) {
          const currentOldWalletDest = await tx.query.wallets.findFirst({
            where: and(eq(schema.wallets.id, oldToWalletId), walletContextQuery)
          });
          if (!currentOldWalletDest) throw new Error('Old destination wallet not found or access denied');
          await tx.update(schema.wallets)
            .set({ balance: currentOldWalletSource.balance + oldAmount })
            .where(and(eq(schema.wallets.id, oldWalletId), walletContextQuery));
          await tx.update(schema.wallets)
            .set({ balance: currentOldWalletDest.balance - oldAmount })
            .where(and(eq(schema.wallets.id, oldToWalletId), walletContextQuery));
        }

        const newWalletSource = await tx.query.wallets.findFirst({
          where: and(eq(schema.wallets.id, walletId), walletContextQuery)
        });
        if (!newWalletSource) throw new Error('New source wallet not found or access denied');
        if (type !== 'income' && newWalletSource.balance < amount) throw new Error('INSUFFICIENT_BALANCE');

        if (type === 'transfer') {
          if (!toWalletId) throw new Error('Destination wallet required for transfer');
          const newWalletDest = await tx.query.wallets.findFirst({
            where: and(eq(schema.wallets.id, toWalletId), walletContextQuery)
          });
          if (!newWalletDest) throw new Error('New destination wallet not found or access denied');
          await tx.update(schema.wallets)
            .set({ balance: newWalletSource.balance - amount })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
          await tx.update(schema.wallets)
            .set({ balance: newWalletDest.balance + amount })
            .where(and(eq(schema.wallets.id, toWalletId), walletContextQuery));
        } else {
          const change = type === 'income' ? amount : -amount;
          await tx.update(schema.wallets)
            .set({ balance: newWalletSource.balance + change })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
        }

        await tx.update(schema.transactions)
          .set({
            amount,
            type,
            description: description || null,
            walletId,
            userId: user.id,
            organizationId: orgId,
            date: new Date(date),
            toWalletId: type === 'transfer' ? (toWalletId ?? null) : null,
            categoryId: type !== 'transfer' && categoryId ? categoryId : null
          })
          .where(eq(schema.transactions.id, transactionId));
      });

      await invalidateUserCache(user.id, orgId);
      return c.json({ message: 'Transaksi berhasil diperbarui!' });
    } catch (e: unknown) {
      console.error(e);
      const message =
        e instanceof Error && e.message === 'INSUFFICIENT_BALANCE'
          ? 'Saldo tidak mencukupi'
          : e instanceof Error && e.message.includes('wallet not found')
            ? e.message
            : 'Gagal memperbarui transaksi';
      return c.json({ message }, 500);
    }
  })

  .delete('/erase/:id', async (c) => {
    const user = c.get('user');
    const currentSession = c.get('currentSession');
    const { id: transactionId } = c.req.param();
    const orgId = currentSession?.activeOrganizationId;

    try {
      const walletContextQuery = orgId
        ? eq(schema.wallets.organizationId, orgId)
        : and(eq(schema.wallets.userId, user.id), isNull(schema.wallets.organizationId));

      await db.transaction(async (tx) => {
        const transaction = await tx.query.transactions.findFirst({
          where: and(
            eq(schema.transactions.id, transactionId),
            eq(schema.transactions.userId, user.id)
          )
        });
        if (!transaction) throw new Error('Transaction not found');

        const { amount, type, walletId, toWalletId } = transaction;

        const walletSource = await tx.query.wallets.findFirst({
          where: and(eq(schema.wallets.id, walletId), walletContextQuery)
        });
        if (!walletSource) throw new Error('Source wallet not found or access denied');

        if (type === 'income') {
          await tx.update(schema.wallets)
            .set({ balance: walletSource.balance - amount })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
        } else if (type === 'expense') {
          await tx.update(schema.wallets)
            .set({ balance: walletSource.balance + amount })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
        } else if (type === 'transfer' && toWalletId) {
          const walletDest = await tx.query.wallets.findFirst({
            where: and(eq(schema.wallets.id, toWalletId), walletContextQuery)
          });
          if (!walletDest) throw new Error('Destination wallet not found or access denied');
          await tx.update(schema.wallets)
            .set({ balance: walletSource.balance + amount })
            .where(and(eq(schema.wallets.id, walletId), walletContextQuery));
          await tx.update(schema.wallets)
            .set({ balance: walletDest.balance - amount })
            .where(and(eq(schema.wallets.id, toWalletId), walletContextQuery));
        }

        await tx.delete(schema.transactions).where(eq(schema.transactions.id, transactionId));
      });

      await invalidateUserCache(user.id, orgId);
      return c.json({ message: 'Transaksi berhasil dihapus dan saldo dikembalikan' });
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Gagal menghapus transaksi';
      return c.json({ message }, 500);
    }
  });
