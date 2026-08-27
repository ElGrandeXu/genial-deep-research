import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://genial-deep-research.vercel.app"),
  title: "GENIAL — Recherche publique vérifiable",
  description:
    "Un dossier compact où chaque fait public reste relié à sa preuve consultable.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
