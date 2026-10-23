import type { ReactNode, ReactElement } from "react";
import "./globals.css";
import { themeBootstrap } from "../lib/theme";
import type { Metadata } from "next";
import localFont from "next/font/local";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  preload: false,
});
const sourceSerif = localFont({
  src: "./fonts/SourceSerif4Variable-Roman.woff2",
  variable: "--font-source-serif",
  weight: "200 900",
  display: "swap",
  preload: false,
});
const sourceSans = localFont({
  src: "./fonts/SourceSans3VF-Upright.woff2",
  variable: "--font-source-sans",
  weight: "200 900",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s | Client portal" },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    // The static bootstrap changes only the theme attribute before hydration.
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} ${sourceSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
