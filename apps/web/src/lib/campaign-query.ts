export type PublicQuery = Record<string, string | string[] | undefined>;
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/** Carry public campaign labels in navigation only; no identifiers, cookies or tracking. */
export function campaignQuery(source: PublicQuery): string {
  const query = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value)) query.set(key, value);
  }
  return query.toString();
}

export function withCampaign(path: string, campaign: string): string {
  const destination = new URL(path, 'https://operatoros.net');
  new URLSearchParams(campaign).forEach((value, key) => {
    if (CAMPAIGN_KEYS.some(allowed => allowed === key)) destination.searchParams.set(key, value);
  });
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
