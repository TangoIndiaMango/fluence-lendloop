"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Logo } from "@/components/Logo";
import { useStoreUser } from "@/components/useStoreUser";

const NAV = [
  { href: "/browse", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading, isAuthenticated, me } = useStoreUser();
  const incoming = useQuery(api.loans.incoming, me ? {} : "skip");
  const pendingIncoming = incoming?.filter((l) => l.status === "pending").length ?? 0;

  const nav = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {me?.trustedLender && (
              <span className="hidden rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent sm:inline">
                Trusted Lender
              </span>
            )}
            <UserButton />
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Main">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-[#f3f0ea]"
                }`}
              >
                {item.label}
                {item.href === "/incoming" && pendingIncoming > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-white">{pendingIncoming}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {isLoading ? (
          <p className="text-muted">Loading your board…</p>
        ) : !isAuthenticated ? (
          <p className="text-muted">
            Your session expired. <Link className="text-accent underline" href="/">Sign in again</Link>.
          </p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
