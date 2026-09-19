/**
 * ============================================================================
 *  مكتبة الأيقونات — SVG مضمّنة (بدون أي اعتماد خارجي، خفيفة وسريعة)
 * ============================================================================
 */
import type { ReactNode } from "react";

export type IconName =
  | "shield"
  | "dashboard"
  | "files"
  | "alerts"
  | "audit"
  | "devices"
  | "users"
  | "reports"
  | "logout"
  | "search"
  | "menu"
  | "close"
  | "check"
  | "plus"
  | "download"
  | "upload"
  | "trash"
  | "lock"
  | "unlock"
  | "eye"
  | "refresh"
  | "chevronDown"
  | "chevronLeft"
  | "filter"
  | "warning"
  | "info"
  | "activity"
  | "clock"
  | "settings"
  | "radar"
  | "virus"
  | "key"
  | "print"
  | "spark";

const PATHS: Record<IconName, ReactNode> = {
  shield: <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3zm-3 9l2 2 4-4" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  files: (
    <>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M8 13h8M8 16h5" />
    </>
  ),
  alerts: (
    <>
      <path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z" />
      <path d="M10.5 20a1.8 1.8 0 003 0" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v6h6M8.5 13h7M8.5 16.5h4.5" />
    </>
  ),
  devices: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h4M11 16.5h4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      <path d="M16 5.5a3 3 0 010 5.8M18 20c0-2.3-.9-3.8-2.4-4.6" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V6a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <path d="M14 4v6h6M8.5 17v-3M12 17v-6M15.5 17v-4" />
    </>
  ),
  logout: <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h11" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <path d="M12 4v10m0 0l-4-4m4 4l4-4M5 18h14" />,
  upload: <path d="M12 20V9m0 0L8 13m4-4l4 4M5 5h14" />,
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 10-2.3 5.6M20 6v6h-6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronLeft: <path d="M14 6l-6 6 6 6" />,
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6L4 5z" />,
  warning: (
    <>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-7 4 14L16 12h5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.09A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 003 15a1.7 1.7 0 00-1.2-2.9H2a2 2 0 110-4h.09A1.7 1.7 0 004.6 7a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 3a1.7 1.7 0 001.2-1.2V2a2 2 0 114 0v.09A1.7 1.7 0 0017 4.6a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0021 9a1.7 1.7 0 001.2 1.2H22a2 2 0 110 4h-.09A1.7 1.7 0 0019.4 15z" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12l6-4" />
    </>
  ),
  virus: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3M17 6l2 2M14.5 8.5l2 2" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="2" />
      <path d="M7 16h10v4H7z" />
    </>
  ),
  spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" />,
};

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.7,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** شعار المنصة (درع نيوني). */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="deraa-shield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <path
          d="M24 4l16 6v12c0 9.4-6.7 17.3-16 20.4C14.7 39.3 8 31.4 8 22V10l16-6z"
          fill="url(#deraa-shield)"
          opacity="0.18"
        />
        <path
          d="M24 4l16 6v12c0 9.4-6.7 17.3-16 20.4C14.7 39.3 8 31.4 8 22V10l16-6z"
          fill="none"
          stroke="url(#deraa-shield)"
          strokeWidth="2.2"
        />
        <path d="M17 24l5 5 10-10" fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
