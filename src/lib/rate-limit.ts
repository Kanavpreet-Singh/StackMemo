/**
 * In-memory IP-based rate limiter for guest usage.
 *
 * The store is attached to `globalThis` so it survives
 * Next.js hot-module reloads in development.
 */

interface RateLimitEntry {
    count: number;
    firstUsed: number;
}

/* ── Persist across HMR in dev ── */
const globalForRateLimit = globalThis as unknown as {
    __rateLimitStore?: Map<string, RateLimitEntry>;
    __rateLimitCleanup?: ReturnType<typeof setInterval>;
};

if (!globalForRateLimit.__rateLimitStore) {
    globalForRateLimit.__rateLimitStore = new Map<string, RateLimitEntry>();
}

const store = globalForRateLimit.__rateLimitStore;

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Cleanup stale entries every 10 minutes (only one interval) */
if (!globalForRateLimit.__rateLimitCleanup) {
    globalForRateLimit.__rateLimitCleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (now - entry.firstUsed > DEFAULT_WINDOW_MS) {
                store.delete(key);
            }
        }
    }, 10 * 60 * 1000);
}

/**
 * Normalize IP so all localhost variants map to the same key.
 * ::1, ::ffff:127.0.0.1, 127.0.0.1 → all become "127.0.0.1"
 */
function normalizeIP(ip: string): string {
    const trimmed = ip.trim();
    // IPv6 localhost
    if (trimmed === "::1") return "127.0.0.1";
    // IPv4-mapped IPv6 (::ffff:127.0.0.1)
    if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
    return trimmed;
}

/**
 * Extract the client IP from a Request.
 */
export function getClientIP(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return normalizeIP(forwarded.split(",")[0]);
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return normalizeIP(realIp);
    }

    // Local dev fallback
    return "127.0.0.1";
}

/**
 * Check if an IP has exceeded the allowed number of actions.
 */
export function checkIPLimit(
    ip: string,
    maxAttempts: number = 1,
    windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; total: number } {
    const now = Date.now();
    const key = `guest:${ip}`;
    const existing = store.get(key);

    console.log(`[rate-limit] checkIPLimit ip="${ip}" key="${key}" exists=${!!existing} storeSize=${store.size}`);

    if (!existing) {
        return { allowed: true, remaining: maxAttempts, total: 0 };
    }

    if (now - existing.firstUsed > windowMs) {
        store.delete(key);
        return { allowed: true, remaining: maxAttempts, total: 0 };
    }

    const remaining = Math.max(0, maxAttempts - existing.count);
    return {
        allowed: existing.count < maxAttempts,
        remaining,
        total: existing.count,
    };
}

/**
 * Record a usage for the given IP.
 */
export function recordIPUsage(ip: string): void {
    const key = `guest:${ip}`;
    const existing = store.get(key);

    if (existing) {
        existing.count += 1;
    } else {
        store.set(key, { count: 1, firstUsed: Date.now() });
    }

    console.log(`[rate-limit] recordIPUsage ip="${ip}" newCount=${store.get(key)!.count} storeSize=${store.size}`);
}
