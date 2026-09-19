/**
 * ============================================================================
 *  محرك الفحص الأمني للملفات (DERAA-Heuristic)
 * ============================================================================
 *  يمر كل ملف مرفوع بالمراحل التالية:
 *    1) التحقق من الحجم والامتداد (قوائم السماح/المنع).
 *    2) اكتشاف النوع الحقيقي عبر البايتات السحرية (Magic Bytes) — لكشف
 *       انتحال الامتداد (مثال: ملف تنفيذي باسم .pdf).
 *    3) فحص المحتوى مقابل قواعد توقيع وسلوك (EICAR، سكربتات، وحدات ماكرو،
 *       حمولات حقن، أوامر نظام خطرة).
 *    4) حساب درجة التهديد 0-100 وإصدار الحكم: سليم / مشبوه / ضار.
 *    5) التصنيف التلقائي للمحتوى وتحديد مستوى الحساسية.
 *  النتيجة الكاملة تُخزَّن في scan_report لعرضها للمستخدم والتدقيق.
 */
import { createHash } from "node:crypto";

export const SCANNER_VERSION = "DERAA-Heuristic v2.4";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 ميجابايت

/** امتدادات محظورة نهائياً (قابلة للتنفيذ). */
export const BLOCKED_EXTENSIONS = [
  "exe", "bat", "cmd", "com", "scr", "msi", "msp", "dll", "sys", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "ps1", "psm1", "psd1", "sh", "bash", "jar", "apk",
  "app", "bin", "cgi", "reg", "lnk", "hta", "cpl", "inf", "iso",
];

/** امتدادات مسموحة صراحة. */
export const ALLOWED_EXTENSIONS = [
  "pdf", "txt", "md", "csv", "json", "xml", "log", "png", "jpg", "jpeg", "gif",
  "webp", "svg", "zip", "docx", "doc", "xlsx", "xls", "pptx", "mp3", "mp4", "yaml", "yml",
];

export type Detection = {
  rule: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  points: number;
};

export type ScanResult = {
  verdict: "clean" | "suspicious" | "malicious";
  threatScore: number;
  detections: Detection[];
  realType: string;
  extensionMismatch: boolean;
  classification: string;
  sensitivity: string;
  sha256: string;
  engine: string;
  scannedAt: string;
  durationMs: number;
};

/** خريطة البايتات السحرية لاكتشاف النوع الحقيقي. */
const MAGIC_SIGNATURES: { name: string; bytes: number[]; offset?: number; mask?: number }[] = [
  { name: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { name: "ZIP/DOCX/XLSX", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF", bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "GZIP", bytes: [0x1f, 0x8b] },
  { name: "RAR", bytes: [0x52, 0x61, 0x72, 0x21] },
  { name: "7Z", bytes: [0x37, 0x7a, 0xbc, 0xaf] },
  { name: "OLE2 (DOC/XLS قديم)", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { name: "ELF (تنفيذي لينكس)", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: "PE (تنفيذي ويندوز)", bytes: [0x4d, 0x5a] }, // MZ
  { name: "CLASS (جافا)", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: "BZIP2", bytes: [0x42, 0x5a, 0x68] },
];

/** قواعد الفحص السلوكي/التوقيعي على المحتوى. */
const CONTENT_RULES: { rule: string; pattern: RegExp; severity: Detection["severity"]; detail: string; points: number }[] = [
  {
    rule: "EICAR-TEST",
    pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR/i,
    severity: "critical",
    detail: "تطابق مع سلسلة اختبار EICAR المعيارية للبرمجيات الخبيثة.",
    points: 100,
  },
  {
    rule: "PE-BASE64-PAYLOAD",
    pattern: /TVqQAAMAAAAEAAAA|This program cannot be run in DOS mode/i,
    severity: "critical",
    detail: "ملف تنفيذي (PE) مضمّن أو مرمّز داخل المحتوى.",
    points: 85,
  },
  {
    rule: "SCRIPT-TAG",
    pattern: /<script[\s>]|javascript:|on(error|load|click)\s*=/i,
    severity: "high",
    detail: "سكربت مضمّن قد يُستخدم في هجمات XSS.",
    points: 45,
  },
  {
    rule: "EVAL-OBFUSCATION",
    pattern: /\beval\s*\(|base64_decode|atob\s*\(|fromCharCode|String\.raw/i,
    severity: "high",
    detail: "تعليمات تعتيم/تنفيذ ديناميكي شائعة في الحمولات الخبيثة.",
    points: 50,
  },
  {
    rule: "POWERSHELL-DOWNLOAD",
    pattern: /Invoke-WebRequest|Invoke-Expression|powershell(\.exe)?\s+-e|certutil\s+-urlcache|bitsadmin/i,
    severity: "critical",
    detail: "أوامر تنزيل/تشغيل عن بُعد عبر PowerShell أو أدوات النظام.",
    points: 80,
  },
  {
    rule: "OFFICE-MACRO",
    pattern: /Sub\s+Auto_Open|ThisDocument\.|CreateObject\s*\(\s*"WScript|Attribute\s+VB_Name/i,
    severity: "high",
    detail: "وحدة ماكرو في مستند Office قادرة على تنفيذ أوامر.",
    points: 65,
  },
  {
    rule: "SQL-INJECTION",
    pattern: /union\s+select|or\s+1=1|--\s*$|;\s*drop\s+table|sleep\s*\(\s*\d+\s*\)/im,
    severity: "medium",
    detail: "نمط حقن SQL داخل محتوى نصي.",
    points: 40,
  },
  {
    rule: "DESTRUCTIVE-COMMAND",
    pattern: /rm\s+-rf\s+\/|del\s+\/[sqf]|format\s+[a-z]:/i,
    severity: "high",
    detail: "أمر تدميري يستهدف حذف البيانات.",
    points: 70,
  },
  {
    rule: "CREDENTIAL-DUMP",
    pattern: /mimikatz|sekurlsa|lsass\.dmp|NTDS\.dit|hashdump/i,
    severity: "critical",
    detail: "أدوات سرقة بيانات الاعتماد.",
    points: 90,
  },
  {
    rule: "NULL-BYTES",
    pattern: /\u0000/,
    severity: "medium",
    detail: "بايتات فارغة تُستخدم لإخفاء الامتداد الحقيقي.",
    points: 25,
  },
];

/** قواعد التصنيف التلقائي للمحتوى. */
const CLASSIFICATION_RULES: { label: string; keywords: RegExp; sensitivity?: string }[] = [
  { label: "مالي", keywords: /فاتورة|ميزانية|رواتب|راتب|حساب بنكي|IBAN|invoice|budget|payment|revenue|قوائم مالية/i, sensitivity: "سري" },
  { label: "شخصي", keywords: /رقم الهوية|جواز سفر|هاتف|عنوان السكن|national id|passport|ssn|بيانات شخصية/i, sensitivity: "سري" },
  { label: "طبي", keywords: /تقرير طبي|تشخيص|وصفة|مريض|medical|diagnosis|patient/i, sensitivity: "سري" },
  { label: "عقود", keywords: /عقد|اتفاقية|بند|طرف أول|طرف ثان|contract|agreement|terms/i, sensitivity: "خاص" },
  { label: "تقني", keywords: /server|database|config|api|log|network|firewall|خادم|قاعدة بيانات|شبكة|إعدادات/i, sensitivity: "خاص" },
  { label: "موارد بشرية", keywords: /موظف|إجازة|تقييم أداء|employee|hr|leave/i, sensitivity: "خاص" },
];

/** اكتشاف النوع الحقيقي من البايتات الأولى. */
export function detectRealType(buffer: Buffer): string {
  for (const signature of MAGIC_SIGNATURES) {
    const offset = signature.offset ?? 0;
    let matched = true;
    for (let i = 0; i < signature.bytes.length; i += 1) {
      if (buffer[offset + i] !== signature.bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return signature.name;
  }
  // محاولة اكتشاف نص عادي
  const sample = buffer.subarray(0, Math.min(1024, buffer.length));
  const printable = [...sample].filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126) || b >= 0xc0).length;
  if (sample.length > 0 && printable / sample.length > 0.9) return "TEXT";
  return "UNKNOWN";
}

/** حساب نسبة الإنتروبيا — الملفات المضغوطة/المشفرة لها إنتروبيا عالية. */
export function entropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const frequencies = new Array<number>(256).fill(0);
  const sample = buffer.subarray(0, Math.min(buffer.length, 65536));
  for (const byte of sample) frequencies[byte] += 1;
  let entropyValue = 0;
  for (const frequency of frequencies) {
    if (frequency === 0) continue;
    const probability = frequency / sample.length;
    entropyValue -= probability * Math.log2(probability);
  }
  return Number(entropyValue.toFixed(3));
}

export type ScanOptions = { fileName: string; buffer: Buffer };

/** الفحص الأمني الكامل — يعيد النتيجة التفصيلية والحكم النهائي. */
export function scanFile({ fileName, buffer }: ScanOptions): ScanResult {
  const started = Date.now();
  const detections: Detection[] = [];
  const lowerName = fileName.toLowerCase();
  const extension = lowerName.includes(".") ? lowerName.split(".").pop()! : "";

  /* 1) الامتداد الممنوع */
  if (BLOCKED_EXTENSIONS.includes(extension)) {
    detections.push({
      rule: "BLOCKED-EXTENSION",
      severity: "critical",
      detail: `الامتداد .${extension} ممنوع حسب سياسة المؤسسة (ملف قابل للتنفيذ).`,
      points: 90,
    });
  }

  /* 2) امتداد مزدوج (مثال: report.pdf.exe) */
  const parts = lowerName.split(".").filter(Boolean);
  if (parts.length > 2) {
    detections.push({
      rule: "DOUBLE-EXTENSION",
      severity: "high",
      detail: "اسم الملف يحتوي على امتداد مزدوج وهو أسلوب إخفاء شائع.",
      points: 40,
    });
  }

  /* 3) الامتداد غير المعروف */
  if (extension && !ALLOWED_EXTENSIONS.includes(extension) && !BLOCKED_EXTENSIONS.includes(extension)) {
    detections.push({
      rule: "UNKNOWN-EXTENSION",
      severity: "low",
      detail: `الامتداد .${extension} غير مدرج في قائمة السماح.`,
      points: 15,
    });
  }

  /* 4) النوع الحقيقي مقابل الامتداد */
  const realType = detectRealType(buffer);
  const extensionMismatch = isMismatch(extension, realType);
  if (extensionMismatch) {
    detections.push({
      rule: "TYPE-MISMATCH",
      severity: "high",
      detail: `النوع الحقيقي للمحتوى (${realType}) لا يطابق الامتداد المعلَن (.${extension}).`,
      points: 55,
    });
  }
  if (realType === "PE (تنفيذي ويندوز)" || realType === "ELF (تنفيذي لينكس)") {
    detections.push({
      rule: "EXECUTABLE-BINARY",
      severity: "critical",
      detail: "الملف برنامج تنفيذي ثنائي.",
      points: 88,
    });
  }

  /* 5) قواعد المحتوى */
  const textSample = buffer.subarray(0, Math.min(buffer.length, 512 * 1024)).toString("latin1");
  for (const rule of CONTENT_RULES) {
    if (rule.pattern.test(textSample)) {
      detections.push({ rule: rule.rule, severity: rule.severity, detail: rule.detail, points: rule.points });
    }
  }

  /* 6) إنتروبيا عالية مع حجم كبير (احتمال تشفير/حزم) */
  const entropyValue = entropy(buffer);
  if (entropyValue > 7.6 && buffer.length > 50_000) {
    detections.push({
      rule: "HIGH-ENTROPY",
      severity: "medium",
      detail: `إنتروبيا مرتفعة (${entropyValue}) قد تشير إلى محتوى مشفّر أو معبأ لإخفاء الحمولة.`,
      points: 20,
    });
  }

  /* 7) درجة التهديد والحكم */
  const threatScore = Math.min(100, detections.reduce((sum, d) => sum + d.points, 0));
  const verdict: ScanResult["verdict"] =
    threatScore >= 70 ? "malicious" : threatScore >= 30 ? "suspicious" : "clean";

  /* 8) التصنيف والحساسية */
  const { classification, sensitivity } = classifyContent(textSample, verdict, detections);

  return {
    verdict,
    threatScore,
    detections,
    realType,
    extensionMismatch,
    classification,
    sensitivity,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    engine: SCANNER_VERSION,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

/** مقارنة الامتداد المعلَن بالنوع الحقيقي. */
function isMismatch(extension: string, realType: string): boolean {
  const map: Record<string, string[]> = {
    pdf: ["PDF"],
    png: ["PNG"],
    jpg: ["JPEG"],
    jpeg: ["JPEG"],
    gif: ["GIF"],
    zip: ["ZIP/DOCX/XLSX", "7Z", "RAR", "GZIP"],
    docx: ["ZIP/DOCX/XLSX"],
    xlsx: ["ZIP/DOCX/XLSX"],
    pptx: ["ZIP/DOCX/XLSX"],
    doc: ["OLE2 (DOC/XLS قديم)"],
    xls: ["OLE2 (DOC/XLS قديم)"],
    txt: ["TEXT"],
    md: ["TEXT"],
    csv: ["TEXT"],
    json: ["TEXT"],
    xml: ["TEXT"],
    log: ["TEXT"],
    yaml: ["TEXT"],
    yml: ["TEXT"],
    svg: ["TEXT"],
  };
  const expected = map[extension];
  if (!expected) return false;
  if (realType === "UNKNOWN") return false;
  return !expected.includes(realType);
}

/** التصنيف التلقائي لمحتوى الملف. */
function classifyContent(
  text: string,
  verdict: ScanResult["verdict"],
  detections: Detection[],
): { classification: string; sensitivity: string } {
  const matches = CLASSIFICATION_RULES.filter((rule) => rule.keywords.test(text));
  const classification = matches.length > 0 ? matches[0]!.label : "عام";

  let sensitivity = matches[0]?.sensitivity ?? "عام";
  if (matches.length > 2) sensitivity = "سري";
  if (verdict === "malicious") sensitivity = "سري";
  if (detections.some((d) => d.severity === "critical")) sensitivity = "سري";
  if (sensitivity === "سري" && matches.length === 0 && verdict === "clean") sensitivity = "خاص";

  return { classification, sensitivity };
}

/** ملخص عربي جاهز للعرض في الواجهة. */
export function verdictLabel(verdict: ScanResult["verdict"]): string {
  return verdict === "clean" ? "سليم" : verdict === "suspicious" ? "مشبوه" : "ضار";
}
