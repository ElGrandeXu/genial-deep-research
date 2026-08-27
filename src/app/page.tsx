import { ResearchForm } from "./research-form";

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Boucle verticale sourcée · M5</p>
        <h1>Un fait.<br />Une source.</h1>
        <p className="intro">
          Génial recherche une seule affirmation publique et atomique. Ce prototype
          ne produit pas encore un dossier complet.
        </p>
      </header>
      <ResearchForm />
    </main>
  );
}
