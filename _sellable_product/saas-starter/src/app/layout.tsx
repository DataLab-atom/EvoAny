import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/providers";

const inter = Inter({ subsets: ["latin"] });

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SaaS Starter";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} - Ship your SaaS faster`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "The complete SaaS starter kit with authentication, payments, teams, and everything you need to launch your product.",
  keywords: [
    "saas",
    "starter",
    "nextjs",
    "react",
    "stripe",
    "authentication",
  ],
  authors: [{ name: APP_NAME }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: `${APP_NAME} - Ship your SaaS faster`,
    description:
      "The complete SaaS starter kit with authentication, payments, teams, and everything you need to launch your product.",
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} - Ship your SaaS faster`,
    description:
      "The complete SaaS starter kit with authentication, payments, teams, and everything you need to launch your product.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
