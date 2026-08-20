import type { SVGProps } from "react";

export type IconName =
  | "arrow"
  | "branch"
  | "browser"
  | "check"
  | "chevron"
  | "close"
  | "database"
  | "edit"
  | "external"
  | "home"
  | "list"
  | "lock"
  | "logs"
  | "mail"
  | "phone"
  | "play"
  | "plus"
  | "refresh"
  | "shield"
  | "signal"
  | "stop"
  | "tasks"
  | "trash";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, className = "size-5", ...props }: IconProps) {
  const common = {
    "aria-hidden": true,
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    ...props,
  } as const;

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8 9 1.4 1.4L12 7.8M14 9h3M8 15h.01M11 15h6" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M9 6h10M9 12h10M9 18h10M5 6h.01M5 12h.01M5 18h.01" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case "browser":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
          <path d="M10 5h4M11 18.5h2" />
        </svg>
      );
    case "signal":
      return (
        <svg {...common}>
          <path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0M10.8 15a2 2 0 0 1 2.4 0" />
          <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="m9 7 7 5-7 5V7Z" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M18 8a7 7 0 1 0 .7 6.9M18 4v4h-4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 19 6v5.3c0 4.2-2.8 7.7-7 9.2-4.2-1.5-7-5-7-9.2V6l7-2.5Z" />
          <path d="m9.2 12 1.8 1.8 3.9-4" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M13 5h6v6M19 5l-8 8" />
          <path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case "logs":
      return (
        <svg {...common}>
          <path d="M6 6h12M6 12h12M6 18h8" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="m14.5 5.5 4 4L9 19H5v-4l9.5-9.5Z" />
          <path d="m12.5 7.5 4 4" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "branch":
      return (
        <svg {...common}>
          <circle cx="7" cy="6" r="2" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="12" r="2" />
          <path d="M7 8v8M9 7c0 3 1.5 5 6 5" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      );
  }
}
