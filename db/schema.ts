/**
 * ============================================================================
 *  مخطط قاعدة البيانات — نظام «دِرْع» للأمن السيبراني والإدارة الذكية
 * ============================================================================
 *  يعتمد على Drizzle ORM مع PostgreSQL.
 *  كل جدول موثّق بالكامل لتسهيل التطوير لاحقاً.
 *  لتطبيق التغييرات يدوياً:  npx drizzle-kit push
 *  (يتم أيضاً تطبيقها تلقائياً عند الإقلاع عبر src/db/bootstrap.ts)
 */
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*                              أنواع الأعمدة المخصصة                          */
/* -------------------------------------------------------------------------- */

/** عمود ثنائي (bytea) لتخزين محتوى الملفات المرفوعة داخل قاعدة البيانات. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: Buffer): Buffer {
    return value;
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
});

/* -------------------------------------------------------------------------- */
/*                                   التعدادات                                 */
/* -------------------------------------------------------------------------- */

/** أدوار الصلاحيات: مدير النظام / مشرف أمني / مستخدم. */
export const userRoleEnum = pgEnum("user_role", ["admin", "supervisor", "user"]);

/** حالة الحساب. */
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

/** مستوى الخطورة الموحد في المنصة. */
export const severityEnum = pgEnum("severity_level", ["low", "medium", "high", "critical"]);

/** دورة حياة التنبيه الأمني. */
export const alertStatusEnum = pgEnum("alert_status", [
  "new",
  "investigating",
  "resolved",
  "false_positive",
]);

/** نتيجة الفحص الأمني للملفات. */
export const fileVerdictEnum = pgEnum("file_verdict", ["clean", "suspicious", "malicious"]);

/** حالة العملية في سجل التدقيق. */
export const auditStatusEnum = pgEnum("audit_status", ["success", "failure", "blocked"]);

/** حالة الجهاز/الأصل المرتبط بالشبكة. */
export const deviceStatusEnum = pgEnum("device_status", ["online", "offline", "quarantined"]);

/** دورية التقرير الأمني. */
export const reportPeriodEnum = pgEnum("report_period", ["daily", "weekly", "monthly"]);

/* -------------------------------------------------------------------------- */
/*                                   المستخدمون                                */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 48 }).notNull().unique(),
  email: varchar("email", { length: 160 }).notNull().unique(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  /** كلمة المرور مخزّنة بتشفير bcrypt (لا تُخزَّن أبداً كنص صريح). */
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("active"),
  department: varchar("department", { length: 80 }),
  /** عداد محاولات الدخول الفاشلة — يُستخدم في قفل الحساب. */
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: varchar("last_login_ip", { length: 64 }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*                                سجل العمليات (تدقيق)                         */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  username: varchar("username", { length: 48 }),
  /** تصنيف العملية: auth | files | alerts | users | devices | reports | system */
  category: varchar("category", { length: 32 }).notNull(),
  /** رمز العملية: LOGIN_SUCCESS, FILE_UPLOAD, USER_CREATE ... */
  action: varchar("action", { length: 64 }).notNull(),
  /** وصف عربي مقروء يظهر في الواجهة. */
  description: text("description").notNull(),
  status: auditStatusEnum("status").notNull().default("success"),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  /** بيانات إضافية منظمة (معرف الهدف، القيم السابقة/الجديدة ...). */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*                          الملفات والفحص الأمني                             */
/* -------------------------------------------------------------------------- */

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** الاسم المخزّن (معرف فريد) لمنع تجاوز المسارات. */
  storedName: varchar("stored_name", { length: 200 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  extension: varchar("extension", { length: 24 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** بصمة SHA-256 للملف — للكشف عن التكرار والملفات المعروفة. */
  sha256: varchar("sha256", { length: 64 }).notNull(),
  verdict: fileVerdictEnum("verdict").notNull().default("clean"),
  /** درجة التهديد من 0 إلى 100. */
  threatScore: integer("threat_score").notNull().default(0),
  /** التصنيف التلقائي للمحتوى: مالي | شخصي | طبي | تقني | عقود | عام */
  classification: varchar("classification", { length: 40 }).notNull().default("عام"),
  /** مستوى الحساسية: سري | خاص | عام */
  sensitivity: varchar("sensitivity", { length: 24 }).notNull().default("عام"),
  /** نتائج الفحص التفصيلية (القواعد التي تطابقت، النوع الحقيقي ...). */
  scanReport: jsonb("scan_report"),
  quarantined: boolean("quarantined").notNull().default(false),
  downloadCount: integer("download_count").notNull().default(0),
  uploadedById: uuid("uploaded_by_id"),
  uploadedByName: varchar("uploaded_by_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** محتوى الملف الفعلي (معزول في جدول مستقل حتى لا يُجلب مع القوائم). */
export const fileContents = pgTable("file_contents", {
  fileId: uuid("file_id")
    .primaryKey()
    .references(() => files.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/* -------------------------------------------------------------------------- */
/*                                التنبيهات الأمنية                            */
/* -------------------------------------------------------------------------- */

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** نوع التهديد: brute_force | malware | phishing | ddos | ... */
  type: varchar("type", { length: 48 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  severity: severityEnum("severity").notNull().default("low"),
  status: alertStatusEnum("status").notNull().default("new"),
  sourceIp: varchar("source_ip", { length: 64 }),
  target: varchar("target", { length: 120 }),
  deviceName: varchar("device_name", { length: 120 }),
  /** نقطة الخطورة المحسوبة آلياً 0-100. */
  riskScore: integer("risk_score").notNull().default(0),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedById: uuid("resolved_by_id"),
  resolvedByName: varchar("resolved_by_name", { length: 120 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*                       الأجهزة / الأصول (الإدارة الذكية)                     */
/* -------------------------------------------------------------------------- */

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  /** النوع: server | workstation | router | camera | iot | mobile */
  type: varchar("type", { length: 32 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }).notNull(),
  macAddress: varchar("mac_address", { length: 32 }),
  os: varchar("os", { length: 80 }),
  location: varchar("location", { length: 120 }),
  status: deviceStatusEnum("status").notNull().default("online"),
  /** درجة الخطورة المحسوبة آلياً من التنبيهات وحالة التحديثات. */
  riskScore: integer("risk_score").notNull().default(0),
  patchesUpToDate: boolean("patches_up_to_date").notNull().default(true),
  encryptionEnabled: boolean("encryption_enabled").notNull().default(true),
  cpuLoad: integer("cpu_load").notNull().default(0),
  ownerId: uuid("owner_id"),
  ownerName: varchar("owner_name", { length: 120 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*                              التقارير الأمنية الدورية                        */
/* -------------------------------------------------------------------------- */

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  period: reportPeriodEnum("period").notNull().default("weekly"),
  /** بداية ونهاية الفترة التي يغطيها التقرير. */
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  /** الملخص التنفيذي العربي. */
  summary: text("summary").notNull(),
  /** كل المؤشرات الرقمية للتقرير (تهديدات، ملفات، دخول، أجهزة ...). */
  metrics: jsonb("metrics").notNull(),
  generatedById: uuid("generated_by_id"),
  generatedByName: varchar("generated_by_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*                            مؤشرات حية (سلاسل زمنية)                          */
/* -------------------------------------------------------------------------- */

/**
 * نقاط زمنية تُغذّي الرسوم البيانية الحية (حركة مرور، محاولات هجوم، حزم ممنوعة).
 * يولّدها «محرك المحاكاة» في src/lib/simulator.ts عند الطلب.
 */
export const metricPoints = pgTable("metric_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** التصنيف: traffic | threats | blocked | scans */
  series: varchar("series", { length: 32 }).notNull(),
  value: integer("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
