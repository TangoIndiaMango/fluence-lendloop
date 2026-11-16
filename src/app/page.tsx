"use client";

import Link from "next/link";
import { useState } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CATEGORIES } from "@convex/lib/constants";
import { Logo } from "@/components/Logo";

export default function Home() {
  // Public query: returns only { name, category } for tools free right now.
  const tools = useQuery(api.tools.listPublic);
  const [category, setCategory] = useState<string>("All");
  const visible = tools?.filter((t) => category === "All" || t.category === category);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <Logo />
        <Show when="signed-in">
          <Link href="/browse" className="btn-secondary">Open LendLoop</Link>
        </Show>
      </header>

      <section className="mt-12 sm:mt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Borrow the drill. <span className="text-accent">Skip the shop.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          LendLoop is a lending board for your street. List the tools gathering dust in your shed,
          borrow what you need for a weekend, and give it back when you&apos;re done.
        </p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/browse">
              <button className="btn-primary px-5 py-2.5 text-base">Sign in to lend or borrow</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/browse" className="btn-primary px-5 py-2.5 text-base">Go to your board</Link>
          </Show>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Available right now</h2>
            <p className="text-sm text-muted">Sign in to see details and request a loan.</p>
          </div>
          <select
            aria-label="Filter by category"
            className="input w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {visible === undefined ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="card h-16 animate-pulse bg-[#f3f0ea]" />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <p className="card mt-4 text-center text-muted">
            {tools?.length ? "Nothing in this category yet." : "No tools listed yet. Be the first to lend one."}
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {visible.map((t, i) => (
              <li key={`${t.name}-${i}`} className="card flex items-center justify-between">
                <span className="font-medium">{t.name}</span>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">{t.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
