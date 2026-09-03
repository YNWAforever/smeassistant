export type SerpApiFetcher = (params: Record<string, string>, timeoutMs?: number) => Promise<any>;

export function getAiOverviewPageToken(data: any): string | null {
  const candidates = [
    data?.ai_overview?.page_token,
    data?.ai_overview_page_token,
    data?.page_token,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

export function mergeAiOverviewIntoSearchData(searchData: any, aiOverviewData: any): any {
  const searchOverview = searchData?.ai_overview;
  const followUpOverview =
    aiOverviewData?.ai_overview ??
    (aiOverviewData?.text_blocks || aiOverviewData?.references ? aiOverviewData : null);

  if (!followUpOverview) {
    return searchData;
  }

  return {
    ...searchData,
    ai_overview: {
      ...(searchOverview ?? {}),
      ...followUpOverview,
      page_token:
        searchOverview?.page_token ??
        searchData?.ai_overview_page_token ??
        searchData?.page_token ??
        followUpOverview.page_token,
    },
  };
}

export async function fetchGoogleSearchWithAiOverview(
  params: Record<string, string>,
  serpApiKey: string,
  fetcher: SerpApiFetcher,
): Promise<any> {
  const searchData = await fetcher(params);
  const pageToken = getAiOverviewPageToken(searchData);
  if (!pageToken) {
    return searchData;
  }

  try {
    const aiOverviewData = await fetcher(
      {
        engine: "google_ai_overview",
        page_token: pageToken,
        api_key: serpApiKey,
      },
      20000,
    );
    return mergeAiOverviewIntoSearchData(searchData, aiOverviewData);
  } catch (error) {
    console.error("[runSerpAEO] AI Overview follow-up failed", error);
    return searchData;
  }
}
