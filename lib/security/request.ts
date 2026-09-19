/**
 * ============================================================================
 *  سياق الطلب — IP، وكيل المستخدم، والحماية من CSRF
 * ============================================================================
 */
import { headers } from "next/headers";

export type RequestContext = {
  ip: string;
  userAgent: string;
};

/** استخراج عنوان IP الحقيقي (يدعم الوسطاء العكسيين). */
export function extractIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip") ?? headerList.get("cf-connecting-ip") ?? "unknown";
}

/** سياق الطلب الحالي داخل Route Handler أو Server Component. */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  return {
    ip: extractIp(headerList),
    userAgent: (headerList.get("user-agent") ?? "unknown").slice(0, 400),
  };
}

/**
 * حماية CSRF للطلبات المُعدِّلة:
 * بما أن الكعكة sameSite=strict، نضيف تحققاً من تطابق مصدر الطلب
 * (Origin/Referer) مع مضيف الخادم كطبقة حماية ثانية.
 */
export function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return true; // طلبات من نفس الخادم أو أدوات الخادم
  try {
    const source = new URL(origin);
    const host = request.headers.get("host") ?? "";
    return source.host === host;
  } catch {
    return false;
  }
}

/** تنظيف نص من المحارف الخطرة قبل عرضه/تخزينه (Defense in depth). */
export function sanitizeText(input: string, maxLength = 500): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** ترويسات الأمان الموحدة (تُضاف في next.config.ts وفي ردود الملفات). */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "1; mode=block",
  "Cross-Origin-Opener-Policy": "same-origin",
};
