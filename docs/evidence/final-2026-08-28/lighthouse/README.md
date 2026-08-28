# Lighthouse release evidence

These reports are generated from the optimized local production build, with no
provider request and no fixture injected into the application runtime.

Release thresholds: Performance >= 95, Accessibility = 100, Best Practices =
100, SEO >= 95. Responsive behavior at 390 px and 1440 px is covered separately
by the Playwright release suite.

Measured on 2026-08-28 against the optimized premium candidate with `next start`. No provider request and no fixture injection occurred. The desktop Lighthouse viewport is 1 350 × 940; the 1 440 px layout is covered by Playwright.

| Profile | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 100 | 100 | 100 | 100 | 210 ms | 467 ms | 0 | 0 ms |
| Mobile 390 px | 99 | 100 | 100 | 100 | 755 ms | 2 169 ms | 0 | 14 ms |

Raw reports: `desktop.report.json` and `mobile-390.report.json`.

Threshold check:

```powershell
corepack pnpm lighthouse:check
```
