import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M7 12a5 5 0 0 1 5-5h3" />
          <path d="M17 12a5 5 0 0 1-5 5H9" />
          <path d="M13 4.5 15.5 7 13 9.5" />
          <path d="M11 14.5 8.5 17l2.5 2.5" />
        </svg>
      </span>
      <span className="text-lg">LendLoop</span>
    </Link>
  );
}
