/**
 * ============================================================================
 *  تشفير كلمات المرور والتحقق منها
 * ============================================================================
 *  - التشفير: bcrypt مع عامل تكلفة 12 (بطيء عمداً لمقاومة هجمات القاموس).
 *  - لا تُخزَّن كلمة المرور كنص صريح في أي مكان (قاعدة بيانات / سجلات / ردود).
 *  - سياسة كلمات مرور صارمة + قائمة كلمات شائعة مكشوفة.
 */
import { compare, hash } from "bcryptjs";

/** عامل التكلفة — كلما زاد كان أبطأ وأقوى ضد هجمات القوة الغاشمة. */
export const BCRYPT_ROUNDS = 12;

/** كلمات مرور شائعة يرفضها النظام مباشرة. */
const COMMON_PASSWORDS = [
  "123456", "12345678", "123456789", "password", "pass123", "admin", "admin123",
  "qwerty", "111111", "123123", "iloveyou", "welcome", "letmein", "abc123",
  "1234567890", "password1", "p@ssw0rd", "deraa", "deraa123", "123456789a",
];

export type PasswordIssue = { field: string; message: string };

/**
 * التحقق من قوة كلمة المرور وفق سياسة المؤسسة.
 * القواعد: 10 أحرف على الأقل + حرف كبير + حرف صغير + رقم.
 */
export function validatePasswordPolicy(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < 10) {
    issues.push({ field: "password", message: "كلمة المرور يجب ألا تقل عن 10 أحرف." });
  }
  if (!/[A-Z\u0621-\u064A]/.test(password)) {
    issues.push({ field: "password", message: "يجب أن تحتوي على حرف كبير واحد على الأقل." });
  }
  if (!/[a-z\u0621-\u064A]/.test(password)) {
    issues.push({ field: "password", message: "يجب أن تحتوي على حرف صغير واحد على الأقل." });
  }
  if (!/\d/.test(password)) {
    issues.push({ field: "password", message: "يجب أن تحتوي على رقم واحد على الأقل." });
  }
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    issues.push({ field: "password", message: "كلمة المرور شائعة جداً وسهلة التخمين." });
  }
  return issues;
}

/** درجة قوة كلمة المرور من 0 إلى 4 لعرضها في الواجهة. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

/** تشفير كلمة المرور قبل التخزين. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

/**
 * مقارنة كلمة المرور المُدخلة مع التجزئة المخزنة.
 * مقارنة ثابتة الزمن داخلياً عبر bcrypt لتفادي هجمات التوقيت.
 */
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
}
