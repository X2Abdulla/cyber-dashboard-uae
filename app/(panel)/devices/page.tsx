"use client";

/**
 * ============================================================================
 *  الأصول والأجهزة — الإدارة الذكية للشبكة
 * ============================================================================
 *  عرض حالة كل أصل (متصل/غير متصل/معزول)، درجة خطورته، وامتثاله للسياسة
 *  (التحديثات + التشفير)، مع إجراءات استجابة سريعة: عزل، إعادة اتصال،
 *  تحديث الامتثال، إعادة حساب الخطورة، إضافة وحذف.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-context";
import { Icon } from "@/components/icons";
import { Badge, Button, EmptyState, ErrorState, Field, LiveDot, LoadingBlock, Modal, Panel, RiskBar, useToast } from "@/components/ui";
import { api, ApiError, toQuery } from "@/lib/client/api";
import { cn, DEVICE_STATUS_LABELS, DEVICE_STATUS_STYLES, DEVICE_TYPE_LABELS, formatNumber, formatRelative } from "@/lib/format";
import { PERMISSIONS } from "@/lib/auth/rbac";
import type { DeviceStatus } from "@/lib/types";

type Device = {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  macAddress: string | null;
  os: string | null;
  location: string | null;
  status: DeviceStatus;
  riskScore: number;
  patchesUpToDate: boolean;
  encryptionEnabled: boolean;
  cpuLoad: number;
  ownerName: string | null;
  lastSeenAt: string;
};

type DeviceStats = { total: number; online: number; offline: number; quarantined: number; averageRisk: number; nonCompliant: number };

export default function DevicesPage() {
  const { allowed } = useSession();
  const toast = useToast();
  const canManage = allowed(PERMISSIONS.devicesManage);

  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<DeviceStats>({ total: 0, online: 0, offline: 0, quarantined: 0, averageRisk: 0, nonCompliant: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ devices: Device[]; stats: DeviceStats }>(`/api/devices${toQuery({ q: search, status })}`);
      setDevices(data.devices);
      setStats(data.stats);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل الأصول.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const patch = async (device: Device, body: Record<string, unknown>, message: string) => {
    setBusyId(device.id);
    try {
      await api.patch(`/api/devices/${device.id}`, body);
      toast.push("success", message);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر تحديث الجهاز.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (device: Device) => {
    setBusyId(device.id);
    try {
      await api.delete(`/api/devices/${device.id}`);
      toast.push("success", `تم حذف ${device.name} من سجل الأصول.`);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر حذف الجهاز.");
    } finally {
      setBusyId(null);
    }
  };

  const recalculate = async (device: Device) => {
    setBusyId(device.id);
    try {
      const result = await api.post<{ riskScore: number }>(`/api/devices/${device.id}`);
      toast.push("info", `أُعيد حساب خطورة ${device.name} → ${result.riskScore}/100.`);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر إعادة الحساب.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DeviceStat label="إجمالي الأصول" value={stats.total} icon="devices" tone="cyan" />
        <DeviceStat label="متصلة" value={stats.online} icon="check" tone="mint" />
        <DeviceStat label="غير متصلة" value={stats.offline} icon="clock" tone="amber" />
        <DeviceStat label="معزولة" value={stats.quarantined} icon="lock" tone="rose" />
        <DeviceStat label="مخالفة للسياسة" value={stats.nonCompliant} icon="warning" tone="violet" hint={`متوسط الخطورة ${stats.averageRisk}`} />
      </div>

      <Panel
        title="سجل الأصول والأجهزة"
        subtitle="يتم تحديث الحالة والحمل تلقائياً كل 15 ثانية"
        icon="devices"
        actions={
          <>
            {canManage && (
              <Button variant="primary" icon="plus" className="px-3 py-1.5 text-[11px]" onClick={() => setCreateOpen(true)}>
                إضافة أصل
              </Button>
            )}
            <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={load}>
              تحديث
            </Button>
          </>
        }
      >
        <div className="mb-4 grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <input className="field pr-10" placeholder="ابحث بالاسم أو عنوان IP أو الموقع..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="field sm:w-44" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">كل الحالات</option>
            {(Object.keys(DEVICE_STATUS_LABELS) as DeviceStatus[]).map((key) => (
              <option key={key} value={key}>
                {DEVICE_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {loading && devices.length === 0 ? (
          <LoadingBlock label="جارٍ مسح الأصول..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : devices.length === 0 ? (
          <EmptyState icon="devices" title="لا توجد أصول مطابقة" hint="أضف أصلاً جديداً أو غيّر الفلاتر." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {devices.map((device) => {
              const busy = busyId === device.id;
              const compliant = device.patchesUpToDate && device.encryptionEnabled;
              return (
                <article key={device.id} className="panel panel-hover p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                          device.status === "online"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : device.status === "quarantined"
                              ? "border-rose-500/35 bg-rose-500/12 text-rose-300"
                              : "border-slate-500/30 bg-slate-500/10 text-slate-300",
                        )}
                      >
                        <Icon name={device.type === "server" ? "devices" : device.type === "router" ? "radar" : device.type === "camera" ? "eye" : "activity"} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-white">{device.name}</p>
                        <p className="mono mt-1 truncate text-[10px] text-slate-500" dir="ltr">
                          {device.ipAddress} {device.macAddress ? `• ${device.macAddress}` : ""}
                        </p>
                        <p className="mono mt-0.5 truncate text-[10px] text-slate-500">
                          {DEVICE_TYPE_LABELS[device.type] ?? device.type} • {device.os ?? "نظام غير محدد"}
                        </p>
                      </div>
                    </div>
                    <Badge className={DEVICE_STATUS_STYLES[device.status]} dot={device.status === "online"}>
                      {DEVICE_STATUS_LABELS[device.status]}
                    </Badge>
                  </div>

                  <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <p className="mono mb-1 text-[9px] text-slate-500">درجة الخطورة</p>
                      <RiskBar value={device.riskScore} />
                    </div>
                    <div>
                      <p className="mono mb-1 text-[9px] text-slate-500">حمل المعالج</p>
                      <RiskBar value={device.cpuLoad} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge className={device.patchesUpToDate ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/35 bg-rose-500/10 text-rose-200"}>
                      {device.patchesUpToDate ? "التحديثات مكتملة" : "تحديثات ناقصة"}
                    </Badge>
                    <Badge className={device.encryptionEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/35 bg-rose-500/10 text-rose-200"}>
                      {device.encryptionEnabled ? "التشفير مفعّل" : "بدون تشفير"}
                    </Badge>
                    <Badge className={compliant ? "border-cyan-400/25 bg-cyan-400/8 text-cyan-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}>
                      {compliant ? "متوافق" : "مخالفة سياسة"}
                    </Badge>
                  </div>

                  <p className="mono mt-3 flex items-center gap-1.5 text-[9px] text-slate-500">
                    <LiveDot tone={device.status === "online" ? "emerald" : device.status === "quarantined" ? "rose" : "amber"} />
                    آخر ظهور {formatRelative(device.lastSeenAt)} {device.location ? `• ${device.location}` : ""} {device.ownerName ? `• ${device.ownerName}` : ""}
                  </p>

                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/6 pt-3">
                      {device.status !== "quarantined" ? (
                        <Button variant="danger" icon="lock" className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => patch(device, { status: "quarantined" }, `تم عزل ${device.name} عن الشبكة.`)}>
                          عزل
                        </Button>
                      ) : (
                        <Button variant="soft" icon="unlock" className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => patch(device, { status: "online" }, `تمت إعادة ${device.name} إلى الشبكة.`)}>
                          إنهاء العزل
                        </Button>
                      )}
                      <Button variant="ghost" icon={device.patchesUpToDate ? "warning" : "check"} className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => patch(device, { patchesUpToDate: !device.patchesUpToDate }, "تم تحديث حالة التحديثات.")}>
                        {device.patchesUpToDate ? "إلغاء تأكيد التحديثات" : "تأكيد اكتمال التحديثات"}
                      </Button>
                      <Button variant="ghost" icon={device.encryptionEnabled ? "unlock" : "lock"} className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => patch(device, { encryptionEnabled: !device.encryptionEnabled }, "تم تحديث حالة التشفير.")}>
                        {device.encryptionEnabled ? "تعطيل التشفير" : "تفعيل التشفير"}
                      </Button>
                      <Button variant="ghost" icon="radar" className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => recalculate(device)}>
                        إعادة حساب الخطورة
                      </Button>
                      <Button variant="ghost" icon="trash" className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => remove(device)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <CreateDeviceModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

function DeviceStat({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: "devices" | "check" | "clock" | "lock" | "warning";
  tone: "cyan" | "mint" | "amber" | "rose" | "violet";
  hint?: string;
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    mint: "border-emerald-400/25 text-emerald-300",
    amber: "border-amber-400/25 text-amber-300",
    rose: "border-rose-400/25 text-rose-300",
    violet: "border-violet-400/25 text-violet-300",
  };
  return (
    <div className={cn("panel p-3.5", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-400">{label}</p>
          <p className="stat-value mt-1">{formatNumber(value)}</p>
          {hint && <p className="mono mt-1 truncate text-[9px] text-slate-500">{hint}</p>}
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/4", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function CreateDeviceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", type: "workstation", ipAddress: "", macAddress: "", os: "", location: "", ownerName: "" });

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/devices", form);
      toast.push("success", "تمت إضافة الأصل إلى سجل الأصول.");
      onClose();
      onCreated();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر إضافة الأصل.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إضافة أصل جديد"
      subtitle="يُسجَّل في إدارة الأصول ويخضع لحساب الخطورة"
      icon="devices"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon="check" loading={busy} onClick={submit}>
            إضافة الأصل
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم الجهاز">
          <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="خادم التقارير" />
        </Field>
        <Field label="النوع">
          <select className="field" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="عنوان IP">
          <input className="field" dir="ltr" value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} placeholder="10.10.1.25" />
        </Field>
        <Field label="عنوان MAC" hint="اختياري">
          <input className="field" dir="ltr" value={form.macAddress} onChange={(event) => setForm({ ...form, macAddress: event.target.value })} placeholder="00:1A:2B:3C:4D:5E" />
        </Field>
        <Field label="نظام التشغيل" hint="اختياري">
          <input className="field" value={form.os} onChange={(event) => setForm({ ...form, os: event.target.value })} placeholder="Ubuntu 24.04" />
        </Field>
        <Field label="الموقع" hint="اختياري">
          <input className="field" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="مركز البيانات - الرف C3" />
        </Field>
        <Field label="المسؤول" hint="اختياري" className="sm:col-span-2">
          <input className="field" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} placeholder="فريق البنية التحتية" />
        </Field>
      </div>
    </Modal>
  );
}
