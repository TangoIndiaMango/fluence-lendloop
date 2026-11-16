// Shared between Convex functions and the Next.js UI so both agree on the
// allowed values. Keep this file free of server-only imports.

export const CATEGORIES = [
  "Power tools",
  "Hand tools",
  "Garden",
  "Ladders & access",
  "Cleaning",
  "Kitchen",
  "Camping & outdoors",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LOAN_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LIMITS = {
  toolName: 60,
  toolDescription: 500,
  requestMessage: 300,
  maxLoanDays: 30,
  maxBookAheadDays: 90,
  maxListingsPerUser: 50,
  maxOpenRequestsPerBorrower: 10,
} as const;
