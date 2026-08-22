"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "../page.module.css";

const availableNavigation = [
  { label: "Emner", icon: "grid", href: "/emner" },
  { label: "AI-prompter", icon: "sparkle", href: "/ai-prompts" },
] as const;

const futureNavigation = [
  { label: "Gennemgang", icon: "check" },
  { label: "Indstillinger", icon: "settings" },
] as const;

type NavIconName =
  | (typeof availableNavigation)[number]["icon"]
  | (typeof futureNavigation)[number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    check: (
      <>
        <path d="M20 11.1V12a8 8 0 1 1-4.75-7.32" />
        <path d="m9 11 2.25 2.25L21 3.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4.05v.1a1.7 1.7 0 0 0 1.05 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    sparkle: (
      <path d="m12 3 1.05 3.3A5.8 5.8 0 0 0 16.7 10L20 11l-3.3 1.05A5.8 5.8 0 0 0 13 15.7L12 19l-1.05-3.3A5.8 5.8 0 0 0 7.3 12L4 11l3.3-1.05A5.8 5.8 0 0 0 11 6.3L12 3Z" />
    ),
  };

  return (
    <svg
      className={styles.navIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function routeIsActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navigation} aria-label="Primær navigation">
      {availableNavigation.map((item) => {
        const active = routeIsActive(pathname, item.href);

        return (
          <Link
            className={`${styles.navItem} ${
              active ? styles.navItemActive : styles.navItemAvailable
            }`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.href}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {futureNavigation.map((item) => (
        <span
          className={`${styles.navItem} ${styles.navItemDisabled}`}
          aria-disabled="true"
          key={item.label}
          title={`${item.label} kommer senere`}
        >
          <NavIcon name={item.icon} />
          <span>{item.label}</span>
          <small className={styles.navSoon}>Senere</small>
        </span>
      ))}
    </nav>
  );
}
