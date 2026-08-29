import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  ambiguousDossier,
  completeDossier,
  completedSse,
  conflictDossier,
  failureSse,
  partialDossier,
  singleCandidateDossier,
  silenceDossier,
} from "./research-fixtures";

const evidenceDirectory = join(
  process.cwd(),
  "test-results",
  "e2e-screenshots",
);
const deterministicEvidenceDirectory = join(
  process.cwd(),
  "docs",
  "captures",
  "final-2026-08-28",
  "deterministic",
);
const updateReleaseEvidence = process.env.UPDATE_RELEASE_EVIDENCE === "1";

async function mockSse(page: Page, body: string): Promise<void> {
  await page.route("**/api/research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "cache-control": "no-store" },
      body,
    });
  });
}

async function submit(
  page: Page,
  name = "Acme Group",
  context = "Source officielle https://official.public.org",
): Promise<void> {
  await page.getByLabel("Nom").fill(name);
  await page.getByLabel("Type d’entité").selectOption(name === "Thomas Martin" ? "person" : "company");
  await page.getByLabel(/Contexte/).fill(context);
  await page.getByRole("button", { name: "Construire le dossier" }).click();
}

async function installStreamingFetch(
  page: Page,
  chunks: readonly string[],
  holdOpen = false,
): Promise<void> {
  await page.addInitScript(({ streamChunks, keepOpen }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!requestUrl.includes("/api/research")) return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let index = 0;
          let timer: number | undefined;
          const signal = init?.signal;
          const abort = () => {
            if (timer !== undefined) window.clearTimeout(timer);
            controller.error(new DOMException("Aborted", "AbortError"));
          };
          signal?.addEventListener("abort", abort, { once: true });
          const send = () => {
            const chunk = streamChunks[index];
            if (chunk === undefined) {
              if (!keepOpen) controller.close();
              return;
            }
            controller.enqueue(encoder.encode(chunk));
            index += 1;
            timer = window.setTimeout(send, 3);
          };
          send();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      });
    };
  }, { streamChunks: chunks, keepOpen: holdOpen });
}

test.beforeAll(async () => {
  if (updateReleaseEvidence) {
    await Promise.all([
      mkdir(evidenceDirectory, { recursive: true }),
      mkdir(deterministicEvidenceDirectory, { recursive: true }),
    ]);
  }
});

test("complete dossier renders extractive summary, adjacent sources and final focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSse(page, completedSse(completeDossier()));
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/u);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://genial-deep-research.vercel.app",
  );
  const robotsResponse = await page.request.get("/robots.txt");
  expect(robotsResponse.status()).toBe(200);
  expect(await robotsResponse.text()).toContain("Allow: /");
  await submit(page);

  await expect(page.getByRole("heading", { name: "Faits publics vérifiés" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecture rapide — extraits vérifiés" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3 faits métier étayés" })).toBeVisible();
  await expect(page.locator(".result-focus")).toBeFocused();
  expect(await page.locator(".result-focus").evaluate((node) => node.getBoundingClientRect().top)).toBeLessThanOrEqual(24);
  await expect(page.getByText("Preuve d’identité vérifiée")).toBeVisible();
  const identityProof = page.locator(".identity-proof");
  await expect(identityProof.locator(".evidence-card:visible")).toHaveCount(1);
  await identityProof.locator(".additional-evidence").click();
  await expect(identityProof.locator(".evidence-card:visible")).toHaveCount(2);
  await expect(identityProof.getByText("Contexte seulement")).toBeVisible();
  await expect(identityProof.getByRole("link", { name: /Registre public — Acme Group/u })).toHaveAttribute(
    "href",
    "https://registry.public.net/acme",
  );
  const activityCard = page.locator(".claim-card").filter({
    hasText: "Acme Group conçoit des logiciels de planification industrielle.",
  });
  await expect(activityCard.locator("blockquote")).toHaveCount(0);
  await expect(activityCard.getByRole("link", { name: /Acme Group — Site officiel/u })).toHaveAttribute(
    "href",
    "https://official.public.org/acme",
  );
  await expect(page.getByText("Portée : Acme Group — groupe")).toBeVisible();
  await expect(page.getByText("Identité résolue")).toBeVisible();
  await expect(page.getByText("3 faits étayés")).toBeVisible();
  await expect(page.getByText("Équivalence mécanique · occurrence 1")).toBeVisible();
  await expect(page.getByText("Correspondance exacte · occurrence 1").first()).toBeVisible();
  await expect(page.getByText("Extrait source vérifié · occurrence 1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (updateReleaseEvidence) {
    await page.screenshot({ path: join(evidenceDirectory, "complete-1440.png"), fullPage: true });
  }
});

test("partial dossier stays explicit and the 390 px layout does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSse(page, completedSse(partialDossier()));
  await page.goto("/");
  await page.getByLabel("Nom").fill("   ");
  await page.getByRole("button", { name: "Construire le dossier" }).click();
  await expect(page.locator("#name-error")).toContainText("autres que des espaces");
  await expect(page.getByLabel("Nom")).toBeFocused();
  await submit(page);
  await expect(page.getByRole("heading", { name: "Dossier partiel" })).toBeVisible();
  await page.getByText("Détails d’exécution").click();
  await expect(page.getByText(/faits uniques: 2\/3 minimum/u)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const liveTop = await page.locator(".live-panel").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  const methodTop = await page.locator(".method-note").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  expect(liveTop).toBeLessThan(methodTop);
  if (updateReleaseEvidence) {
    await page.screenshot({ path: join(evidenceDirectory, "partial-390.png"), fullPage: true });
  }
});

test("768 px layout, keyboard order and reduced motion remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installStreamingFetch(page, [
    'event: accepted\ndata: {"state":"accepted","executionId":"run-reduced","elapsedMs":1}\n\n',
    'event: researching_and_resolving\ndata: {"state":"researching_and_resolving","executionId":"run-reduced","elapsedMs":5}\n\n',
  ], true);
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Type d’entité")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Nom")).toBeFocused();
  const focusOutline = await page.getByLabel("Nom").evaluate((node) => {
    const style = getComputedStyle(node);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusOutline.style).not.toBe("none");
  expect(Number.parseFloat(focusOutline.width)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/Contexte/u)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Construire le dossier" })).toBeFocused();

  await submit(page);
  await expect(page.getByRole("heading", { name: "Recherche Web et résolution" })).toBeVisible();

  const formBottom = await page.locator(".search-form").evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
  const liveBox = await page.locator(".live-panel").evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top + window.scrollY, bottom: box.bottom + window.scrollY };
  });
  const methodTop = await page.locator(".method-note").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  expect(liveBox.top).toBeGreaterThanOrEqual(formBottom);
  expect(liveBox.bottom).toBeLessThanOrEqual(methodTop);
  const reducedDuration = await page.locator(".status-dot").evaluate((node) => {
    const value = getComputedStyle(node).animationDuration;
    return value.endsWith("ms") ? Number.parseFloat(value) / 1_000 : Number.parseFloat(value);
  });
  expect(reducedDuration).toBeLessThanOrEqual(0.00001);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Annuler" }).click();
});

test("ambiguity keeps candidates separate and clarification only prefills", async ({ page }) => {
  const submittedBodies: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/research") && request.method() === "POST") {
      submittedBodies.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  await mockSse(page, completedSse(ambiguousDossier()));
  await page.goto("/");
  await submit(page, "Thomas Martin");
  await expect(page.getByRole("heading", { name: "Plusieurs candidats restent possibles" })).toBeVisible();
  await expect(page.getByText("Candidat possible 1")).toBeVisible();
  await expect(page.getByText("Candidat possible 2")).toBeVisible();
  await page.getByRole("button", { name: /Préremplir avec Thomas Martin/u }).first().click();
  await expect(page.getByLabel("Nom")).toHaveValue("Thomas Martin");
  await expect(page.getByLabel(/Contexte/)).toHaveValue(
    "Source officielle https://official.public.org",
  );
  expect(submittedBodies).toHaveLength(1);
  await expect(page.getByRole("status")).toContainText("relancez manuellement");
  await expect(page.getByLabel("Nom")).toBeFocused();
  await page.getByRole("button", { name: "Construire le dossier" }).click();
  await expect.poll(() => submittedBodies.length).toBe(2);
  expect(submittedBodies[1]).toMatchObject({
    name: "Thomas Martin",
    entityType: "person",
    context: "Source officielle https://official.public.org",
    identitySourceUrl: "https://studio.public.org/thomas-martin",
  });
});

test("a single plausible candidate uses a singular clarification label", async ({ page }) => {
  await mockSse(page, completedSse(singleCandidateDossier()));
  await page.goto("/");
  await submit(page, "Thomas Martin");
  await expect(page.getByRole("heading", { name: "Un candidat reste à confirmer" })).toBeVisible();
  await expect(page.getByText("Candidat à confirmer")).toBeVisible();
  await expect(page.getByText("Plusieurs candidats", { exact: false })).toHaveCount(0);
});

test("deterministic conflict keeps both sourced versions on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSse(page, completedSse(conflictDossier()));
  await page.goto("/");
  await submit(
    page,
    "Entreprise Synthétique Borée",
    "Scénario déterministe — sources synthétiques .invalid",
  );

  await expect(page.getByRole("heading", { name: "Chiffre d’affaires publié en EUR" })).toBeVisible();
  await expect(page.getByText("Conflit confirmé")).toBeVisible();
  await expect(page.getByRole("heading", { name: "10 millions EUR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "12 millions EUR" })).toBeVisible();
  await expect(page.locator(".conflict-dimensions").getByText("exercice 2025", { exact: true })).toBeVisible();
  await expect(page.locator(".conflict-dimensions").getByText("Entreprise Synthétique Borée — société", { exact: true })).toBeVisible();
  await expect(page.getByText("Décision de sécurité")).toBeVisible();
  await expect(page.getByRole("link", { name: /Rapport synthétique Borée 2025/u })).toHaveAttribute(
    "href",
    "https://official.example.invalid/boree-2025",
  );
  await expect(page.getByRole("link", { name: /Analyse synthétique Borée 2025/u })).toHaveAttribute(
    "href",
    "https://specialized.example.invalid/boree-2025",
  );
  await expect(page.locator(".version-card")).toHaveCount(2);
  await expect(page.locator(".facts-section")).toHaveCount(0);
  await expect(page.getByText(/Scénario de test déterministe/u)).toBeVisible();
  await expect(page.locator(".result-focus")).toBeFocused();
  expect(await page.locator(".result-focus").evaluate((node) => node.getBoundingClientRect().top)).toBeLessThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (updateReleaseEvidence) {
    await page.screenshot({ path: join(deterministicEvidenceDirectory, "conflict-1440.png"), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await submit(
    page,
    "Entreprise Synthétique Borée",
    "Scénario déterministe — sources synthétiques .invalid",
  );
  await expect(page.getByRole("heading", { name: "10 millions EUR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "12 millions EUR" })).toBeVisible();
  await expect(page.locator(".conflict-dimensions").getByText("exercice 2025", { exact: true })).toBeVisible();
  await expect(page.locator(".conflict-dimensions").getByText("Entreprise Synthétique Borée — société", { exact: true })).toBeVisible();
  await expect(page.getByText("Décision de sécurité")).toBeVisible();
  await expect(page.getByRole("link", { name: /Rapport synthétique Borée 2025/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analyse synthétique Borée 2025/u })).toBeVisible();
  await expect(page.locator(".version-card")).toHaveCount(2);
  await expect(page.locator(".facts-section")).toHaveCount(0);
  const dimensionBoxes = await page.locator(".conflict-dimensions > div").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }),
  );
  expect(dimensionBoxes[1]!.top - dimensionBoxes[0]!.bottom).toBeLessThanOrEqual(12);
  const sourceLinkHeights = await page.locator(".version-card .source-link").evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(Math.max(...sourceLinkHeights)).toBeLessThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (updateReleaseEvidence) {
    await page.screenshot({ path: join(deterministicEvidenceDirectory, "conflict-390.png"), fullPage: true });
  }
});

test("honest silence and technical failure remain distinct", async ({ page }) => {
  await mockSse(page, completedSse(silenceDossier()));
  await page.goto("/");
  await submit(page, "Entité inconnue");
  await expect(page.getByRole("heading", { name: "Données publiques insuffisantes" })).toBeVisible();
  await expect(page.getByText(/Aucune source suffisamment fiable/u)).toBeVisible();

  await page.unroute("**/api/research");
  await mockSse(page, failureSse());
  await submit(page, "Erreur technique");
  await expect(page.getByRole("heading", { name: "Aucun dossier produit" })).toBeVisible();
  await expect(page.getByText(/temporairement indisponible/u)).toBeVisible();
  await expect(page.locator(".live-heading h2")).toHaveText("Recherche interrompue");
});

test("fragmented SSE reaches completion without accepting obsolete phases", async ({ page }) => {
  const body = completedSse(completeDossier());
  const chunks = Array.from({ length: Math.ceil(body.length / 17) }, (_, index) =>
    body.slice(index * 17, (index + 1) * 17),
  );
  await installStreamingFetch(page, chunks);
  await page.goto("/");
  await submit(page);
  await expect(page.getByRole("heading", { name: "Faits publics vérifiés" })).toBeVisible();
  await expect(page.locator(".timeline-label")).toHaveText([
    "Demande admise",
    "Recherche Web et résolution",
    "Lecture et vérification des sources",
    "Construction du dossier",
    "Contrôle final des preuves",
    "Dossier prêt",
  ]);
});

test("cancellation aborts an in-flight stream and emits no dossier", async ({ page }) => {
  const prefix = [
    'event: accepted\ndata: {"state":"accepted","executionId":"run-cancel","elapsedMs":1}\n\n',
    'event: researching_and_resolving\ndata: {"state":"researching_and_resolving","executionId":"run-cancel","elapsedMs":5}\n\n',
  ];
  await installStreamingFetch(page, prefix, true);
  await page.goto("/");
  await submit(page);
  await expect(page.getByRole("heading", { name: "Recherche Web et résolution" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Recherche annulée", level: 3 })).toBeVisible();
  await expect(page.locator(".live-heading h2")).toHaveText("Recherche annulée");
  await expect(page.locator(".result-card")).toHaveCount(0);
});

test("client masks a structurally plausible dossier with two resolved candidates", async ({ page }) => {
  const malformed = completeDossier();
  malformed.identity.candidates.push({
    ...malformed.identity.candidates[0]!,
    subject_id: "subject-second",
    display_name: "Acme Group Bis",
  });
  await mockSse(page, completedSse(malformed));
  await page.goto("/");
  await submit(page);
  await expect(page.getByRole("heading", { name: "Contrôle de traçabilité échoué" })).toBeVisible();
  await expect(page.getByText("Aucun fait n’a été affiché.")).toBeVisible();
  await expect(page.locator(".claim-card")).toHaveCount(0);
});

test("unknown route has a local 404", async ({ page }) => {
  const response = await page.goto("/route-inexistante");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable." })).toBeVisible();
});
