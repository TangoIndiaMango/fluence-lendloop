"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ToolForm } from "@/components/ToolForm";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";

function Listings() {
  const params = useSearchParams();
  const router = useRouter();
  const creating = params.get("new") === "1";
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);

  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);

  const closeCreate = () => router.replace("/listings");

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Tools you're lending to the neighbourhood."
        action={!creating && <Link href="/listings?new=1" className="btn-primary">List a tool</Link>}
      />

      {creating && (
        <section className="card mb-5">
          <h2 className="mb-3 font-semibold">List a tool</h2>
          <ToolForm
            submitLabel="Publish listing"
            onSubmit={async (input) => {
              await create(input);
              closeCreate();
            }}
            onCancel={closeCreate}
          />
        </section>
      )}

      {tools === undefined ? (
        <Skeleton />
      ) : tools.length === 0 ? (
        !creating && (
          <Empty>
            You haven&apos;t listed anything yet. <Link href="/listings?new=1" className="text-accent underline">List your first tool</Link>
          </Empty>
        )
      ) : (
        <ul className="grid gap-3">
          {tools.map((t) => (
            <li key={t._id} className="card">
              {editing === t._id ? (
                <ToolForm
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  submitLabel="Save changes"
                  onSubmit={async (input) => {
                    await update({ toolId: t._id, ...input });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{t.name}</h2>
                    <p className="text-xs text-muted">
                      {t.category} · {t.condition} condition ·{" "}
                      {t.availability.state === "available"
                        ? "available"
                        : `on loan until ${formatDate(t.availability.until)}`}
                    </p>
                    {t.description && <p className="mt-2 text-sm">{t.description}</p>}
                    {t.pendingRequests > 0 && (
                      <Link href="/incoming" className="mt-2 inline-block text-sm font-medium text-accent underline">
                        {t.pendingRequests} pending request{t.pendingRequests > 1 ? "s" : ""}
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary" onClick={() => setEditing(t._id)}>
                      Edit
                    </button>
                    <ActionButton
                      variant="danger"
                      confirm={`Remove "${t.name}"? Any pending requests will be declined.`}
                      onAction={() => remove({ toolId: t._id })}
                    >
                      Remove
                    </ActionButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Listings />
    </Suspense>
  );
}
