"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ToolImage } from "@/components/tools/CategoryArt";
import { ToolForm } from "@/components/tools/ToolForm";
import { ActionButton, AvailabilityBadge, Empty, PageHeader, Skeleton } from "@/components/ui";
import { plural } from "@/lib/format";

function Listings() {
  const creating = useSearchParams().get("new") === "1";
  const router = useRouter();
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
            onSubmit={async ({ imageId, ...input }) => {
              await create({ ...input, imageId: imageId ?? undefined });
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
          <Empty
            title="You haven't listed anything yet"
            action={<Link href="/listings?new=1" className="btn-primary">List your first tool</Link>}
          >
            Neighbours can only borrow what&apos;s listed. It takes under a minute.
          </Empty>
        )
      ) : (
        <ul className="grid gap-3">
          {tools.map((t) => (
            <li key={t._id} className="card">
              {editing === t._id ? (
                <ToolForm
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  initialImageUrl={t.imageUrl}
                  submitLabel="Save changes"
                  onSubmit={async (input) => {
                    await update({ toolId: t._id, ...input });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                  <ToolImage src={t.imageUrl} category={t.category} name={t.name} className="h-20 w-24 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{t.name}</h2>
                      <AvailabilityBadge availability={t.availability} />
                    </div>
                    <p className="text-xs text-muted">
                      {t.category} · {t.condition} condition
                    </p>
                    {t.description && <p className="mt-2 text-sm">{t.description}</p>}
                    {t.pendingRequests > 0 && (
                      <Link href="/incoming" className="focus-ring mt-2 inline-block rounded text-sm font-medium text-accent underline">
                        {plural(t.pendingRequests, "pending request")}
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => setEditing(t._id)}>
                      Edit
                    </button>
                    <ActionButton
                      variant="danger"
                      confirm={{
                        prompt: t.pendingRequests ? "Remove and decline pending requests?" : "Remove this listing?",
                        confirmLabel: "Remove",
                      }}
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
