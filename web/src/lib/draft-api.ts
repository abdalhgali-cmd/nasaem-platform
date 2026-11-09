// The intake draft token is a bearer credential. It travels in a header on
// /intake-drafts/current so it never lands in a URL (access logs, history,
// Referer). The API still accepts the old /intake-drafts/:token form for
// clients that already shipped.
export function draftUrl(apiUrl: string, suffix = ""): string {
  return `${apiUrl}/intake-drafts/current${suffix}`;
}

export function draftAuth(token: string): Record<string, string> {
  return { "X-Draft-Token": token };
}
