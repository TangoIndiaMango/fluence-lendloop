"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Line icons on a 24×24 grid, for the phone tab bar.
const ICONS = {
  browse: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  listings: ["M3 12V4h8l10 10-8 8z", "M7.5 8.5h.01"],
  requests: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  incoming: ["M3 13h5l1.5 3h5L16 13h5", "M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"],
  admin: ["M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z", "M9 12l2 2 4-4"],
} as const;

type Item = { href: string; label: string; short: string; icon: keyof typeof ICONS };

const NAV: Item[] = [
  { href: "/browse", label: "All tools", short: "Browse", icon: "browse" },
  { href: "/listings", label: "My listings", short: "Listings", icon: "listings" },
  { href: "/requests", label: "My requests", short: "Requests", icon: "requests" },
  { href: "/incoming", label: "Incoming", short: "Incoming", icon: "incoming" },
];
const ADMIN: Item = { href: "/admin", label: "Admin", short: "Admin", icon: "admin" };

function CountBadge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={`rounded-full bg-accent px-1.5 text-xs leading-5 text-white ${className}`}>
      {n}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * "top": tabs under the header from the `sm` breakpoint up.
 * "bottom": a fixed tab bar on phones, where five text tabs don't fit. It
 * must render outside the blurred header, which would otherwise become its
 * containing block.
 */
export function AppNav({
  variant,
  isAdmin,
  pendingIncoming,
}: {
  variant: "top" | "bottom";
  isAdmin: boolean;
  pendingIncoming: number;
}) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, ADMIN] : NAV;
  const isActive = (href: string) => pathname.startsWith(href);
  const count = (href: string) => (href === "/incoming" ? pendingIncoming : 0);

  if (variant === "top") {
    return (
      <nav className="mx-auto hidden w-full max-w-5xl gap-1 px-4 pb-2 sm:flex" aria-label="Main">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`focus-ring whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              isActive(item.href) ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted"
            }`}
          >
            {item.label}
            <CountBadge n={count(item.href)} className="ml-1.5" />
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      aria-label="Main"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`focus-ring relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "font-semibold text-accent" : "text-muted"
                }`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[item.icon].map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
                {item.short}
                <CountBadge n={count(item.href)} className="absolute top-1.5 left-1/2 ml-2 text-[10px] leading-4" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
