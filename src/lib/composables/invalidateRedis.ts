import { backendCache } from "#server/lib/redis/server";

export async function invalidateUserCache(
  userId: string,
  orgId?: string | null,
) {
  const patterns = [
    `layout:${userId}`,
    `dashboard:user:${userId}`,
    `wallets:user:${userId}`,
    `transactions:user:${userId}`,
    `categories:user:${userId}`,
    `chart:user:${userId}`,
    `budgets:user:${userId}`,
    `recurring:user:${userId}`,
    `goals:user:${userId}`,
  ];

  if (orgId) {
    patterns.push(
      `dashboard:org:${orgId}`,
      `wallets:org:${orgId}`,
      `transactions:org:${orgId}`,
      `categories:org:${orgId}`,
      `chart:org:${orgId}`,
      `budgets:org:${orgId}`,
      `recurring:org:${orgId}`,
      `goals:org:${orgId}`,
    );
  }

  await Promise.all(patterns.map((p) => backendCache.del(p)));
}
