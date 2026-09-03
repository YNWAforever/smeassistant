// Google Business Profile: listing which locations a connected account
// manages, and their place_id.
//
// The only module that talks to this API, mirroring google-connection.ts's
// own "the only module that talks to Google [for OAuth]" pattern. Nothing
// here signs tokens or exchanges codes -- it only reads, given an access
// token the callback already obtained.

const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_READ_MASK = "name,metadata";

// Both the Account Management API and the per-account Locations API paginate.
// A merchant who manages several locations, whose matching one happens to land
// on page 2+, would otherwise be told place_not_managed -- indistinguishable
// from someone who genuinely does not manage the business. Bounded at 10 pages
// per call: this runs inside an interactive OAuth callback, not a background
// job, so an unbounded loop against a slow or misbehaving API would hang the
// user's browser tab rather than merely costing extra quota.
const MAX_PAGES = 10;

export interface ManagedLocation {
  placeId: string;
  locationName: string;
}

interface AccountsResponse {
  accounts?: Array<{ name?: string }>;
  nextPageToken?: string;
}

interface LocationsResponse {
  locations?: Array<{ name?: string; metadata?: { placeId?: string } }>;
  nextPageToken?: string;
}

async function getJson<T>(url: string, accessToken: string, fetchImpl: typeof fetch, failureCode: string): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Never include the token or the response body: Google's error payloads
    // can echo request details, and this is the one place in the codebase
    // that holds a live business.manage-scoped token in memory.
    throw new Error(failureCode);
  }
  return (await response.json()) as T;
}

/** Every account visible to this token, following nextPageToken up to MAX_PAGES. */
async function listAllAccounts(accessToken: string, fetchImpl: typeof fetch): Promise<Array<{ name?: string }>> {
  const accounts: Array<{ name?: string }> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(ACCOUNTS_URL);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await getJson<AccountsResponse>(
      url.toString(),
      accessToken,
      fetchImpl,
      "business_profile_accounts_failed",
    );
    accounts.push(...(response.accounts ?? []));
    pageToken = response.nextPageToken;
    if (!pageToken) break;
  }
  return accounts;
}

/** Every location under one account, following nextPageToken up to MAX_PAGES. */
async function listAllLocations(
  accountName: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Array<{ name?: string; metadata?: { placeId?: string } }>> {
  const locations: Array<{ name?: string; metadata?: { placeId?: string } }> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
    url.searchParams.set("readMask", LOCATIONS_READ_MASK);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await getJson<LocationsResponse>(
      url.toString(),
      accessToken,
      fetchImpl,
      "business_profile_locations_failed",
    );
    locations.push(...(response.locations ?? []));
    pageToken = response.nextPageToken;
    if (!pageToken) break;
  }
  return locations;
}

/**
 * Every place_id the connected account can manage, across every account and
 * location visible to this token. A business account frequently manages more
 * than one location, so the caller checks for membership in this list rather
 * than expecting exactly one entry.
 */
export async function listManagedPlaceIds(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ManagedLocation[]> {
  const accounts = await listAllAccounts(accessToken, fetchImpl);

  const results: ManagedLocation[] = [];
  for (const account of accounts) {
    if (!account.name) continue;
    const locations = await listAllLocations(account.name, accessToken, fetchImpl);
    for (const location of locations) {
      const placeId = location.metadata?.placeId;
      if (!placeId || !location.name) continue;
      results.push({ placeId, locationName: location.name });
    }
  }
  return results;
}
