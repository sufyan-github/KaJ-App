import type { Metadata } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";

import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const bangla = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-bangla",
});

export const metadata: Metadata = {
  title: "KAAJ Operations",
  description: "Secure marketplace operations console",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Rendered per request so Next can put the CSP nonce from proxy.ts on its
  // scripts and styles; a prerendered page would carry none.
  await connection();
  return (
    <html lang="en">
      <body className={`${sans.variable} ${bangla.variable}`}>{children}</body>
    </html>
  );
}
