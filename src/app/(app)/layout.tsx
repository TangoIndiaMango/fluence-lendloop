"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppNav } from "@/components/AppNav";
import { Logo } from "@/components/Logo";
import { Badge, Notice, Skeleton } from "@/components/ui";
import { useStoreUser } from "@/hooks/useStoreUser";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, me } = useStoreUser();
  const incoming = useQuery(api.loans.incoming, me ? {} : "skip");
  const pendingIncoming = incoming?.filter((l) => l.status === "pending").length ?? 0;

  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-20 btn-primary">
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {me?.trustedLender && (
              <span className="hidden sm:inline">
                <Badge tone="green">Trusted Lender</Badge>
              </span>
            )}
            <UserButton />
          </div>
        </div>
        <AppNav isAdmin={me?.role === "admin"} pendingIncoming={pendingIncoming} />
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {isLoading ? (
          <Skeleton rows={3} />
        ) : !isAuthenticated ? (
          <p className="text-muted">
            Your session expired.{" "}
            <Link className="text-accent underline" href="/">
              Sign in again
            </Link>
            .
          </p>
        ) : (
          <>
            {me && !me.hasEmail && (
              <Notice tone="warning">
                We don&apos;t have an email address for you, so you won&apos;t get request or reminder emails. Add one
                from your profile menu (top right), then sign out and back in.
              </Notice>
            )}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
