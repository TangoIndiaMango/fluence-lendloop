"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/browse", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
] as const;

export function AppNav({ isAdmin, pendingIncoming }: { isAdmin: boolean; pendingIncoming: number }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <nav className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Main">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`focus-ring whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted"
            }`}
          >
            {item.label}
            {item.href === "/incoming" && pendingIncoming > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-white">
                {pendingIncoming}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
