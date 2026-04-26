import { Redis } from "@upstash/redis";
import type { DurationInput } from "effect/Duration";
import { Duration } from "effect";

let _redis: Redis | undefined;

export function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
      token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return _redis;
}

export const redis = getRedis();

// Vite-style colors
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

// Format timestamp like Vite
const timestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

// Vite-style logger
const log = {
  hit: (key: string, ms: number) => {
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.green}[cache]${colors.reset} ${colors.cyan}hit${colors.reset} ${colors.dim}${key} ${ms}ms${colors.reset}`,
    );
  },
  miss: (key: string) => {
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[cache]${colors.reset} ${colors.cyan}miss${colors.reset} ${colors.dim}${key}${colors.reset}`,
    );
  },
  fetch: (key: string, ms: number) => {
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}[cache]${colors.reset} ${colors.dim}fetch${colors.reset} ${colors.dim}${key} (${ms}ms)${colors.reset}`,
    );
  },
  set: (key: string) => {
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.green}[cache]${colors.reset} ${colors.dim}set${colors.reset} ${colors.dim}${key}${colors.reset}`,
    );
  },
  invalidate: (pattern: string, count: number) => {
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.magenta}[cache]${colors.reset} ${colors.dim}invalidate${colors.reset} ${colors.dim}${pattern} (${count} keys)${colors.reset}`,
    );
  },
  error: (operation: string, key: string, error: any) => {
    console.error(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.red}[cache]${colors.reset} ${colors.red}${operation} error${colors.reset} ${colors.dim}${key}${colors.reset}`,
      error,
    );
  },
};

export const backendCache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get<T>(key);
      return data;
    } catch (error) {
      log.error("get", key, error);
      return null;
    }
  },

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      log.set(key);
    } catch (error) {
      log.error("set", key, error);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      log.error("del", key, error);
    }
  },

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        log.invalidate(pattern, keys.length);
      }
    } catch (error) {
      log.error("invalidate", pattern, error);
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      return false;
    }
  },

  async ttl(key: string): Promise<number> {
    try {
      return await redis.ttl(key);
    } catch (error) {
      return -1;
    }
  },
};

export async function withBackendCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: DurationInput = Duration.minutes(10),
): Promise<T> {
  const startTime = Date.now();

  try {
    const cached = await backendCache.get<T>(key);

    if (cached !== null && cached !== undefined) {
      const duration = Date.now() - startTime;
      log.hit(key, duration);
      return cached;
    }

    log.miss(key);
  } catch (error) {
    log.error("read", key, error);
  }

  // Fetch fresh data
  const fetchStart = Date.now();
  const data = await fetcher();
  const fetchDuration = Date.now() - fetchStart;

  log.fetch(key, fetchDuration);

  // Store in cache
  backendCache.set(key, data, Duration.toMillis(ttl)).catch((err) => {
    log.error("write", key, err);
  });

  return data;
}

export { redis };
