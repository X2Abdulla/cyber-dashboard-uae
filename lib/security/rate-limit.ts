/**
 * ============================================================================
 *  الحدّ من المعدل (Rate Limiting) + قفل الحسابات
 * ============================================================================
 *  حماية من هجمات القوة الغاشمة (Brute Force) وتكرار الطلبات.
 *  المخزن في الذاكرة (مناسب لخادم واحد) — يمكن استبداله بـ Redis لاحقاً
 *  دون تغيير أي استدعاء لأن الواجهة (API) ثابتة.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** تنظيف دوري للسلال المنتهية حتى لا تنمو الذاكرة بلا حدود. */
let lastSweep = Date.now();
function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((hit) => now - hit > 60 * 60 * 1000)) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

/**
 * نافذة منزلقة: يسمح بعدد `limit` طلب لكل مفتاح خلال `windowMs`.
 * المفتاح المقترح: `${ip}:${route}` أو `${ip}:login:${username}`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit <= windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      limit,
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSeconds: 0,
    limit,
  };
}

/** إعادة ضبط عدّاد مفتاح (مثلاً بعد دخول ناجح). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** عدد المحاولات المسجلة حالياً على مفتاح (يُعرض في لوحة الإدارة). */
export function peekRateLimit(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return bucket.hits.filter((hit) => now - hit <= windowMs).length;
}

/** حدود جاهزة ومستخدمة في كل نقاط الدخول. */
export const LIMITS = {
  /** محاولات تسجيل الدخول لكل IP خلال 15 دقيقة. */
  LOGIN_PER_IP: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** محاولات تسجيل الدخول لكل اسم مستخدم خلال 15 دقيقة. */
  LOGIN_PER_ACCOUNT: { limit: 6, windowMs: 15 * 60 * 1000 },
  /** الطلبات العامة لكل IP خلال دقيقة. */
  API_PER_IP: { limit: 240, windowMs: 60 * 1000 },
  /** عمليات الكتابة (رفع/إنشاء/تعديل) لكل IP خلال دقيقة. */
  WRITE_PER_IP: { limit: 40, windowMs: 60 * 1000 },
} as const;

/** مدة قفل الحساب بعد تجاوز المحاولات الفاشلة المسموحة. */
export const ACCOUNT_LOCK_MINUTES = 15;
export const MAX_FAILED_ATTEMPTS = 5;
