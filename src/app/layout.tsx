import type { Metadata, Viewport } from "next";
import { PrintJobProvider } from "@/context/PrintJobContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scan2Print",
  description: "Fast and simple document printing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PrintJobProvider>
          {children}
        </PrintJobProvider>
      </body>
    </html>
  );
}
