/**
 * Small in-memory rate limiter for login / invitation attempts. The server is
 * reachable from the internet, so guessing passwords or
 * invitation codes must be slowed down. Memory is fine: one server process.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * The visitor's IP, read only from the header our own proxy sets — any other
 * forwarding header could be forged by the client to dodge the limits.
 * On the Oracle VM, Caddy overwrites X-Forwarded-For with the real client IP.
 * Set NUTRIFLOW_CLIENT_IP_HEADER if you put a different proxy in front.
 */
const IP_HEADER = (process.env.NUTRIFLOW_CLIENT_IP_HEADER ?? "x-forwarded-for").toLowerCase();

export function clientIp(req: Request): string {
  return req.headers.get(IP_HEADER)?.split(",")[0].trim() || "local";
}

/** Returns seconds to wait if `key` has exceeded `limit` attempts in `windowMs`, else null (and counts this attempt). */
export function tooManyAttempts(key: string, limit = 10, windowMs = 15 * 60 * 1000): number | null {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  b.count++;
  if (b.count > limit) return Math.ceil((b.resetAt - now) / 1000);
  return null;
}

export function clearAttempts(key: string) {
  buckets.delete(key);
}

export function rateLimited(retryAfter: number) {
  return Response.json(
    { error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
