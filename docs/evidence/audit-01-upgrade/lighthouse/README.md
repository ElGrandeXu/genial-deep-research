# Lighthouse release evidence

These reports are generated from the optimized local production build, with no
provider request and no fixture injected into the application runtime.

Release thresholds: Performance >= 95, Accessibility = 100, Best Practices =
100, SEO >= 95. Responsive behavior at 390 px and 1440 px is covered separately
by the Playwright release suite.

Measured on 2026-08-27 against `next start`:

| Profile | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 100 | 100 | 100 | 100 | 211 ms | 467 ms | 0 | 0 ms |
| Mobile 390 px | 99 | 100 | 100 | 100 | 754 ms | 2,196 ms | 0 | 42 ms |

Raw reports: `desktop.report.json`, `desktop.report.html`,
`mobile-390.report.json`, and `mobile-390.report.html`.

Threshold check:

```powershell
corepack pnpm lighthouse:check
```
