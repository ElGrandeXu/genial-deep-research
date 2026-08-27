import { ResearchForm } from "./research-form";

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div className="masthead">
          <span className="wordmark">GENIAL</span>
          <span>Recherche publique vérifiable</span>
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Décider avec des faits traçables</p>
            <h1>Un dossier.<br />Des preuves.</h1>
          </div>
          <div className="hero-copy">
            <p>
              Entrez une personne ou une entreprise. GENIAL distingue l’identité,
              recherche des informations publiques et rattache chaque fait affiché
              à son extrait source.
            </p>
            <ul>
              <li>Ambiguïtés refusées</li>
              <li>Informations datées</li>
              <li>Contradictions visibles</li>
            </ul>
          </div>
        </div>
      </header>
      <ResearchForm />
      <footer className="site-footer">
        <span>GENIAL</span>
        <p>Recherche bornée à des informations publiques et vérifiables.</p>
      </footer>
    </main>
  );
}
