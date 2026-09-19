import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/** بيانات الصفحة (تظهر في تبويب المتصفح ومحركات البحث). */
export const metadata: Metadata = {
  title: "دِرْع | منصة الأمن السيبراني والإدارة الذكية",
  description:
    "منصة عربية متكاملة لإدارة الأمن السيبراني: مصادقة آمنة بأدوار صلاحيات، فحص الملفات، تنبيهات حية، سجل عمليات كامل، وتقارير أمنية دورية.",
  applicationName: "دِرْع",
  keywords: ["أمن سيبراني", "SOC", "إدارة ذكية", "تنبيهات أمنية", "فحص ملفات"],
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
};

/**
 * التخطيط الجذري: اللغة العربية والاتجاه من اليمين لليسار على مستوى المستند.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-abyss-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
