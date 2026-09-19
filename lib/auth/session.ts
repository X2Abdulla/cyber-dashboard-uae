/**
 * ============================================================================
 *  إدارة الجلسات — رمز JWT موقّع داخل كعكة httpOnly
 * ============================================================================
 *  - التوقيع: HS256 عبر مكتبة jose.
 *  - الكعكة: httpOnly (لا تصل إليها سكربتات XSS) + sameSite=strict (حماية CSRF)
 *            + secure في بيئة الإنتاج.
 *  - السر: يُقرأ من متغير البيئة AUTH_SECRET، ومع وجود بديل تطويري مشتق
 *          من DATABASE_URL حتى تعمل المعاينة دون إعداد إضافي.
 */
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";
import { eq } from "drizzle-orm";
import type { Role, SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "deraa_session";
/** عمر الجلسة: 8 ساعات عمل. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecretKey(): Uint8Array {
  const source =
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    // بديل تطويري ثابت مشتق من رابط القاعدة (لا تستخدمه في الإنتاج).
    `deraa-dev-fallback::${process.env.DATABASE_URL ?? "local"}`;
  return new TextEncoder().encode(createHash("sha256").update(source).digest("hex"));
}

export type SessionPayload = {
  sub: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  department: string | null;
  sid: string;
};

/** إنشاء رمز جلسة موقّع وتعيينه في كعكة آمنة. */
export async function createSessionCookie(user: SessionUser): Promise<string> {
  const token = await new SignJWT({
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    sid: randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("deraa-security-platform")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

/** حذف كعكة الجلسة (تسجيل خروج). */
export async function destroySessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

/** فك تشفير الرمز والتحقق من التوقيع والانتهاء. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: "deraa-security-platform",
    });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      username: String(payload.username ?? ""),
      fullName: String(payload.fullName ?? ""),
      email: String(payload.email ?? ""),
      role: (payload.role as Role) ?? "user",
      department: (payload.department as string | null) ?? null,
      sid: String(payload.sid ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * قراءة الجلسة الحالية من الكعكة ثم التحقق من أن الحساب ما زال نشطاً
 * (إيقاف الحساب يسري فوراً حتى لو كانت الكعكة صالحة).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  await ensureDbReady();
  const rows = await db
    .select({ id: users.id, status: users.status, role: users.role, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "active") return null;

  return {
    id: payload.sub,
    username: payload.username,
    fullName: row.fullName,
    email: payload.email,
    // الدور يُقرأ من قاعدة البيانات لضمان سريان أي تغيير فوراً.
    role: row.role as Role,
    department: payload.department,
  };
}
