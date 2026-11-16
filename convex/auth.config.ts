import type { AuthConfig } from "convex/server";

// Convex trusts JWTs issued by this Clerk instance. Set CLERK_JWT_ISSUER_DOMAIN
// on the Convex deployment (npx convex env set ...), not in Next.js.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
