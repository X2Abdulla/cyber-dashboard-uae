/**
 * ============================================================================
 *  عميل الـ API للواجهة — فك تغليف موحّد + معالجة أخطاء عربية
 * ============================================================================
 */
import type { ApiResult } from "@/lib/types";

/** خطأ يحمل رسالة عربية جاهزة للعرض + رمز الحالة. */
export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new ApiError("تعذر الاتصال بالخادم. تحقق من الشبكة.", 0, "NETWORK");
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  const body = parsed as (ApiResult<T> & { data?: unknown }) | null;

  if (!response.ok || !body || body.ok === false) {
    const message =
      (body && "error" in body && typeof body.error === "string" && body.error) ||
      `تعذر تنفيذ الطلب (رمز ${response.status}).`;
    throw new ApiError(message, response.status, (body as { code?: string } | null)?.code, (body as { data?: unknown } | null)?.data);
  }

  return body.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url, { method: "GET" }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

/** بناء سلسلة استعلام من كائن (يتجاهل القيم الفارغة). */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
