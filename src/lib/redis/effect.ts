import { Redis } from "@upstash/redis";
import { Context, Data, Duration, Effect, Layer, Option } from "effect";
import type { DurationInput } from "effect/Duration";

// ── Redis Service ────────────────────────────────────────────────────────────

class RedisService extends Context.Tag("RedisService")<RedisService, Redis>() {}

export const RedisLive = Layer.sync(
  RedisService,
  () =>
    new Redis({
      url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
      token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN"),
    }),
);

// ── Errors ───────────────────────────────────────────────────────────────────

class CacheError extends Data.TaggedError("CacheError")<{
  operation: string;
  key: string;
  cause: unknown;
}> {}

// ── Logger ───────────────────────────────────────────────────────────────────

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const timestamp = () =>
  new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const log = {
  hit: (key: string, ms: number) =>
    Effect.sync(() =>
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.green}[cache]${colors.reset} ${colors.cyan}hit${colors.reset} ${colors.dim}${key} ${ms}ms${colors.reset}`,
      )
    ),
  miss: (key: string) =>
    Effect.sync(() =>
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[cache]${colors.reset} ${colors.cyan}miss${colors.reset} ${colors.dim}${key}${colors.reset}`,
      )
    ),
  fetch: (key: string, ms: number) =>
    Effect.sync(() =>
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}[cache]${colors.reset} ${colors.dim}fetch${colors.reset} ${colors.dim}${key} (${ms}ms)${colors.reset}`,
      )
    ),
  set: (key: string) =>
    Effect.sync(() =>
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.green}[cache]${colors.reset} ${colors.dim}set${colors.reset} ${colors.dim}${key}${colors.reset}`,
      )
    ),
  invalidate: (pattern: string, count: number) =>
    Effect.sync(() =>
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.magenta}[cache]${colors.reset} ${colors.dim}invalidate${colors.reset} ${colors.dim}${pattern} (${count} keys)${colors.reset}`,
      )
    ),
  error: (e: CacheError) =>
    Effect.sync(() =>
      console.error(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.red}[cache]${colors.reset} ${colors.red}${e.operation} error${colors.reset} ${colors.dim}${e.key}${colors.reset}`,
        e.cause,
      )
    ),
};

// ── Cache Operations ─────────────────────────────────────────────────────────

const cacheGet = <T>(key: string) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    return yield* Effect.tryPromise({
      try: () => redis.get<T>(key),
      catch: (cause) => new CacheError({ operation: "get", key, cause }),
    });
  }).pipe(
    Effect.map(Option.fromNullable),
    Effect.catchAll((e) =>
      Effect.zipRight(log.error(e), Effect.succeed(Option.none<T>()))
    ),
  );

const cacheSet = (
  key: string,
  value: unknown,
  ttl: DurationInput = Duration.minutes(10),
) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    const seconds = Math.floor(Duration.toMillis(ttl) / 1000);
    yield* Effect.tryPromise({
      try: () => redis.setex(key, seconds, JSON.stringify(value)),
      catch: (cause) => new CacheError({ operation: "set", key, cause }),
    });
    yield* log.set(key);
  }).pipe(Effect.catchAll((e) => log.error(e)));

const cacheDel = (key: string) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    yield* Effect.tryPromise({
      try: () => redis.del(key),
      catch: (cause) => new CacheError({ operation: "del", key, cause }),
    });
  }).pipe(Effect.catchAll((e) => log.error(e)));

const cacheInvalidate = (pattern: string) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    const keys = yield* Effect.tryPromise({
      try: () => redis.keys(pattern),
      catch: (cause) =>
        new CacheError({ operation: "invalidate", key: pattern, cause }),
    });
    if (keys.length > 0) {
      yield* Effect.tryPromise({
        try: () => redis.del(...keys),
        catch: (cause) =>
          new CacheError({ operation: "invalidate", key: pattern, cause }),
      });
      yield* log.invalidate(pattern, keys.length);
    }
  }).pipe(Effect.catchAll((e) => log.error(e)));

const cacheExists = (key: string) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    const result = yield* Effect.tryPromise({
      try: () => redis.exists(key),
      catch: (cause) => new CacheError({ operation: "exists", key, cause }),
    });
    return result === 1;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

const cacheTtl = (key: string) =>
  Effect.gen(function* () {
    const redis = yield* RedisService;
    return yield* Effect.tryPromise({
      try: () => redis.ttl(key),
      catch: (cause) => new CacheError({ operation: "ttl", key, cause }),
    });
  }).pipe(Effect.catchAll(() => Effect.succeed(-1)));

export const backendCache = {
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  invalidate: cacheInvalidate,
  exists: cacheExists,
  ttl: cacheTtl,
};

// ── withBackendCache ──────────────────────────────────────────────────────────

export const withBackendCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: DurationInput = Duration.minutes(10),
): Effect.Effect<T, never, RedisService> =>
  Effect.gen(function* () {
    const startTime = Date.now();
    const cached = yield* cacheGet<T>(key);

    if (Option.isSome(cached)) {
      yield* log.hit(key, Date.now() - startTime);
      return cached.value;
    }

    yield* log.miss(key);

    const fetchStart = Date.now();
    const data = yield* Effect.tryPromise({
      try: fetcher,
      catch: (cause) => new CacheError({ operation: "fetch", key, cause }),
    });
    yield* log.fetch(key, Date.now() - fetchStart);

    // Fire and forget
    yield* Effect.forkDaemon(cacheSet(key, data, ttl));

    return data;
  }).pipe(
    Effect.catchTag("CacheError", (e) =>
      Effect.zipRight(
        log.error(e),
        Effect.tryPromise({
          try: fetcher,
          catch: (cause) =>
            new CacheError({ operation: "fallback", key, cause }),
        }),
      )),
    Effect.orDie,
  );

export { RedisService as redis };
