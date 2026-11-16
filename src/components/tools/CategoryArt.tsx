import type { Category } from "@convex/lib/constants";

// One line illustration per category, drawn on a 48×48 grid. Used when a
// listing has no photo, and on the public page (which never shows photos).

const ART: Record<Category, { tint: string; ink: string; paths: string[] }> = {
  "Power tools": {
    tint: "bg-amber-50",
    ink: "text-amber-700",
    paths: ["M8 15h20a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4h-7l-2.5 13h-7L14 26H8z", "M32 18.5h9", "M41 20.5h3", "M13 31h6"],
  },
  "Hand tools": {
    tint: "bg-stone-100",
    ink: "text-stone-700",
    paths: ["M10 12h17l5 4.5-5 4.5H10a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z", "M19 21v19", "M16 40h6"],
  },
  Garden: {
    tint: "bg-emerald-50",
    ink: "text-emerald-700",
    paths: ["M24 41V22", "M24 27c-8 0-13-5-13-13 8 0 13 5 13 13z", "M24 22c0-7 5-12 13-12 0 7-5 12-13 12z", "M16 41h16"],
  },
  "Ladders & access": {
    tint: "bg-sky-50",
    ink: "text-sky-700",
    paths: ["M16 7v34", "M32 7v34", "M16 14h16", "M16 22h16", "M16 30h16", "M16 38h16"],
  },
  Cleaning: {
    tint: "bg-teal-50",
    ink: "text-teal-700",
    paths: ["M17 20h13v18a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3z", "M19 20v-7h9l5 4", "M28 13h-3", "M37 12l3-2", "M37 17h4", "M37 22l3 2"],
  },
  Kitchen: {
    tint: "bg-rose-50",
    ink: "text-rose-700",
    paths: ["M10 22h28v9a9 9 0 0 1-9 9H19a9 9 0 0 1-9-9z", "M5 22h5", "M38 22h5", "M19 16c0-2 2-2 2-4", "M27 16c0-2 2-2 2-4"],
  },
  "Camping & outdoors": {
    tint: "bg-lime-50",
    ink: "text-lime-800",
    paths: ["M5 40 24 9l19 31z", "M18 40l6-11 6 11", "M3 40h42"],
  },
  Other: {
    tint: "bg-slate-100",
    ink: "text-slate-600",
    paths: ["M9 17 24 9l15 8v15l-15 8-15-8z", "M9 17l15 8 15-8", "M24 25v15"],
  },
};

export function CategoryArt({ category, className = "" }: { category: Category; className?: string }) {
  const { tint, ink, paths } = ART[category];
  return (
    <div aria-hidden className={`grid place-items-center ${tint} ${ink} ${className}`}>
      <svg viewBox="0 0 48 48" className="h-1/2 max-h-20 w-1/2 max-w-20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}

/** A listing's photo, or its category illustration when there isn't one. */
export function ToolImage({
  src,
  category,
  name,
  className = "",
}: {
  src: string | null;
  category: Category;
  name: string;
  className?: string;
}) {
  if (!src) return <CategoryArt category={category} className={className} />;
  return (
    // Convex serves the file; next/image would proxy it through our server
    // for little gain at this size, so a lazy <img> is the simpler choice.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`Photo of ${name}`} loading="lazy" decoding="async" className={`object-cover ${className}`} />
  );
}
