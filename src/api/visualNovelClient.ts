import type {
  CharacterQueryResponse,
  CharacterTraitQueryResponse,
  QueryParameters,
  UserVisualNovelListResponse,
  VisualNovelAuthInfoResponse,
  VisualNovelDetailedQueryResponse,
  VisualNovelExternalLinkEntry,
  VisualNovelTagQueryResponse
} from '../types/apiTypes';

const VNDB_DIRECT_BASE_URL = 'https://api.vndb.org/kana';
const VNDB_PROXY_BASE_PATH = '/api/vndb';
// During local development we route through Vite proxy to avoid browser CORS issues on write endpoints.
const VNDB_API_BASE_URL = import.meta.env.DEV ? VNDB_PROXY_BASE_PATH : VNDB_DIRECT_BASE_URL;
const CACHE_TIME_TO_LIVE_MILLISECONDS = 5 * 60 * 1000;
const listQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const detailQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const releaseQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const tagQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const characterQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const traitQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const userListQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const statsQueryCache = new Map<string, { expiresAt: number; payload: unknown }>();

function buildVndbApiUrl(endpointPath: string) {
  return `${VNDB_API_BASE_URL}${endpointPath}`;
}

// Normalize all VN identifiers to canonical `v<number>` form for consistent cache keys and API writes.
function normalizeVisualNovelIdentifier(visualNovelIdentifier: string) {
  const normalizedRawIdentifier = visualNovelIdentifier.trim().toLowerCase();
  return normalizedRawIdentifier.startsWith('v')
    ? normalizedRawIdentifier
    : `v${normalizedRawIdentifier}`;
}

function readFromCache(cacheStore: Map<string, { expiresAt: number; payload: unknown }>, cacheKey: string) {
  const cachedEntry = cacheStore.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (Date.now() > cachedEntry.expiresAt) {
    cacheStore.delete(cacheKey);
    return null;
  }

  return cachedEntry.payload;
}

function writeToCache(cacheStore: Map<string, { expiresAt: number; payload: unknown }>, cacheKey: string, payload: unknown) {
  cacheStore.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TIME_TO_LIVE_MILLISECONDS,
    payload
  });
}

// The VNDB API operates via custom JSON queries over POST rather than standard REST routes.
// This function isolates the network layer so the UI components never interact with raw fetch logic.
export async function fetchVisualNovelEntries(parameters: QueryParameters) {
  const targetApiEndpoint = buildVndbApiUrl('/vn');
  
  // Keep request payload shape aligned with VNDB's POST /vn format.
  const requestPayload = {
    filters: parameters.queryFilters,
    fields: parameters.requestedFields,
    results: parameters.maxResults,
    page: parameters.pageNumber,
    sort: parameters.sortField,
    reverse: parameters.reverseSort
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(listQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error('Network boundary failure: Unable to retrieve visual novel entries.');
  }

  const responsePayload = await networkResponse.json();
  writeToCache(listQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchAuthenticationInfoByToken(authenticationToken: string): Promise<VisualNovelAuthInfoResponse> {
  const targetApiEndpoint = buildVndbApiUrl('/authinfo');

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'GET',
    headers: {
      Authorization: `Token ${authenticationToken}`
    }
  });

  if (!networkResponse.ok) {
    throw new Error('Authentication failure: Invalid token or unauthorized request.');
  }

  return networkResponse.json();
}

export async function fetchDatabaseStatistics() {
  const targetApiEndpoint = buildVndbApiUrl('/stats');
  const cacheKey = 'global_database_stats';
  const cachedPayload = readFromCache(statsQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as {
      visualNovels: number;
      tags: number;
      releases: number;
      producers: number;
      staff: number;
      characters: number;
      traits: number;
    };
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'GET'
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve VNDB statistics (HTTP ${networkResponse.status}).`);
  }

  const responsePayload = await networkResponse.json() as Record<string, unknown>;
  function readNumericStatValue(...candidateKeys: string[]) {
    const matchingCandidate = candidateKeys.find((candidateKey) => (
      typeof responsePayload[candidateKey] === 'number' && Number.isFinite(responsePayload[candidateKey] as number)
    ));
    return matchingCandidate ? Number(responsePayload[matchingCandidate]) : 0;
  }

  const normalizedStatistics = {
    visualNovels: readNumericStatValue('vn', 'vns', 'visual_novels', 'visualNovels'),
    tags: readNumericStatValue('tags', 'tag'),
    releases: readNumericStatValue('releases', 'release'),
    producers: readNumericStatValue('producers', 'producer'),
    staff: readNumericStatValue('staff'),
    characters: readNumericStatValue('chars', 'characters', 'character'),
    traits: readNumericStatValue('traits', 'trait')
  };

  writeToCache(statsQueryCache, cacheKey, normalizedStatistics);
  return normalizedStatistics;
}

// Append this function to src/api/visualNovelClient.ts

// This function isolates the network logic for retrieving a comprehensive single record.
async function fetchVisualNovelDetailedPayloadByFields(
  visualNovelIdentifier: string,
  fieldSelection: string
): Promise<VisualNovelDetailedQueryResponse> {
  const targetApiEndpoint = buildVndbApiUrl('/vn');
  if (typeof visualNovelIdentifier !== 'string' || visualNovelIdentifier.trim() === '') {
    throw new Error('Detail lookup failure: Missing visual novel identifier.');
  }

  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const requestPayload = {
    filters: ["id", "=", normalizedVisualNovelIdentifier],
    fields: fieldSelection,
    results: 1
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(detailQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as VisualNovelDetailedQueryResponse;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve visual novel details (HTTP ${networkResponse.status}).`);
  }

  const rawResponsePayload = await networkResponse.json() as { results?: Array<Record<string, unknown>>; more?: boolean };
  const responsePayload: VisualNovelDetailedQueryResponse = {
    results: Array.isArray(rawResponsePayload.results)
      ? (rawResponsePayload.results as unknown as VisualNovelDetailedQueryResponse['results'])
      : [],
    more: Boolean(rawResponsePayload.more)
  };
  writeToCache(detailQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchVisualNovelCoreDetailsById(visualNovelIdentifier: string) {
  const coreFieldSelection = "id, title, rating, image.url, image.thumbnail, image.sexual, description, released";
  return fetchVisualNovelDetailedPayloadByFields(visualNovelIdentifier, coreFieldSelection);
}

export async function fetchVisualNovelSupplementalDetailsById(visualNovelIdentifier: string) {
  const supplementalFieldSelection =
    "id, screenshots.url, screenshots.thumbnail, tags.id, tags.name, tags.category, tags.spoiler, tags.rating, relations.id, relations.title, relations.relation, developers.id, developers.name, developers.original";
  return fetchVisualNovelDetailedPayloadByFields(visualNovelIdentifier, supplementalFieldSelection);
}

export async function prefetchVisualNovelCoreDetailsById(visualNovelIdentifier: string) {
  try {
    await fetchVisualNovelCoreDetailsById(visualNovelIdentifier);
  } catch {
    // Prefetch is best-effort only.
  }
}

export async function fetchVisualNovelStoreLinksById(visualNovelIdentifier: string): Promise<VisualNovelExternalLinkEntry[]> {
  const targetApiEndpoint = buildVndbApiUrl('/release');
  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const requestPayload = {
    filters: ["vn", "=", ["id", "=", normalizedVisualNovelIdentifier]],
    fields: "id, title, released, official, freeware, extlinks.url, extlinks.label, extlinks.name, extlinks.id",
    results: 100,
    sort: "released",
    reverse: true
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(releaseQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as VisualNovelExternalLinkEntry[];
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve visual novel store links (HTTP ${networkResponse.status}).`);
  }

  const responsePayload = await networkResponse.json() as {
    results?: Array<Record<string, unknown>>;
  };
  const ALLOWED_STORE_NAMES = ['steam', 'jast usa', 'jast', 'gog', 'mangagamer'];

  const normalizedStoreLinks: VisualNovelExternalLinkEntry[] = [];
  const dedupeKeySet = new Set<string>();
  const releaseEntries = Array.isArray(responsePayload.results) ? responsePayload.results : [];
  releaseEntries.forEach((releaseEntry) => {
    if (!releaseEntry || typeof releaseEntry !== 'object') {
      return;
    }

    const releaseIdentifier = typeof releaseEntry.id === 'string'
      ? releaseEntry.id
      : typeof releaseEntry.id === 'number'
        ? `r${releaseEntry.id}`
        : undefined;
    const releaseTitle = typeof releaseEntry.title === 'string' && releaseEntry.title.trim() !== ''
      ? releaseEntry.title
      : undefined;
    const externalLinks = Array.isArray((releaseEntry as { extlinks?: unknown }).extlinks)
      ? (releaseEntry as { extlinks: unknown[] }).extlinks
      : [];

    externalLinks.forEach((externalLinkEntry) => {
      if (!externalLinkEntry || typeof externalLinkEntry !== 'object') {
        return;
      }

      const rawExternalLink = externalLinkEntry as Record<string, unknown>;
      const externalUrl = typeof rawExternalLink.url === 'string' ? rawExternalLink.url.trim() : '';
      if (externalUrl === '') {
        return;
      }

      const externalLabel = typeof rawExternalLink.label === 'string' && rawExternalLink.label.trim() !== ''
        ? rawExternalLink.label.trim()
        : typeof rawExternalLink.name === 'string' && rawExternalLink.name.trim() !== ''
          ? rawExternalLink.name.trim()
          : 'External Link';
      const externalSource = typeof rawExternalLink.name === 'string' && rawExternalLink.name.trim() !== ''
        ? rawExternalLink.name.trim()
        : undefined;
      const normalizedSourceName = (externalSource ?? '').toLowerCase();
      const normalizedLabelName = externalLabel.toLowerCase();
      const isAllowedStoreLink = ALLOWED_STORE_NAMES.some((allowedStoreName) => (
        normalizedSourceName.includes(allowedStoreName) || normalizedLabelName.includes(allowedStoreName)
      ));
      if (!isAllowedStoreLink) {
        return;
      }
      const dedupeKey = `${externalUrl.toLowerCase()}|${externalLabel.toLowerCase()}`;
      if (dedupeKeySet.has(dedupeKey)) {
        return;
      }

      dedupeKeySet.add(dedupeKey);
      normalizedStoreLinks.push({
        url: externalUrl,
        label: externalLabel,
        source: externalSource,
        releaseId: releaseIdentifier,
        releaseTitle
      });
    });
  });

  writeToCache(releaseQueryCache, cacheKey, normalizedStoreLinks);
  return normalizedStoreLinks;
}

export async function fetchVisualNovelDetailsById(visualNovelIdentifier: string) {
  // Compatibility path for callers expecting a single heavy detail payload.
  const [corePayload, supplementalPayload] = await Promise.all([
    fetchVisualNovelCoreDetailsById(visualNovelIdentifier),
    fetchVisualNovelSupplementalDetailsById(visualNovelIdentifier)
  ]);
  const coreEntry = Array.isArray(corePayload.results) ? corePayload.results[0] ?? null : null;
  const supplementalEntry = Array.isArray(supplementalPayload.results) ? supplementalPayload.results[0] ?? null : null;
  if (!coreEntry) {
    return {
      results: [],
      more: false
    };
  }

  return {
    results: [
      {
        ...coreEntry,
        ...(supplementalEntry ?? {})
      }
    ],
    more: false
  };
}

export async function fetchCharacterEntriesByVisualNovelId(visualNovelIdentifier: string): Promise<CharacterQueryResponse> {
  const characterApiEndpoint = buildVndbApiUrl('/character');
  const visualNovelApiEndpoint = buildVndbApiUrl('/vn');
  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const numericVisualNovelIdentifier = Number(normalizedVisualNovelIdentifier.replace(/^v/i, ''));

  // Preferred path: fetch characters as a nested VN field, which is usually the most stable association.
  const visualNovelCharacterFieldCandidates = [
    "id, characters.id, characters.name, characters.original, characters.image.url, characters.image.thumbnail, characters.image.sexual",
    "id, chars.id, chars.name, chars.original, chars.image.url, chars.image.thumbnail, chars.image.sexual"
  ];

  function normalizeCharacterCollection(rawCollection: unknown): CharacterQueryResponse {
    if (!Array.isArray(rawCollection)) {
      return { results: [], more: false };
    }

    const normalizedCharacterEntries = rawCollection.reduce<CharacterQueryResponse['results']>((accumulatedEntries, rawCharacterEntry) => {
      if (!rawCharacterEntry || typeof rawCharacterEntry !== 'object') {
        return accumulatedEntries;
      }

      const characterEntry = rawCharacterEntry as {
        id?: unknown;
        name?: unknown;
        original?: unknown;
        image?: unknown;
      };
      const normalizedCharacterIdentifier = typeof characterEntry.id === 'string'
        ? characterEntry.id
        : typeof characterEntry.id === 'number'
          ? `c${characterEntry.id}`
          : null;
      const normalizedCharacterName = typeof characterEntry.name === 'string' ? characterEntry.name : null;
      if (!normalizedCharacterIdentifier || !normalizedCharacterName) {
        return accumulatedEntries;
      }

      accumulatedEntries.push({
        id: normalizedCharacterIdentifier,
        name: normalizedCharacterName,
        original: typeof characterEntry.original === 'string' ? characterEntry.original : null,
        image: characterEntry.image && typeof characterEntry.image === 'object'
          ? characterEntry.image as { id: string; url: string; thumbnail: string; sexual: number }
          : null
      });

      return accumulatedEntries;
    }, []);

    return {
      results: normalizedCharacterEntries,
      more: false
    };
  }

  for (const fieldCandidate of visualNovelCharacterFieldCandidates) {
    const requestPayload = {
      filters: ["id", "=", normalizedVisualNovelIdentifier],
      fields: fieldCandidate,
      results: 1
    };
    const cacheKey = JSON.stringify({ characterSource: 'vn', ...requestPayload });
    const cachedPayload = readFromCache(characterQueryCache, cacheKey);
    if (cachedPayload) {
      return cachedPayload as CharacterQueryResponse;
    }

    const networkResponse = await fetch(visualNovelApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!networkResponse.ok) {
      if (networkResponse.status === 400) {
        continue;
      }
      throw new Error(`Network boundary failure: Unable to retrieve characters for visual novel (HTTP ${networkResponse.status}).`);
    }

    const responsePayload = await networkResponse.json() as {
      results?: Array<Record<string, unknown>>;
    };
    const firstVisualNovelEntry = Array.isArray(responsePayload.results) ? responsePayload.results[0] : null;
    const normalizedCharacterPayload = normalizeCharacterCollection(
      firstVisualNovelEntry?.characters ?? firstVisualNovelEntry?.chars
    );
    if (normalizedCharacterPayload.results.length > 0) {
      writeToCache(characterQueryCache, cacheKey, normalizedCharacterPayload);
      return normalizedCharacterPayload;
    }
  }

  // Fallback path: query /character directly with multiple filter syntaxes.
  const sharedRequestPayload = {
    fields: "id, name, original, image.url, image.thumbnail, image.sexual",
    results: 100,
    sort: "name",
    reverse: false
  };
  const filterCandidates: unknown[][] = [
    ["vn", "=", ["id", "=", normalizedVisualNovelIdentifier]],
    ["vn", "=", normalizedVisualNovelIdentifier],
    ["vns", "=", ["id", "=", normalizedVisualNovelIdentifier]],
    ...(Number.isFinite(numericVisualNovelIdentifier) && numericVisualNovelIdentifier > 0
      ? [
          ["vn", "=", numericVisualNovelIdentifier],
          ["vn", "=", ["id", "=", numericVisualNovelIdentifier]],
          ["vns", "=", ["id", "=", numericVisualNovelIdentifier]]
        ]
      : [])
  ];

  for (const filterCandidate of filterCandidates) {
    const requestPayload = {
      ...sharedRequestPayload,
      filters: filterCandidate
    };
    const cacheKey = JSON.stringify(requestPayload);
    const cachedPayload = readFromCache(characterQueryCache, cacheKey);
    if (cachedPayload) {
      return cachedPayload as CharacterQueryResponse;
    }

    const networkResponse = await fetch(characterApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!networkResponse.ok) {
      // Try alternate filter shapes when VNDB rejects a specific filter syntax.
      if (networkResponse.status === 400) {
        continue;
      }

      throw new Error(`Network boundary failure: Unable to retrieve characters for visual novel (HTTP ${networkResponse.status}).`);
    }

    const responsePayload: CharacterQueryResponse = await networkResponse.json();
    writeToCache(characterQueryCache, cacheKey, responsePayload);
    return responsePayload;
  }

  return { results: [], more: false };
}

export async function fetchCharacterDetailsById(characterIdentifier: string): Promise<CharacterQueryResponse> {
  const targetApiEndpoint = buildVndbApiUrl('/character');
  const normalizedCharacterIdentifier = characterIdentifier.trim().toLowerCase().startsWith('c')
    ? characterIdentifier.trim().toLowerCase()
    : `c${characterIdentifier.trim().toLowerCase()}`;
  const requestPayload = {
    filters: ["id", "=", normalizedCharacterIdentifier],
    fields: "id, name, original, description, image.url, image.thumbnail, image.sexual, traits.id, traits.name, traits.spoiler, vns.id, vns.title, vns.role",
    results: 1
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(characterQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as CharacterQueryResponse;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve character details (HTTP ${networkResponse.status}).`);
  }

  const responsePayload: CharacterQueryResponse = await networkResponse.json();
  writeToCache(characterQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchCharactersByTraitId(traitIdentifier: string): Promise<CharacterQueryResponse> {
  const targetApiEndpoint = buildVndbApiUrl('/character');
  const normalizedTraitIdentifier = traitIdentifier.trim().toLowerCase().startsWith('i')
    ? traitIdentifier.trim().toLowerCase()
    : `i${traitIdentifier.trim().toLowerCase()}`;
  const requestPayload = {
    filters: ["trait", "=", normalizedTraitIdentifier],
    fields: "id, name, original, image.url, image.thumbnail, image.sexual, vns.id, vns.title",
    results: 100
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(characterQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as CharacterQueryResponse;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve trait character matches (HTTP ${networkResponse.status}).`);
  }

  const responsePayload: CharacterQueryResponse = await networkResponse.json();
  writeToCache(characterQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchTraitMetadataByIds(traitIdentifiers: string[]): Promise<CharacterTraitQueryResponse> {
  const normalizedTraitIdentifiers = [...new Set(traitIdentifiers.filter((traitIdentifier) => traitIdentifier.trim() !== ''))].sort();
  if (normalizedTraitIdentifiers.length === 0) {
    return { results: [], more: false };
  }

  const targetApiEndpoint = buildVndbApiUrl('/trait');
  const identifierFilter =
    normalizedTraitIdentifiers.length === 1
      ? ["id", "=", normalizedTraitIdentifiers[0]]
      : ["or", ...normalizedTraitIdentifiers.map((traitIdentifier) => ["id", "=", traitIdentifier])];
  const requestPayload = {
    filters: identifierFilter,
    fields: "id, name, group_name",
    results: normalizedTraitIdentifiers.length
  };
  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(traitQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as CharacterTraitQueryResponse;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve trait metadata (HTTP ${networkResponse.status}).`);
  }

  const responsePayload: CharacterTraitQueryResponse = await networkResponse.json();
  writeToCache(traitQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchTagMetadataByIds(tagIdentifiers: string[]): Promise<VisualNovelTagQueryResponse> {
  const normalizedTagIdentifiers = [...new Set(tagIdentifiers.filter((tagIdentifier) => tagIdentifier.trim() !== ''))].sort();
  if (normalizedTagIdentifiers.length === 0) {
    return { results: [], more: false };
  }

  const targetApiEndpoint = buildVndbApiUrl('/tag');
  const identifierFilter =
    normalizedTagIdentifiers.length === 1
      ? ["id", "=", normalizedTagIdentifiers[0]]
      : ["or", ...normalizedTagIdentifiers.map((tagIdentifier) => ["id", "=", tagIdentifier])];

  const requestPayload = {
    filters: identifierFilter,
    fields: "id, name, category",
    results: normalizedTagIdentifiers.length
  };

  const cacheKey = JSON.stringify(requestPayload);
  const cachedPayload = readFromCache(tagQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as VisualNovelTagQueryResponse;
  }

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error('Network boundary failure: Unable to retrieve tag metadata.');
  }

  const responsePayload: VisualNovelTagQueryResponse = await networkResponse.json();
  writeToCache(tagQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function fetchAuthenticatedUserVisualNovelList(
  authenticationToken: string,
  userIdentifier: string,
  pageNumber = 1,
  maximumResults = 50
): Promise<UserVisualNovelListResponse> {
  const targetApiEndpoint = buildVndbApiUrl('/ulist');
  const normalizedUserIdentifier = userIdentifier.toLowerCase().startsWith('u')
    ? userIdentifier.toLowerCase()
    : `u${userIdentifier}`;
  const labelsEnabledPayload = {
    user: normalizedUserIdentifier,
    fields: "id, labels.id, labels.label, vn.id, vn.title, vn.rating, vn.image.id, vn.image.url, vn.image.thumbnail, vn.image.sexual",
    results: maximumResults,
    page: pageNumber
  };
  const minimalCompatibilityPayload = {
    user: normalizedUserIdentifier,
    fields: "id, vn.id, vn.title, vn.rating, vn.image.id, vn.image.url, vn.image.thumbnail, vn.image.sexual",
    results: maximumResults,
    page: pageNumber
  };
  const cacheKey = JSON.stringify({ cacheVersion: 3, token: authenticationToken, ...labelsEnabledPayload });
  const cachedPayload = readFromCache(userListQueryCache, cacheKey);
  if (cachedPayload) {
    return cachedPayload as UserVisualNovelListResponse;
  }

  async function executeUlistRequest(requestPayload: Record<string, unknown>) {
    return fetch(targetApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${authenticationToken}`
      },
      body: JSON.stringify(requestPayload)
    });
  }

  let networkResponse = await executeUlistRequest(labelsEnabledPayload);
  if (!networkResponse.ok && networkResponse.status === 400) {
    networkResponse = await executeUlistRequest(minimalCompatibilityPayload);
  }

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to retrieve user visual novel list (HTTP ${networkResponse.status}).`);
  }

  const responsePayload: UserVisualNovelListResponse = await networkResponse.json();
  writeToCache(userListQueryCache, cacheKey, responsePayload);
  return responsePayload;
}

export async function addVisualNovelToAuthenticatedUserList(
  authenticationToken: string,
  visualNovelIdentifier: string,
  labelIdentifier = 5
) {
  if (typeof visualNovelIdentifier !== 'string' || visualNovelIdentifier.trim() === '') {
    throw new Error('Add-to-list failure: Missing visual novel identifier.');
  }

  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const targetApiEndpoint = buildVndbApiUrl(`/ulist/${normalizedVisualNovelIdentifier}`);

  // Isolated write helper so network-layer failures can be reported with clearer context.
  async function executePatchRequest(requestPayload: Record<string, unknown>) {
    try {
      return await fetch(targetApiEndpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${authenticationToken}`
        },
        body: JSON.stringify(requestPayload)
      });
    } catch (caughtError) {
      throw new Error(
        caughtError instanceof Error
          ? `Add-to-list request failed before reaching VNDB API: ${caughtError.message}`
          : 'Add-to-list request failed before reaching VNDB API.'
      );
    }
  }

  let networkResponse = await executePatchRequest({ labels_set: [labelIdentifier] });

  // Compatibility fallback for deployments expecting `labels` instead of `labels_set`.
  if (!networkResponse.ok && networkResponse.status === 400) {
    networkResponse = await executePatchRequest({ labels: [labelIdentifier] });
  }

  if (!networkResponse.ok) {
    let responseBodyText = '';
    try {
      responseBodyText = await networkResponse.text();
    } catch {
      responseBodyText = '';
    }

    const normalizedResponseBodyText = responseBodyText.trim();
    const detailedErrorSuffix = normalizedResponseBodyText ? ` - ${normalizedResponseBodyText}` : '';
    throw new Error(
      `Network boundary failure: Unable to add visual novel to user list (HTTP ${networkResponse.status})${detailedErrorSuffix}`
    );
  }

  // List-management writes should invalidate list reads immediately.
  userListQueryCache.clear();
}

export async function fetchAuthenticatedUserVisualNovelListEntry(
  authenticationToken: string,
  userIdentifier: string,
  visualNovelIdentifier: string
): Promise<{ isInList: boolean; labels: number[] }> {
  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const targetApiEndpoint = buildVndbApiUrl('/ulist');
  const normalizedUserIdentifier = userIdentifier.toLowerCase().startsWith('u')
    ? userIdentifier.toLowerCase()
    : `u${userIdentifier}`;
  const MAXIMUM_USER_LIST_PAGES = 40;

  function extractLabelIds(rawLabels: unknown): number[] {
    if (!Array.isArray(rawLabels)) {
      return [];
    }

    const labelIdentifiers: number[] = [];
    rawLabels.forEach((rawLabel) => {
      if (typeof rawLabel === 'number') {
        labelIdentifiers.push(rawLabel);
        return;
      }

      if (typeof rawLabel === 'string') {
        const numericLabelIdentifier = Number(rawLabel.replace(/[^\d]/g, ''));
        if (Number.isFinite(numericLabelIdentifier)) {
          labelIdentifiers.push(numericLabelIdentifier);
        }
        return;
      }

      if (rawLabel && typeof rawLabel === 'object') {
        const labelIdentifierCandidate = (rawLabel as { id?: unknown }).id;
        if (typeof labelIdentifierCandidate === 'number') {
          labelIdentifiers.push(labelIdentifierCandidate);
          return;
        }

        if (typeof labelIdentifierCandidate === 'string') {
          const numericLabelIdentifier = Number(labelIdentifierCandidate.replace(/[^\d]/g, ''));
          if (Number.isFinite(numericLabelIdentifier)) {
            labelIdentifiers.push(numericLabelIdentifier);
          }
        }
      }
    });

    return labelIdentifiers;
  }

  async function executeFilteredLookup() {
    const filteredPayload = {
      user: normalizedUserIdentifier,
      fields: "id, labels.id, labels.label",
      filters: ["id", "=", normalizedVisualNovelIdentifier],
      results: 1
    };

    const networkResponse = await fetch(targetApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${authenticationToken}`
      },
      body: JSON.stringify(filteredPayload)
    });

    if (!networkResponse.ok) {
      if (networkResponse.status === 400) {
        return null;
      }

      throw new Error(`Network boundary failure: Unable to read list status for visual novel (HTTP ${networkResponse.status}).`);
    }

    const responsePayload = await networkResponse.json() as {
      results?: Array<{ id?: unknown; labels?: unknown }>;
    };
    const firstEntry = Array.isArray(responsePayload.results) ? responsePayload.results[0] : null;
    if (!firstEntry) {
      return {
        isInList: false,
        labels: []
      };
    }

    return {
      isInList: true,
      labels: extractLabelIds(firstEntry.labels)
    };
  }

  const directLookupResult = await executeFilteredLookup();
  if (directLookupResult) {
    return directLookupResult;
  }

  let activePageNumber = 1;
  let hasMorePages = true;
  while (hasMorePages && activePageNumber <= MAXIMUM_USER_LIST_PAGES) {
    const labelsPayload = {
      user: normalizedUserIdentifier,
      fields: "id, labels.id, labels.label",
      results: 100,
      page: activePageNumber
    };

    const networkResponse = await fetch(targetApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${authenticationToken}`
      },
      body: JSON.stringify(labelsPayload)
    });

    if (!networkResponse.ok && networkResponse.status === 400) {
      // Some deployments reject label fields; fall back to identifier-only presence check.
      const identifierSet = await fetchAuthenticatedUserVisualNovelIdentifierSet(authenticationToken, userIdentifier);
      return {
        isInList: identifierSet.has(normalizedVisualNovelIdentifier),
        labels: []
      };
    }

    if (!networkResponse.ok) {
      throw new Error(`Network boundary failure: Unable to read list status for visual novel (HTTP ${networkResponse.status}).`);
    }

    const responsePayload = await networkResponse.json() as {
      results?: Array<{ id?: unknown; labels?: unknown }>;
      more?: boolean;
    };
    const rawEntries = Array.isArray(responsePayload.results) ? responsePayload.results : [];
    const matchingEntry = rawEntries.find((entry) => {
      const rawIdentifier = entry.id;
      if (typeof rawIdentifier === 'string' && rawIdentifier.trim() !== '') {
        const normalizedEntryIdentifier = rawIdentifier.toLowerCase().startsWith('v')
          ? rawIdentifier.toLowerCase()
          : `v${rawIdentifier.toLowerCase()}`;
        return normalizedEntryIdentifier === normalizedVisualNovelIdentifier;
      }

      if (typeof rawIdentifier === 'number' && Number.isFinite(rawIdentifier)) {
        return `v${rawIdentifier}` === normalizedVisualNovelIdentifier;
      }

      return false;
    });

    if (matchingEntry) {
      return {
        isInList: true,
        labels: extractLabelIds(matchingEntry.labels)
      };
    }

    hasMorePages = Boolean(responsePayload.more);
    activePageNumber += 1;
  }

  return {
    isInList: false,
    labels: []
  };
}

export async function updateAuthenticatedUserVisualNovelStatusLabel(
  authenticationToken: string,
  visualNovelIdentifier: string,
  statusLabelIdentifier: number
) {
  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const targetApiEndpoint = buildVndbApiUrl(`/ulist/${normalizedVisualNovelIdentifier}`);
  // VNDB default status labels: 1 playing, 2 finished, 3 stalled, 4 dropped, 5 wishlist, 6 blacklist.
  const STATUS_LABEL_IDENTIFIERS = [1, 2, 3, 4, 5, 6];
  const requestPayload = {
    labels_unset: STATUS_LABEL_IDENTIFIERS.filter((labelIdentifier) => labelIdentifier !== statusLabelIdentifier),
    labels_set: [statusLabelIdentifier]
  };

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${authenticationToken}`
    },
    body: JSON.stringify(requestPayload)
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to update VN list status (HTTP ${networkResponse.status}).`);
  }

  userListQueryCache.clear();
}

export async function removeVisualNovelFromAuthenticatedUserList(
  authenticationToken: string,
  visualNovelIdentifier: string
) {
  const normalizedVisualNovelIdentifier = normalizeVisualNovelIdentifier(visualNovelIdentifier);
  const targetApiEndpoint = buildVndbApiUrl(`/ulist/${normalizedVisualNovelIdentifier}`);

  const networkResponse = await fetch(targetApiEndpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Token ${authenticationToken}`
    }
  });

  if (!networkResponse.ok) {
    throw new Error(`Network boundary failure: Unable to remove visual novel from your list (HTTP ${networkResponse.status}).`);
  }

  userListQueryCache.clear();
}

export async function fetchAuthenticatedUserVisualNovelIdentifierSet(
  authenticationToken: string,
  userIdentifier: string
): Promise<Set<string>> {
  const targetApiEndpoint = buildVndbApiUrl('/ulist');
  const normalizedUserIdentifier = userIdentifier.toLowerCase().startsWith('u')
    ? userIdentifier.toLowerCase()
    : `u${userIdentifier}`;
  // Defensive cap to prevent accidental unbounded paging loops.
  const MAXIMUM_USER_LIST_PAGES = 40;
  const visualNovelIdentifierSet = new Set<string>();
  let activePageNumber = 1;
  let hasMorePages = true;

  while (hasMorePages && activePageNumber <= MAXIMUM_USER_LIST_PAGES) {
    const requestPayload = {
      user: normalizedUserIdentifier,
      fields: "id",
      results: 100,
      page: activePageNumber
    };

    const networkResponse = await fetch(targetApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${authenticationToken}`
      },
      body: JSON.stringify(requestPayload)
    });

    if (!networkResponse.ok) {
      throw new Error(`Network boundary failure: Unable to load user list identifiers (HTTP ${networkResponse.status}).`);
    }

    const responsePayload = await networkResponse.json() as { results?: Array<{ id?: unknown }>; more?: boolean };
    const rawEntries = Array.isArray(responsePayload.results) ? responsePayload.results : [];

    // Accept both string and numeric ID variants returned by VNDB representations.
    for (const rawEntry of rawEntries) {
      const rawIdentifier = rawEntry?.id;
      if (typeof rawIdentifier === 'string' && rawIdentifier.trim() !== '') {
        const normalizedIdentifier = rawIdentifier.toLowerCase().startsWith('v')
          ? rawIdentifier.toLowerCase()
          : `v${rawIdentifier.toLowerCase()}`;
        visualNovelIdentifierSet.add(normalizedIdentifier);
      } else if (typeof rawIdentifier === 'number' && Number.isFinite(rawIdentifier)) {
        visualNovelIdentifierSet.add(`v${rawIdentifier}`);
      }
    }

    hasMorePages = Boolean(responsePayload.more);
    activePageNumber += 1;
  }

  return visualNovelIdentifierSet;
}
