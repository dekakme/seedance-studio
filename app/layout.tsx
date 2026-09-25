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
      <body className="min-h-screen bg-[#0b0b0c] font-sans text-neutral-100">
        <header className="flex h-[49px] items-center gap-3 border-b border-white/5 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-[#d7ff3a]" /> Seedance Studio
          </Link>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
