/**
 * ============================================================================
 *  إقلاع قاعدة البيانات (Bootstrap) — إنشاء الجداول + البيانات الأولية
 * ============================================================================
 *  يعمل بشكل idempotent: يمكن استدعاؤه مرات عديدة دون أي أثر جانبي.
 *  يُستدعى تلقائياً قبل أي عملية على قاعدة البيانات عبر `ensureDbReady()`،
 *  كما يمكن تطبيق المخطط يدوياً بالأمر: npx drizzle-kit push
 */
import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { sql } from "drizzle-orm";

let readyPromise: Promise<void> | null = null;

/** تأكد من أن المخطط والبيانات الأولية جاهزة (مرة واحدة لكل عملية تشغيل). */
export function ensureDbReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = runBootstrap().catch((error) => {
      // إعادة المحاولة لاحقاً عند الفشل المؤقت (مثل عدم توفر القاعدة بعد).
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function runBootstrap(): Promise<void> {
  await createSchema();
  await seedIfEmpty();
}

/* -------------------------------------------------------------------------- */
/*                                  إنشاء المخطط                               */
/* -------------------------------------------------------------------------- */

/**
 * إنشاء نوع تعداد بأمان (يتجاهل الخطأ إذا كان موجوداً مسبقاً).
 * ملاحظة: كتل DO في PostgreSQL لا تقبل المعاملات (parameters)، لذلك تُدمج
 * القيم كنصوص SQL ثابتة — وكلها قيم مُعرَّفة داخلياً في هذا الملف وليست
 * مدخلات مستخدم، فلا يوجد أي خطر حقن.
 */
const enumStatement = (name: string, values: string[]) =>
  sql.raw(
    `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${values
      .map((value) => `'${value.replace(/'/g, "''")}'`)
      .join(", ")}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );

async function createSchema(): Promise<void> {
  // 1) التعدادات (Enums)
  await db.execute(enumStatement("user_role", ["admin", "supervisor", "user"]));
  await db.execute(enumStatement("user_status", ["active", "suspended"]));
  await db.execute(
    enumStatement("severity_level", ["low", "medium", "high", "critical"]),
  );
  await db.execute(
    enumStatement("alert_status", ["new", "investigating", "resolved", "false_positive"]),
  );
  await db.execute(enumStatement("file_verdict", ["clean", "suspicious", "malicious"]));
  await db.execute(enumStatement("audit_status", ["success", "failure", "blocked"]));
  await db.execute(enumStatement("device_status", ["online", "offline", "quarantined"]));
  await db.execute(enumStatement("report_period", ["daily", "weekly", "monthly"]));

  // 2) الجداول
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar(48) NOT NULL UNIQUE,
      email varchar(160) NOT NULL UNIQUE,
      full_name varchar(120) NOT NULL,
      password_hash text NOT NULL,
      role user_role NOT NULL DEFAULT 'user',
      status user_status NOT NULL DEFAULT 'active',
      department varchar(80),
      failed_attempts integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      last_login_at timestamptz,
      last_login_ip varchar(64),
      must_change_password boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      username varchar(48),
      category varchar(32) NOT NULL,
      action varchar(64) NOT NULL,
      description text NOT NULL,
      status audit_status NOT NULL DEFAULT 'success',
      ip varchar(64),
      user_agent text,
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      stored_name varchar(200) NOT NULL,
      original_name varchar(255) NOT NULL,
      mime_type varchar(120) NOT NULL,
      extension varchar(24) NOT NULL,
      size_bytes integer NOT NULL,
      sha256 varchar(64) NOT NULL,
      verdict file_verdict NOT NULL DEFAULT 'clean',
      threat_score integer NOT NULL DEFAULT 0,
      classification varchar(40) NOT NULL DEFAULT 'عام',
      sensitivity varchar(24) NOT NULL DEFAULT 'عام',
      scan_report jsonb,
      quarantined boolean NOT NULL DEFAULT false,
      download_count integer NOT NULL DEFAULT 0,
      uploaded_by_id uuid,
      uploaded_by_name varchar(120),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS file_contents (
      file_id uuid PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      data bytea NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type varchar(48) NOT NULL,
      title varchar(180) NOT NULL,
      description text NOT NULL,
      severity severity_level NOT NULL DEFAULT 'low',
      status alert_status NOT NULL DEFAULT 'new',
      source_ip varchar(64),
      target varchar(120),
      device_name varchar(120),
      risk_score integer NOT NULL DEFAULT 0,
      detected_at timestamptz NOT NULL DEFAULT now(),
      resolved_by_id uuid,
      resolved_by_name varchar(120),
      resolved_at timestamptz,
      resolution_note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(120) NOT NULL,
      type varchar(32) NOT NULL,
      ip_address varchar(64) NOT NULL,
      mac_address varchar(32),
      os varchar(80),
      location varchar(120),
      status device_status NOT NULL DEFAULT 'online',
      risk_score integer NOT NULL DEFAULT 0,
      patches_up_to_date boolean NOT NULL DEFAULT true,
      encryption_enabled boolean NOT NULL DEFAULT true,
      cpu_load integer NOT NULL DEFAULT 0,
      owner_id uuid,
      owner_name varchar(120),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title varchar(200) NOT NULL,
      period report_period NOT NULL DEFAULT 'weekly',
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      summary text NOT NULL,
      metrics jsonb NOT NULL,
      generated_by_id uuid,
      generated_by_name varchar(120),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS metric_points (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      series varchar(32) NOT NULL,
      value integer NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // 3) الفهارس (تسريع الاستعلامات المتكررة في اللوحات)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs (category)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_alerts_detected ON alerts (detected_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_files_created ON files (created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_files_sha ON files (sha256)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_metric_series ON metric_points (series, recorded_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status)`);
}

/* -------------------------------------------------------------------------- */
/*                                 البيانات الأولية                            */
/* -------------------------------------------------------------------------- */

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const int = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const ALERT_TEMPLATES = [
  {
    type: "brute_force",
    title: "محاولة دخول متكررة على حساب إداري",
    description: "تم رصد 42 محاولة دخول فاشلة من نفس العنوان خلال 3 دقائق.",
    severity: "high",
    target: "بوابة المصادقة",
  },
  {
    type: "malware",
    title: "ملف يحمل توقيع برمجية خبيثة",
    description: "محرك الفحص رصد توقيع Trojan.Generik داخل ملف تنفيذي مرفوع.",
    severity: "critical",
    target: "خادم الملفات",
  },
  {
    type: "phishing",
    title: "رسالة تصيّد تستهدف قسم المالية",
    description: "رابط مشبوه يحاكي نطاق المؤسسة ورد إلى 7 صناديق بريدية.",
    severity: "high",
    target: "البريد الإلكتروني",
  },
  {
    type: "port_scan",
    title: "مسح منافذ من مصدر خارجي",
    description: "تم فحص 1024 منفذاً على الجدار الناري خلال 90 ثانية.",
    severity: "medium",
    target: "الجدار الناري",
  },
  {
    type: "ddos",
    title: "ذروة طلبات غير اعتيادية",
    description: "ارتفاع مفاجئ في الطلبات بمعدل 8× عن الخط الأساسي.",
    severity: "critical",
    target: "موزع الأحمال",
  },
  {
    type: "data_exfiltration",
    title: "نقل بيانات خارج الشبكة",
    description: "رفع 1.2 جيجابايت إلى نطاق غير مصنف ضمن القائمة البيضاء.",
    severity: "high",
    target: "بوابة الإنترنت",
  },
  {
    type: "unauthorized_access",
    title: "محاولة وصول إلى منطقة محظورة",
    description: "مستخدم بصلاحيات محدودة حاول الوصول إلى لوحة إدارة المستخدمين.",
    severity: "medium",
    target: "واجهة الإدارة",
  },
  {
    type: "weak_policy",
    title: "جهاز بدون تشفير القرص",
    description: "جهاز workstation-14 لا يطبق تشفير BitLocker وفق السياسة.",
    severity: "low",
    target: "إدارة الأصول",
  },
  {
    type: "ransomware",
    title: "سلوك تشفير جماعي للملفات",
    description: "تعديل 3000 ملف بامتداد غير معروف خلال دقيقة واحدة.",
    severity: "critical",
    target: "خادم الملفات",
  },
  {
    type: "sql_injection",
    title: "محاولة حقن SQL في نموذج البحث",
    description: "حمولة تحتوي UNION SELECT تم اعتراضها بواسطة فلتر المدخلات.",
    severity: "high",
    target: "تطبيق الويب",
  },
] as const;

const DEVICE_SEED = [
  { name: "خادم التطبيقات الرئيسي", type: "server", ip: "10.10.1.5", os: "Ubuntu 24.04 LTS", location: "مركز البيانات - الرف A1" },
  { name: "قاعدة بيانات PostgreSQL", type: "server", ip: "10.10.1.6", os: "Debian 12", location: "مركز البيانات - الرف A2" },
  { name: "الجدار الناري Edge-01", type: "router", ip: "10.10.0.1", os: "pfSense 2.8", location: "غرفة الشبكات" },
  { name: "موزع الأحمال LB-01", type: "router", ip: "10.10.0.2", os: "HAProxy Appliance", location: "غرفة الشبكات" },
  { name: "محطة عمل - المالية 03", type: "workstation", ip: "10.10.20.13", os: "Windows 11 Pro", location: "الطابق الثاني - قسم المالية" },
  { name: "محطة عمل - الموارد البشرية", type: "workstation", ip: "10.10.20.21", os: "Windows 11 Pro", location: "الطابق الثالث" },
  { name: "كاميرا مراقبة - المدخل", type: "camera", ip: "10.10.30.8", os: "Firmware 4.2", location: "المدخل الرئيسي" },
  { name: "طابعة الشبكة HP-400", type: "iot", ip: "10.10.30.22", os: "Embedded Linux", location: "الطابق الأول" },
  { name: "حاسوب محمول - المدير التقني", type: "mobile", ip: "10.10.40.5", os: "macOS 15", location: "متنقل" },
  { name: "خادم النسخ الاحتياطي", type: "server", ip: "10.10.1.9", os: "Rocky Linux 9", location: "مركز البيانات - الرف B1" },
] as const;

/** عدد الصفوف في جدول (للبذر الانتقائي). */
async function tableCount(table: string): Promise<number> {
  const result = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM ${table}`));
  const rows = (result as unknown as { rows?: { count: number }[] }).rows ?? [];
  return Number(rows[0]?.count ?? 0);
}

type SeedActor = { id: string; username: string; fullName: string; role: string };

async function seedIfEmpty(): Promise<void> {
  /* --- 1) الحسابات الافتراضية (كلمات المرور مشفّرة بـ bcrypt) --- */
  const accounts = [
    {
      username: "admin",
      email: "admin@deraa.security",
      fullName: "مدير النظام",
      password: "Admin@12345",
      role: "admin" as const,
      department: "تقنية المعلومات",
    },
    {
      username: "supervisor",
      email: "supervisor@deraa.security",
      fullName: "مشرف الأمن السيبراني",
      password: "Super@12345",
      role: "supervisor" as const,
      department: "الأمن السيبراني",
    },
    {
      username: "user",
      email: "user@deraa.security",
      fullName: "محلل عمليات",
      password: "User@12345",
      role: "user" as const,
      department: "مركز العمليات",
    },
  ];

  const createdUsers: SeedActor[] = [];
  if ((await tableCount("users")) > 0) {
    // الحسابات موجودة مسبقاً — نكتفي بقراءتها للربط بالبيانات الأولية.
    const result = await db.execute(
      sql`SELECT id, username, full_name AS "fullName", role FROM users ORDER BY created_at ASC LIMIT 10`,
    );
    const existingRows = (result as unknown as { rows?: SeedActor[] }).rows ?? [];
    createdUsers.push(
      ...existingRows.map((row) => ({
        id: row.id,
        username: row.username,
        fullName: row.fullName,
        role: String(row.role),
      })),
    );
  }

  const accountsToCreate = createdUsers.length > 0 ? [] : accounts;
  for (const account of accountsToCreate) {
    const passwordHash = await hash(account.password, 12);
    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO users (username, email, full_name, password_hash, role, department, last_login_at)
      VALUES (${account.username}, ${account.email}, ${account.fullName}, ${passwordHash},
              ${account.role}::user_role, ${account.department}, now() - interval '2 hours')
      RETURNING id
    `);
    const idRows = (inserted as unknown as { rows?: { id: string }[] }).rows ?? [];
    createdUsers.push({
      id: idRows[0]?.id ?? randomUUID(),
      username: account.username,
      fullName: account.fullName,
      role: account.role,
    });
  }
  // ممثل لكل دور مع بديل آمن (يضمن عدم فشل البذر بأي ترتيب حسابات).
  const fallbackActor: SeedActor = createdUsers[0] ?? { id: "", username: "system", fullName: "النظام", role: "admin" };
  const admin = createdUsers.find((row) => row.role === "admin") ?? fallbackActor;
  const supervisor = createdUsers.find((row) => row.role === "supervisor") ?? admin;
  const analyst = createdUsers.find((row) => row.role === "user") ?? supervisor;

  /* --- 2) الأجهزة/الأصول (تُبذر فقط إذا كان الجدول فارغاً) --- */
  const seedDevices = (await tableCount("devices")) === 0;
  for (const device of DEVICE_SEED) {
    if (!seedDevices) break;
    const status = Math.random() > 0.85 ? (Math.random() > 0.5 ? "offline" : "quarantined") : "online";
    const mac = `00:1A:2B:${int(10, 99)}:${int(10, 99)}:${int(10, 99)}`;
    await db.execute(sql`
      INSERT INTO devices (name, type, ip_address, mac_address, os, location, status, risk_score,
                           patches_up_to_date, encryption_enabled, cpu_load, owner_id, owner_name, last_seen_at)
      VALUES (${device.name}, ${device.type}, ${device.ip},
              ${mac},
              ${device.os}, ${device.location}, ${status}::device_status, ${int(4, 78)},
              ${Math.random() > 0.25}, ${Math.random() > 0.2}, ${int(5, 88)},
              ${admin.id}, ${pick(["فريق البنية التحتية", "قسم المالية", "الأمن السيبراني"])},
              now() - (${int(1, 120)} || ' minutes')::interval)
    `);
  }

  /* --- 3) تنبيهات تاريخية خلال آخر 7 أيام --- */
  const seedAlerts = (await tableCount("alerts")) === 0;
  for (let i = 0; seedAlerts && i < 46; i += 1) {
    const template = pick(ALERT_TEMPLATES);
    const hoursAgo = int(1, 168);
    const resolved = Math.random() > 0.45;
    const sourceIp = `${int(11, 220)}.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`;
    const severityRank = { low: 25, medium: 50, high: 75, critical: 95 } as const;
    await db.execute(sql`
      INSERT INTO alerts (type, title, description, severity, status, source_ip, target, device_name,
                          risk_score, detected_at, resolved_by_id, resolved_by_name, resolved_at, resolution_note)
      VALUES (${template.type}, ${template.title}, ${template.description},
              ${template.severity}::severity_level,
              ${resolved ? (Math.random() > 0.2 ? "resolved" : "false_positive") : pick(["new", "investigating"])}::alert_status,
              ${sourceIp},
              ${template.target}, ${pick(DEVICE_SEED).name},
              ${severityRank[template.severity as keyof typeof severityRank] + int(-12, 5)},
              now() - (${hoursAgo} || ' hours')::interval,
              ${resolved ? supervisor.id : null}, ${resolved ? supervisor.fullName : null},
              ${resolved ? sql`now() - ((${hoursAgo} - 1) || ' hours')::interval` : null},
              ${resolved ? "تم احتواء التهديد وتطبيق قواعد المنع على الجدار الناري." : null})
    `);
  }

  /* --- 4) سجل عمليات تاريخي --- */
  const seedAudit = (await tableCount("audit_logs")) === 0;
  const historyActions = [
    { category: "auth", action: "LOGIN_SUCCESS", description: "تسجيل دخول ناجح إلى المنصة", status: "success" },
    { category: "auth", action: "LOGIN_FAILED", description: "محاولة دخول بكلمة مرور غير صحيحة", status: "failure" },
    { category: "auth", action: "LOGOUT", description: "تسجيل خروج من المنصة", status: "success" },
    { category: "files", action: "FILE_UPLOAD", description: "رفع ملف جديد وخضع للفحص الأمني", status: "success" },
    { category: "files", action: "FILE_BLOCKED", description: "منع رفع ملف بعد اكتشاف تهديد", status: "blocked" },
    { category: "alerts", action: "ALERT_RESOLVE", description: "إغلاق تنبيه أمني بعد المعالجة", status: "success" },
    { category: "devices", action: "DEVICE_QUARANTINE", description: "عزل جهاز مشتبه به عن الشبكة", status: "success" },
    { category: "users", action: "USER_CREATE", description: "إنشاء حساب مستخدم جديد", status: "success" },
    { category: "reports", action: "REPORT_GENERATE", description: "توليد تقرير أمني دوري", status: "success" },
  ] as const;

  for (let i = 0; seedAudit && i < 90; i += 1) {
    const entry = pick(historyActions);
    const actor = pick([admin, supervisor, analyst]);
    const actorIp = `10.10.${int(1, 60)}.${int(2, 250)}`;
    await db.execute(sql`
      INSERT INTO audit_logs (user_id, username, category, action, description, status, ip, user_agent, meta, created_at)
      VALUES (${actor.id}, ${actor.username}, ${entry.category}, ${entry.action}, ${entry.description},
              ${entry.status}::audit_status,
              ${actorIp},
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
              ${JSON.stringify({ source: "seed" })}::jsonb,
              now() - (${int(1, 4000)} || ' minutes')::interval)
    `);
  }

  /* --- 5) عينات ملفات مفحوصة (بدون محتوى ثنائي) --- */
  const seedFiles = (await tableCount("files")) === 0;
  const sampleFiles = [
    { name: "تقرير-الأرباح-Q3.xlsx", mime: "application/vnd.ms-excel", ext: "xlsx", verdict: "clean", score: 2, cls: "مالي", sens: "سري" },
    { name: "سياسة-أمن-المعلومات.pdf", mime: "application/pdf", ext: "pdf", verdict: "clean", score: 0, cls: "تقني", sens: "خاص" },
    { name: "backup-config.zip", mime: "application/zip", ext: "zip", verdict: "suspicious", score: 58, cls: "تقني", sens: "سري" },
    { name: "invoice-scan.exe", mime: "application/octet-stream", ext: "exe", verdict: "malicious", score: 97, cls: "عام", sens: "سري" },
    { name: "سجلات-الموظفين.csv", mime: "text/csv", ext: "csv", verdict: "clean", score: 6, cls: "شخصي", sens: "خاص" },
    { name: "عقد-مورد-خارجي.docx", mime: "application/vnd.openxmlformats", ext: "docx", verdict: "suspicious", score: 41, cls: "عقود", sens: "سري" },
  ] as const;

  for (const file of sampleFiles) {
    if (!seedFiles) break;
    const payload = Buffer.from(`محتوى تجريبي للملف ${file.name} — تم توليده أثناء التهيئة.`);
    const storedName = `${randomUUID()}.${file.ext}`;
    await db.execute(sql`
      INSERT INTO files (stored_name, original_name, mime_type, extension, size_bytes, sha256, verdict,
                         threat_score, classification, sensitivity, scan_report, quarantined,
                         uploaded_by_id, uploaded_by_name, created_at)
      VALUES (${storedName}, ${file.name}, ${file.mime}, ${file.ext}, ${payload.length},
              ${createHash("sha256").update(payload).digest("hex")},
              ${file.verdict}::file_verdict, ${file.score}, ${file.cls}, ${file.sens},
              ${JSON.stringify({ engine: "DERAA-Heuristic v2", rules: file.verdict === "clean" ? [] : ["تطابق قاعدة سلوكية"] })}::jsonb,
              ${file.verdict !== "clean"},
              ${supervisor.id}, ${supervisor.fullName},
              now() - (${int(30, 9000)} || ' minutes')::interval)
    `);
  }

  /* --- 6) نقاط المؤشرات الحية لآخر 60 دقيقة --- */
  const seedMetrics = (await tableCount("metric_points")) === 0;
  for (let minutes = 60; seedMetrics && minutes >= 0; minutes -= 1) {
    const wave = Math.sin(minutes / 7) * 18;
    await db.execute(sql`
      INSERT INTO metric_points (series, value, recorded_at) VALUES
        ('traffic', ${Math.max(20, Math.round(240 + wave * 4 + int(-25, 25)))}, now() - (${minutes} || ' minutes')::interval),
        ('threats', ${Math.max(0, Math.round(6 + wave / 3 + int(-3, 5)))}, now() - (${minutes} || ' minutes')::interval),
        ('blocked', ${Math.max(0, Math.round(14 + wave / 2 + int(-4, 6)))}, now() - (${minutes} || ' minutes')::interval),
        ('scans',   ${Math.max(0, Math.round(3 + int(0, 4)))}, now() - (${minutes} || ' minutes')::interval)
    `);
  }

  /* --- 7) قيد إنشاء الحسابات في سجل التدقيق --- */
  if (seedAudit) await db.execute(sql`
    INSERT INTO audit_logs (user_id, username, category, action, description, status, ip, user_agent, meta)
    VALUES (${admin.id}, 'system', 'system', 'SYSTEM_SEED',
            'تهيئة قاعدة البيانات وإنشاء الحسابات الافتراضية والبيانات الأولية', 'success',
            '127.0.0.1', 'bootstrap', ${JSON.stringify({ seeded: true })}::jsonb)
  `);
}
