import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">Erreur 404</p>
      <h1>Page introuvable.</h1>
      <p>Cette application ne publie que son parcours de recherche vérifiable.</p>
      <Link href="/">Revenir à la recherche</Link>
    </main>
  );
}
