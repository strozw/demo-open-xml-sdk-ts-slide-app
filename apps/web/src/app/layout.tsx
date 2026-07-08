import type { Metadata } from "next";

import "@workspace/ui/globals.css";
// Self-hosted Noto Sans/Serif JP — shared by the editor display and the
// PPTX font embedding (see fonts.css / public/fonts).
import "./fonts.css";

export const metadata: Metadata = {
  title: "PPTX Slide Studio",
  description: "Create slides in the browser and export them as .pptx with openxmlsdkts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
