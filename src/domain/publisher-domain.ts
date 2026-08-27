const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "com.au",
  "com.br",
  "com.cn",
  "com.mx",
  "co.jp",
  "co.nz",
  "co.za",
]);

export function publisherDomainForUrl(value: string): string | null {
  try {
    const hostname = new URL(value).hostname
      .toLocaleLowerCase("en-US")
      .replace(/^www\./u, "")
      .replace(/\.$/u, "");
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length <= 2) return hostname;
    const lastTwo = labels.slice(-2).join(".");
    return COMMON_SECOND_LEVEL_SUFFIXES.has(lastTwo)
      ? labels.slice(-3).join(".")
      : lastTwo;
  } catch {
    return null;
  }
}
