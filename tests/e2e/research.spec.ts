import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  ambiguousDossier,
  completeDossier,
  completedSse,
  failureSse,
  partialDossier,
  silenceDossier,
} from "./research-fixtures";

const evidenceDirectory = join(
  process.cwd(),
  "docs",
  "evidence",
  "audit-01-upgrade",
  "screenshots",
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

async function submit(page: Page, name = "Acme Group"): Promise<void> {
  await page.getByLabel("Nom").fill(name);
  await page.getByLabel("Type d’entité").selectOption(name === "Thomas Martin" ? "person" : "company");
  await page.getByLabel(/Contexte/).fill("Source officielle https://official.public.org");
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
  if (updateReleaseEvidence) await mkdir(evidenceDirectory, { recursive: true });
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
  await expect(page.getByText("Preuve d’identité vérifiée")).toBeVisible();
  const activityCard = page.locator(".claim-card").filter({
    hasText: "Acme Group conçoit des logiciels de planification industrielle.",
  });
  await expect(activityCard.locator("blockquote")).toHaveCount(0);
  await expect(activityCard.getByRole("link", { name: /Acme Group — Site officiel/u })).toHaveAttribute(
    "href",
    "https://official.public.org/acme",
  );
  await expect(page.getByText("Portée : Acme Group — groupe")).toBeVisible();
  await expect(page.locator(".result-focus")).toBeFocused();
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
  if (updateReleaseEvidence) {
    await page.screenshot({ path: join(evidenceDirectory, "partial-390.png"), fullPage: true });
  }
});

test("ambiguity keeps candidates separate and clarification only prefills", async ({ page }) => {
  await mockSse(page, completedSse(ambiguousDossier()));
  await page.goto("/");
  await submit(page, "Thomas Martin");
  await expect(page.getByRole("heading", { name: "Plusieurs candidats restent possibles" })).toBeVisible();
  await expect(page.getByText("Candidat possible 1")).toBeVisible();
  await expect(page.getByText("Candidat possible 2")).toBeVisible();
  await page.getByRole("button", { name: "Préremplir avec ce candidat" }).first().click();
  await expect(page.getByLabel("Nom")).toHaveValue("Thomas Martin");
  await expect(page.getByLabel(/Contexte/)).toHaveValue(/studio\.public\.org/u);
  await expect(page.getByRole("status")).toContainText("relancez manuellement");
  await expect(page.getByLabel("Nom")).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "Recherche annulée" })).toBeVisible();
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
