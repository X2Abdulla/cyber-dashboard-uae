/**
 * ============================================================================
 *  محرك المؤشرات الحية (Live Engine)
 * ============================================================================
 *  في البيئات الحقيقية تُغذّى هذه السلاسل من أجهزة الاستشعار و IDS/EDR.
 *  هنا يعمل محرك محاكاة واقعي عند كل طلب للوحة التحكم (مع تقييد زمني
 *  Throttling) بحيث:
 *    - يضيف نقاطاً زمنية لسلاسل: traffic / threats / blocked / scans
 *    - يحدّث حمل المعالج وحالة الأجهزة
 *    - يولّد تنبيهات أمنية جديدة أحياناً (وبنسبة أعلى عند وجود نشاط خطر)
 *  كل الأحداث المولدة تُسجَّل في قاعدة البيانات فتظهر في التقارير فوراً.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, devices, metricPoints } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";

/** الحد الأدنى بين دورتين للمحرك (مللي ثانية). */
const TICK_INTERVAL_MS = 8_000;
let lastTick = 0;
let running: Promise<void> | null = null;

const LIVE_TEMPLATES = [
  { type: "port_scan", title: "مسح منافذ نشط", description: "رصد محاولة فحص منافذ من مصدر خارجي على الجدار الناري.", severity: "medium", risk: 52 },
  { type: "brute_force", title: "محاولات دخول متكررة", description: "تجاوز عدد محاولات المصادقة الحد الآمن من عنوان واحد.", severity: "high", risk: 78 },
  { type: "malware", title: "توقيع برمجية خبيثة", description: "محرك الفحص رصد توقيعاً معروفاً في ملف وارد.", severity: "critical", risk: 95 },
  { type: "phishing", title: "رسالة تصيّد واردة", description: "رابط يحاكي نطاق المؤسسة ورد إلى صندوق بريد موظف.", severity: "high", risk: 74 },
  { type: "ddos", title: "ذروة طلبات غير طبيعية", description: "ارتفاع حاد في الطلبات يتجاوز الخط الأساسي للشبكة.", severity: "critical", risk: 91 },
  { type: "unauthorized_access", title: "وصول غير مصرح", description: "محاولة استدعاء واجهة إدارية بصلاحيات غير كافية.", severity: "medium", risk: 48 },
  { type: "data_exfiltration", title: "نقل بيانات خارجي", description: "حجم بيانات صادر غير اعتيادي إلى نطاق غير مصنف.", severity: "high", risk: 82 },
  { type: "weak_policy", title: "مخالفة سياسة أمنية", description: "جهاز لا يستوفي متطلبات التشفير أو التحديثات.", severity: "low", risk: 28 },
] as const;

/** تنفيذ دورة واحدة من المحرك (مع منع التزامن). */
export async function tickLiveEngine(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastTick < TICK_INTERVAL_MS) return false;
  if (running) return false;

  running = (async () => {
    try {
      await ensureDbReady();
      lastTick = Date.now();

      const wave = Math.sin(now / 45_000) * 30;
      const traffic = Math.max(30, Math.round(260 + wave * 3 + Math.random() * 60));
      const threats = Math.max(0, Math.round(4 + wave / 6 + Math.random() * 9));
      const blocked = Math.max(0, Math.round(threats * (0.6 + Math.random() * 0.4)));
      const scans = Math.max(0, Math.round(Math.random() * 6));

      await db.insert(metricPoints).values([
        { series: "traffic", value: traffic },
        { series: "threats", value: threats },
        { series: "blocked", value: blocked },
        { series: "scans", value: scans },
      ]);

      // حذف النقاط الأقدم من 24 ساعة للحفاظ على حجم الجدول.
      await db.delete(metricPoints).where(
        sql`${metricPoints.recordedAt} < now() - interval '24 hours'`,
      );

      // تحديث حالة الأجهزة (حمل المعالج والحالة).
      const deviceRows = await db.select({ id: devices.id, status: devices.status, cpuLoad: devices.cpuLoad }).from(devices);
      for (const device of deviceRows) {
        const nextLoad = Math.max(2, Math.min(99, device.cpuLoad + Math.round((Math.random() - 0.5) * 18)));
        let nextStatus = device.status;
        if (device.status === "online" && Math.random() < 0.03) nextStatus = "offline";
        else if (device.status === "offline" && Math.random() < 0.12) nextStatus = "online";
        if (nextStatus === "quarantined" && Math.random() < 0.05) nextStatus = "online";
        await db
          .update(devices)
          .set({ cpuLoad: nextLoad, status: nextStatus, lastSeenAt: new Date() })
          .where(eq(devices.id, device.id));
      }

      // توليد تنبيه جديد باحتمال مرتبط بحجم التهديدات الحالية.
      if (threats > 8 && Math.random() < 0.35) {
        const template = LIVE_TEMPLATES[Math.floor(Math.random() * LIVE_TEMPLATES.length)]!;
        const deviceName = deviceRows.length > 0 ? await randomDeviceName() : null;
        await db.insert(alerts).values({
          type: template.type,
          title: template.title,
          description: template.description,
          severity: template.severity,
          status: "new",
          sourceIp: `${20 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`,
          target: ["الجدار الناري", "خادم الملفات", "بوابة المصادقة", "تطبيق الويب", "موزع الأحمال"][Math.floor(Math.random() * 5)],
          deviceName,
          riskScore: Math.max(5, Math.min(100, template.risk + Math.round((Math.random() - 0.5) * 14))),
          detectedAt: new Date(),
        });
      }

      // إغلاق التنبيهات القديمة جداً تلقائياً (محاكاة الاستجابة الذاتية).
      await db
        .update(alerts)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedByName: "الاستجابة الآلية",
          resolutionNote: "تم الاحتواء تلقائياً بواسطة محرك الاستجابة بعد زوال النشاط المشبوه.",
        })
        .where(and(eq(alerts.status, "new"), sql`${alerts.detectedAt} < now() - interval '6 days'`));
    } catch (error) {
      console.error("[simulator] تعذر تنفيذ دورة المحرك:", error);
    } finally {
      running = null;
    }
  })();

  await running;
  return true;
}

async function randomDeviceName(): Promise<string | null> {
  const rows = await db
    .select({ name: devices.name })
    .from(devices)
    .orderBy(sql`random()`)
    .limit(1);
  return rows[0]?.name ?? null;
}


