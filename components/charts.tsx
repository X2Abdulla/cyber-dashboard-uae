"use client";

/**
 * ============================================================================
 *  الرسوم البيانية — SVG خالص (بدون مكتبات) مع تحديث حي وحركة ناعمة
 * ============================================================================
 *  كل مكوّن يستجيب للعرض (Responsive) عبر قياس الحاوية بـ ResizeObserver،
 *  ويعمل باللمس على الجوال (tooltip عند الضغط/التحريك).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import type { MetricPoint } from "@/lib/types";

/** قياس عرض الحاوية لرسم دقيق على كل المقاسات. */
function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(node);
    setWidth(Math.max(240, node.clientWidth));
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/** تحويل نقاط إلى مسار SVG ناعم (منحنى). */
function buildSmoothPath(values: number[], width: number, height: number, max: number, min = 0): string {
  if (values.length === 0) return "";
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const scale = (value: number) => height - ((value - min) / Math.max(1, max - min)) * height;
  const points = values.map((value, index) => ({ x: index * stepX, y: scale(value) }));

  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

/* -------------------------------------------------------------------------- */
/*                        رسم مساحي حي متعدد السلاسل                          */
/* -------------------------------------------------------------------------- */

export type ChartSeries = { name: string; color: string; points: MetricPoint[] };

export function LiveAreaChart({
  series,
  height = 210,
  showLegend = true,
}: {
  series: ChartSeries[];
  height?: number;
  showLegend?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { max, length } = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.value));
    return { max: Math.max(10, Math.ceil(Math.max(0, ...all) * 1.18)), length: Math.max(...series.map((s) => s.points.length), 0) };
  }, [series]);

  const padding = { top: 12, bottom: 20, left: 8, right: 8 };
  const innerWidth = Math.max(60, width - padding.left - padding.right);
  const innerHeight = height - padding.top - padding.bottom;

  const handleMove = (event: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const clientX = "touches" in event ? event.touches[0]?.clientX ?? 0 : event.clientX;
    const ratio = (clientX - rect.left) / rect.width;
    setHoverIndex(Math.max(0, Math.min(length - 1, Math.round(ratio * (length - 1)))));
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div ref={ref} className="w-full">
      <div className="relative">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={handleMove}
          onTouchMove={handleMove}
          onTouchEnd={() => setHoverIndex(null)}
          className="touch-pan-y select-none"
          role="img"
          aria-label="رسم بياني حي للنشاط الأمني"
        >
          <defs>
            {series.map((s, index) => (
              <linearGradient key={s.name} id={`grad-${index}-${s.color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.42" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>

          <g transform={`translate(${padding.left},${padding.top})`}>
            {/* شبكة أفقية */}
            {gridLines.map((ratio) => (
              <line
                key={ratio}
                x1={0}
                x2={innerWidth}
                y1={innerHeight * ratio}
                y2={innerHeight * ratio}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="3 5"
                strokeWidth={1}
              />
            ))}

            {/* السلاسل */}
            {series.map((s, index) => {
              const values = s.points.map((p) => p.value);
              const line = buildSmoothPath(values, innerWidth, innerHeight, max);
              const area = `${line} L ${innerWidth} ${innerHeight} L 0 ${innerHeight} Z`;
              return (
                <g key={s.name}>
                  <path d={area} fill={`url(#grad-${index}-${s.color.replace("#", "")})`} className="animate-fade-in" />
                  <path
                    d={line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="chart-line drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]"
                  />
                </g>
              );
            })}

            {/* مؤشر التحويم */}
            {hoverIndex !== null && length > 0 && (
              <g>
                <line
                  x1={(hoverIndex / Math.max(1, length - 1)) * innerWidth}
                  x2={(hoverIndex / Math.max(1, length - 1)) * innerWidth}
                  y1={0}
                  y2={innerHeight}
                  stroke="rgba(34,211,238,0.55)"
                  strokeWidth={1}
                />
                {series.map((s) => {
                  const value = s.points[hoverIndex]?.value ?? 0;
                  const y = innerHeight - (value / max) * innerHeight;
                  return (
                    <circle
                      key={s.name}
                      cx={(hoverIndex / Math.max(1, length - 1)) * innerWidth}
                      cy={y}
                      r={3.5}
                      fill={s.color}
                      stroke="#04060d"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}
          </g>
        </svg>

        {/* تلميح القيم */}
        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-white/12 bg-abyss-950/92 px-2.5 py-1.5 text-[10px] shadow-xl backdrop-blur"
            style={{ left: `${Math.min(78, Math.max(4, (hoverIndex / Math.max(1, length - 1)) * 100 - 8))}%` }}
          >
            <p className="mono mb-1 text-slate-400">{series[0]?.points[hoverIndex]?.time ?? ""}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 whitespace-nowrap text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.name}: <span className="mono font-bold">{s.points[hoverIndex]?.value ?? 0}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
              {s.name}
              <span className="mono text-slate-300">{s.points.at(-1)?.value ?? 0}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 رسم دائري                                   */
/* -------------------------------------------------------------------------- */

export function DonutChart({
  data,
  size = 170,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const [active, setActive] = useState<number | null>(null);

  let offset = 0;
  const arcs = data.map((item, index) => {
    const fraction = total > 0 ? item.value / total : 0;
    const dash = fraction * circumference;
    const arc = { ...item, index, dash, offset, fraction };
    offset += dash;
    return arc;
  });

  const shown = active !== null ? data[active] : null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label="توزيع الخطورة">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={thickness} />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={active === arc.index ? thickness + 4 : thickness}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              className="cursor-pointer transition-all duration-500"
              style={{ filter: `drop-shadow(0 0 6px ${arc.color}55)` }}
              onMouseEnter={() => setActive(arc.index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="mono text-2xl font-bold text-white">{shown ? shown.value : (centerValue ?? total)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{shown ? shown.label : (centerLabel ?? "الإجمالي")}</p>
          </div>
        </div>
      </div>

      <ul className="min-w-32 space-y-1.5 text-[11px]">
        {data.map((item, index) => (
          <li
            key={item.label}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1 transition",
              active === index ? "bg-white/8 text-white" : "text-slate-300",
            )}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="mono font-bold">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              أعمدة أفقية مرتبة                              */
/* -------------------------------------------------------------------------- */

export function BarList({
  data,
  emptyLabel = "لا توجد بيانات كافية",
}: {
  data: { label: string; value: number; color?: string }[];
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  if (data.length === 0) return <p className="py-6 text-center text-[11px] text-slate-500">{emptyLabel}</p>;

  return (
    <ul className="space-y-2.5">
      {data.map((item) => (
        <li key={item.label} className="group">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="truncate text-slate-300 group-hover:text-white">{item.label}</span>
            <span className="mono font-bold text-slate-200">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(4, (item.value / max) * 100)}%`,
                background: item.color ?? "linear-gradient(90deg,#22d3ee,#a78bfa)",
                boxShadow: "0 0 12px rgba(34,211,238,0.35)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                            أعمدة رأسية (اتجاه أسبوعي)                       */
/* -------------------------------------------------------------------------- */

export function ColumnChart({
  data,
  height = 150,
  color = "#22d3ee",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  if (data.length === 0) return <p className="py-8 text-center text-[11px] text-slate-500">لا توجد بيانات</p>;

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((item, index) => (
          <div key={`${item.label}-${index}`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="mono text-[9px] text-slate-400 opacity-0 transition group-hover:opacity-100">{item.value}</span>
            <div
              className="w-full rounded-t-md transition-all duration-700 ease-out group-hover:brightness-125"
              style={{
                height: `${Math.max(3, (item.value / max) * (height - 30))}px`,
                background: `linear-gradient(180deg, ${color}, ${color}22)`,
                boxShadow: `0 0 14px ${color}33`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((item, index) => (
          <span key={`${item.label}-l-${index}`} className="mono flex-1 text-center text-[9px] text-slate-500">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        حلقة قياس (الدرجة الأمنية)                           */
/* -------------------------------------------------------------------------- */

export function GaugeRing({
  value,
  label = "الدرجة الأمنية",
  size = 168,
}: {
  value: number;
  label?: string;
  size?: number;
}) {
  const thickness = 13;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * circumference * 0.75; // ثلاثة أرباع دائرة
  const color = clamped >= 80 ? "#34d399" : clamped >= 60 ? "#22d3ee" : clamped >= 40 ? "#fbbf24" : "#fb7185";
  const grade = clamped >= 85 ? "ممتازة" : clamped >= 70 ? "جيدة" : clamped >= 50 ? "متوسطة" : "حرجة";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg]" role="img" aria-label={`${label}: ${clamped}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={thickness}
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 10px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="mono text-3xl font-bold" style={{ color }}>
            {clamped}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{label}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-200">{grade}</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              خط مصغّر للبطاقات                              */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  color = "#22d3ee",
  width = 110,
  height = 34,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const data = values.length > 1 ? values : [0, 0];
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const path = buildSmoothPath(data, width, height, max, min);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={`url(#spark-${color.replace("#", "")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
