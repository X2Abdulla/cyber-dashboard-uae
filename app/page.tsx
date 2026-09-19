/**
 * الصفحة الجذرية: تحوّل المستخدم إلى لوحة التحكم (أو إلى الدخول إن لم تكن
 * هناك جلسة صالحة) — يتم التحقق في الخادم قبل إرسال أي محتوى.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDbReady } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  await ensureDbReady();
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
