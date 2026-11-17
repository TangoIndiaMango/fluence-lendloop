"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Empty, Skeleton, Toggle } from "@/components/ui";

export function LendersTable() {
  const lenders = useQuery(api.users.lenders);
  const setTrusted = useMutation(api.users.setTrustedLender);

  if (lenders === undefined) return <Skeleton rows={2} />;
  if (lenders.length === 0) return <Empty title="No one has listed a tool yet" />;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Name</th>
            <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Email</th>
            <th scope="col" className="px-4 py-2 font-medium">Listings</th>
            <th scope="col" className="px-4 py-2 font-medium">
              Trusted<span className="hidden sm:inline"> Lender</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lenders.map((u) => (
            <tr key={u._id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                {u.name} {u.role === "admin" && <span className="text-xs text-muted">(admin)</span>}
                <span className="block break-all text-xs text-muted sm:hidden">{u.email ?? "No email"}</span>
              </td>
              <td className="hidden px-4 py-2 text-muted sm:table-cell">{u.email ?? "—"}</td>
              <td className="px-4 py-2">{u.activeListings}</td>
              <td className="px-4 py-2">
                <Toggle
                  checked={u.trustedLender}
                  label={`Trusted Lender: ${u.name}`}
                  onChange={(trusted) => setTrusted({ userId: u._id, trusted })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
