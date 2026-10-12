import type { Metadata } from "next";
import "./globals.css";
import MobileApp from "./mobile-app";

export const metadata: Metadata = {
  title: "Bogdan & Roxana — Command Center",
  description: "Dashboard comun pentru proiecte, taskuri, deadline-uri și blocaje.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true, title:"Command Center", statusBarStyle:"default"},
  icons: {
    apple: "/icons/app-192.png",
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport = {width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#D7E6EE"};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body className="antialiased"><MobileApp/>{children}</body>
    </html>
  );
}
