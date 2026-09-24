import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seedance Studio",
  description: "Seedance 2.5 video generation via the Higgsfield API",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-neutral-950 font-sans text-neutral-100">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
              Seedance Studio
            </Link>
            <Link href="/" className="text-sm text-neutral-400 hover:text-white">
              Studio
            </Link>
            <Link href="/gallery" className="text-sm text-neutral-400 hover:text-white">
              Gallery
            </Link>
            <div className="ml-auto">
              <LogoutButton />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
