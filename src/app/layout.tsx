import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Montserrat } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

// Theme: tweakcn "Nature" (see globals.css).
const sans = Montserrat({ variable: "--font-app-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "LendLoop · borrow tools from your neighbours",
  description: "A neighbourhood tool-lending board.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          appearance={{
            // Clerk needs plain colours; these match the Nature tokens in globals.css.
            variables: { colorPrimary: "#357d3d", borderRadius: "0.5rem", fontFamily: "var(--font-app-sans)" },
          }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
