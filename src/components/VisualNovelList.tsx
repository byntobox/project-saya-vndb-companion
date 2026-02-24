import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchAuthenticatedUserVisualNovelIdentifierSet,
  fetchAuthenticatedUserVisualNovelList,
  fetchVisualNovelEntries
} from '../api/visualNovelClient';
import { type QueryParameters, type VisualNovelDatabaseEntry, type VisualNovelQueryResponse } from '../types/apiTypes';
import { VisualNovelListItem } from './VisualNovelListItem'; // Importing the new child boundary
import styles from './VisualNovelList.module.css';

interface VisualNovelListProperties {
  onVisualNovelSelection: (visualNovelIdentifier: string) => void;
  onVisualNovelPrefetch?: (visualNovelIdentifier: string) => void;
  homeNavigationRequestToken: number;
  onAddVisualNovelToUserList: (visualNovelIdentifier: string, labelIdentifier?: number) => Promise<void>;
  onUpdateVisualNovelUserListStatus: (visualNovelIdentifier: string, statusLabelIdentifier: number) => Promise<void>;
  userListRefreshToken: number;
  tagSearchRequest: {
    requestId: number;
    tagName: string;
    tagIdentifier?: string;
  } | null;
  developerSearchRequest: {
    requestId: number;
    developerName: string;
    developerIdentifier?: string;
  } | null;
  authenticatedSession: {
    token: string;
    userId: string;
    username: string;
    permissions: string[];
  } | null;
  nsfwCoverBlurMode: 'auto' | 'always' | 'never';
  rememberListSettings: boolean;
  defaultListSortField: 'default' | 'title' | 'released' | 'rating' | 'votecount' | 'id';
  defaultListSortDirection: 'asc' | 'desc';
  defaultListOnlyWithScreenshots: boolean;
  defaultListOnlyWithDescription: boolean;
}

interface ListQueryDescriptor {
  kind: 'text' | 'tag' | 'developer';
  term: string;
  tagIdentifier?: string;
  developerIdentifier?: string;
  filters: ListFilterState;
  sort: ListSortState;
}

interface ListFilterState {
  languages: string[];
  originalLanguage: string;
  onlyWithScreenshots: boolean;
  onlyWithDescription: boolean;
}

interface ListSortState {
  field: 'default' | 'title' | 'released' | 'rating' | 'votecount' | 'id';
  direction: 'asc' | 'desc';
}

export function VisualNovelList({
  onVisualNovelSelection,
  onVisualNovelPrefetch,
  homeNavigationRequestToken,
  onAddVisualNovelToUserList,
  onUpdateVisualNovelUserListStatus,
  userListRefreshToken,
  tagSearchRequest,
  developerSearchRequest,
  authenticatedSession,
  nsfwCoverBlurMode,
  rememberListSettings,
  defaultListSortField,
  defaultListSortDirection,
  defaultListOnlyWithScreenshots,
  defaultListOnlyWithDescription
}: VisualNovelListProperties) {
  const searchInputReference = useRef<HTMLInputElement | null>(null);
  const themedPrimaryButtonStyle = {
    background: 'var(--button-primary-bg)',
    borderColor: 'var(--button-primary-border)',
    color: 'var(--button-primary-text)',
    boxShadow: 'var(--button-primary-shadow)'
  } as const;
  const loadingSkeletonIdentifiers = Array.from({ length: 12 }, (_, skeletonIndex) => `skeleton-${skeletonIndex}`);
  const FILTER_STORAGE_KEY = 'vndb_client_list_filters_v1';
  const SORT_STORAGE_KEY = 'vndb_client_list_sort_v1';
  const RECENT_SEARCHES_STORAGE_KEY = 'vndb_client_recent_searches_v1';
  const LANGUAGE_OPTIONS = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: 'Japanese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' }
  ];
  function createDefaultFilterState(): ListFilterState {
    return {
      languages: [],
      originalLanguage: '',
      onlyWithScreenshots: defaultListOnlyWithScreenshots,
      onlyWithDescription: defaultListOnlyWithDescription
    };
  }

  const RESULTS_PER_PAGE = 20;
  const DEFAULT_SORT_STATE: ListSortState = {
    field: defaultListSortField,
    direction: defaultListSortDirection
  };
  const SORT_FIELD_OPTIONS: Array<{ value: ListSortState['field']; label: string }> = [
    { value: 'default', label: 'Default (Relevance)' },
    { value: 'title', label: 'Title' },
    { value: 'released', label: 'Release Date' },
    { value: 'rating', label: 'Rating' },
    { value: 'votecount', label: 'Vote Count' },
    { value: 'id', label: 'ID' }
  ];
  const [visualNovelDatabaseEntries, setVisualNovelDatabaseEntries] = useState<VisualNovelDatabaseEntry[]>([]);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(true);
  const [isLoadingAdditionalPage, setIsLoadingAdditionalPage] = useState<boolean>(false);
  const [networkErrorMessage, setNetworkErrorMessage] = useState<string | null>(null);
  const [activeSearchTerm, setActiveSearchTerm] = useState<string>('');
  function createInitialFilterState(): ListFilterState {
    const configuredDefaultFilterState = createDefaultFilterState();
    try {
      if (!rememberListSettings) {
        return configuredDefaultFilterState;
      }

      const storedFilterState = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!storedFilterState) {
        return configuredDefaultFilterState;
      }

      const parsedFilterState = JSON.parse(storedFilterState) as Partial<ListFilterState>;
      return {
        languages: Array.isArray(parsedFilterState.languages) ? parsedFilterState.languages.filter((languageCode) => typeof languageCode === 'string') : [],
        originalLanguage: typeof parsedFilterState.originalLanguage === 'string' ? parsedFilterState.originalLanguage : '',
        onlyWithScreenshots: Boolean(parsedFilterState.onlyWithScreenshots),
        onlyWithDescription: Boolean(parsedFilterState.onlyWithDescription)
      };
    } catch {
      return configuredDefaultFilterState;
    }
  }

  function createInitialSortState(): ListSortState {
    const configuredDefaultSortState = DEFAULT_SORT_STATE;
    try {
      if (!rememberListSettings) {
        return configuredDefaultSortState;
      }

      const storedSortState = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (!storedSortState) {
        return configuredDefaultSortState;
      }

      const parsedSortState = JSON.parse(storedSortState) as Partial<ListSortState>;
      const normalizedField: ListSortState['field'] =
        parsedSortState.field === 'title' ||
        parsedSortState.field === 'released' ||
        parsedSortState.field === 'rating' ||
        parsedSortState.field === 'votecount' ||
        parsedSortState.field === 'id'
          ? parsedSortState.field
          : 'default';
      const normalizedDirection: ListSortState['direction'] = parsedSortState.direction === 'asc' ? 'asc' : 'desc';

      return {
        field: normalizedField,
        direction: normalizedDirection
      };
    } catch {
      return configuredDefaultSortState;
    }
  }

  const initialFilterState = createInitialFilterState();
  const initialSortState = createInitialSortState();

  const [activeQueryDescriptor, setActiveQueryDescriptor] = useState<ListQueryDescriptor>({
    kind: 'text',
    term: '',
    filters: initialFilterState,
    sort: initialSortState
  });
  const [draftFilters, setDraftFilters] = useState<ListFilterState>(initialFilterState);
  const [appliedFilters, setAppliedFilters] = useState<ListFilterState>(initialFilterState);
  const [appliedSort, setAppliedSort] = useState<ListSortState>(initialSortState);
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState<boolean>(false);
  const [isViewingUserList, setIsViewingUserList] = useState<boolean>(false);
  const [currentResultPage, setCurrentResultPage] = useState<number>(1);
  const [hasAdditionalResults, setHasAdditionalResults] = useState<boolean>(false);
  const paginationTriggerReference = useRef<HTMLDivElement | null>(null);
  const hasListReadPermission = authenticatedSession?.permissions.includes('listread') ?? false;
  const hasListWritePermission = authenticatedSession?.permissions.includes('listwrite') ?? false;
  const [userListIdentifierSet, setUserListIdentifierSet] = useState<Set<string>>(new Set());
  const [userListStatusByIdentifier, setUserListStatusByIdentifier] = useState<Record<string, number>>({});
  const previousHomeNavigationRequestTokenReference = useRef<number>(homeNavigationRequestToken);
  const hasLiveSearchEffectInitializedReference = useRef<boolean>(false);
  const [recentSearchTerms, setRecentSearchTerms] = useState<string[]>(() => {
    try {
      const storedRecentSearchTerms = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (!storedRecentSearchTerms) {
        return [];
      }

      const parsedSearchTerms = JSON.parse(storedRecentSearchTerms) as unknown;
      if (!Array.isArray(parsedSearchTerms)) {
        return [];
      }

      return parsedSearchTerms
        .filter((searchTerm): searchTerm is string => typeof searchTerm === 'string' && searchTerm.trim() !== '')
        .slice(0, 8);
    } catch {
      return [];
    }
  });

  function normalizeEntryIdentifier(rawIdentifier: unknown): string | null {
    if (typeof rawIdentifier === 'string' && rawIdentifier.trim() !== '') {
      return rawIdentifier.trim();
    }

    if (typeof rawIdentifier === 'number' && Number.isFinite(rawIdentifier)) {
      return String(rawIdentifier);
    }

    return null;
  }

  function normalizeVisualNovelIdentifier(rawIdentifier: unknown): string | null {
    const normalizedIdentifier = normalizeEntryIdentifier(rawIdentifier);
    if (!normalizedIdentifier) {
      return null;
    }

    return normalizedIdentifier.toLowerCase().startsWith('v')
      ? normalizedIdentifier.toLowerCase()
      : `v${normalizedIdentifier.toLowerCase()}`;
  }

  function deriveStatusLabelFromUnknownLabels(rawLabels: unknown): number | null {
    const STATUS_LABEL_IDENTIFIERS = [1, 2, 3, 4, 5, 6];
    if (!Array.isArray(rawLabels)) {
      return null;
    }

    const normalizedLabels = rawLabels
      .map((rawLabel) => {
        if (typeof rawLabel === 'number') {
          return rawLabel;
        }

        if (typeof rawLabel === 'string') {
          const numericLabelIdentifier = Number(rawLabel.replace(/[^\d]/g, ''));
          return Number.isFinite(numericLabelIdentifier) ? numericLabelIdentifier : null;
        }

        if (rawLabel && typeof rawLabel === 'object') {
          const labelIdentifierCandidate = (rawLabel as { id?: unknown }).id;
          if (typeof labelIdentifierCandidate === 'number') {
            return labelIdentifierCandidate;
          }
          if (typeof labelIdentifierCandidate === 'string') {
            const numericLabelIdentifier = Number(labelIdentifierCandidate.replace(/[^\d]/g, ''));
            return Number.isFinite(numericLabelIdentifier) ? numericLabelIdentifier : null;
          }
        }

        return null;
      })
      .filter((labelIdentifier): labelIdentifier is number => labelIdentifier !== null);
    const matchingStatusLabel = STATUS_LABEL_IDENTIFIERS.find((statusLabelIdentifier) => normalizedLabels.includes(statusLabelIdentifier));
    return matchingStatusLabel ?? null;
  }

  function sortVisualNovelEntries(entriesToSort: VisualNovelDatabaseEntry[], sortConfiguration: ListSortState) {
    if (sortConfiguration.field === 'default') {
      return entriesToSort;
    }

    const sortedEntries = [...entriesToSort].sort((firstEntry, secondEntry) => {
      if (sortConfiguration.field === 'title') {
        const normalizedFirstTitle = firstEntry.title.trim();
        const normalizedSecondTitle = secondEntry.title.trim();
        const firstTitleStartsWithDigit = /^\d/.test(normalizedFirstTitle);
        const secondTitleStartsWithDigit = /^\d/.test(normalizedSecondTitle);

        if (firstTitleStartsWithDigit !== secondTitleStartsWithDigit) {
          return firstTitleStartsWithDigit ? -1 : 1;
        }

        return normalizedFirstTitle.localeCompare(normalizedSecondTitle, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      }

      if (sortConfiguration.field === 'rating') {
        return (firstEntry.rating ?? -1) - (secondEntry.rating ?? -1);
      }

      if (sortConfiguration.field === 'id') {
        return firstEntry.id.localeCompare(secondEntry.id);
      }

      return 0;
    });

    return sortConfiguration.direction === 'desc' ? sortedEntries.reverse() : sortedEntries;
  }

  function chunkArray<TValue>(items: TValue[], chunkSize: number): TValue[][] {
    if (chunkSize <= 0) {
      return [items];
    }

    const chunks: TValue[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
  }

  function buildFiltersFromQueryDescriptor(queryDescriptor: ListQueryDescriptor) {
    // Build VNDB filter AST from active search mode + optional UI filters.
    const filterClauses: any[] = [];

    if (queryDescriptor.kind === 'tag' && queryDescriptor.tagIdentifier) {
      filterClauses.push(["tag", "=", queryDescriptor.tagIdentifier]);
    } else if (queryDescriptor.kind === 'developer' && queryDescriptor.developerIdentifier) {
      filterClauses.push(["developer", "=", ["id", "=", queryDescriptor.developerIdentifier]]);
    } else if (queryDescriptor.term.trim() !== '') {
      filterClauses.push(["search", "=", queryDescriptor.term]);
    } else {
      filterClauses.push(["id", ">=", "v1"]);
    }

    if (queryDescriptor.filters.languages.length === 1) {
      filterClauses.push(["lang", "=", queryDescriptor.filters.languages[0]]);
    } else if (queryDescriptor.filters.languages.length > 1) {
      filterClauses.push(["or", ...queryDescriptor.filters.languages.map((languageCode) => ["lang", "=", languageCode])]);
    }

    if (queryDescriptor.filters.originalLanguage.trim() !== '') {
      filterClauses.push(["olang", "=", queryDescriptor.filters.originalLanguage]);
    }

    if (queryDescriptor.filters.onlyWithScreenshots) {
      filterClauses.push(["has_screenshot", "=", true]);
    }

    if (queryDescriptor.filters.onlyWithDescription) {
      filterClauses.push(["has_description", "=", true]);
    }

    if (filterClauses.length === 1) {
      return filterClauses[0];
    }

    return ["and", ...filterClauses];
  }

  function handleLanguageFilterToggle(languageCode: string) {
    setDraftFilters((currentFilters) => {
      const isLanguageAlreadySelected = currentFilters.languages.includes(languageCode);
      return {
        ...currentFilters,
        languages: isLanguageAlreadySelected
          ? currentFilters.languages.filter((currentLanguageCode) => currentLanguageCode !== languageCode)
          : [...currentFilters.languages, languageCode]
      };
    });
  }

  function executeSearchWithFilters(searchTerm: string, filters: ListFilterState) {
    executeDataFetchOperation({ kind: 'text', term: searchTerm, filters, sort: appliedSort }, 1, false);
  }

  function registerRecentSearchTerm(searchTerm: string) {
    const normalizedSearchTerm = searchTerm.trim();
    if (normalizedSearchTerm === '') {
      return;
    }

    setRecentSearchTerms((currentSearchTerms) => {
      const deduplicatedSearchTerms = [
        normalizedSearchTerm,
        ...currentSearchTerms.filter((existingSearchTerm) => existingSearchTerm.toLowerCase() !== normalizedSearchTerm.toLowerCase())
      ].slice(0, 8);
      return deduplicatedSearchTerms;
    });
  }

  function executeSearchWithCurrentQuery(overrides: Partial<ListQueryDescriptor> = {}) {
    executeDataFetchOperation(
      {
        ...activeQueryDescriptor,
        ...overrides
      },
      1,
      false
    );
  }

  function handleFilterApplication() {
    setAppliedFilters(draftFilters);
    executeSearchWithCurrentQuery({ filters: draftFilters });
    setIsFilterPanelVisible(false);
  }

  function handleFilterReset() {
    const resetFilterState = createDefaultFilterState();
    const resetSortState = DEFAULT_SORT_STATE;
    setDraftFilters(resetFilterState);
    setAppliedFilters(resetFilterState);
    setAppliedSort(resetSortState);
    executeSearchWithCurrentQuery({ filters: resetFilterState, sort: resetSortState });
  }

  function handleSortFieldChange(sortField: ListSortState['field']) {
    const updatedSortState: ListSortState = {
      ...appliedSort,
      field: sortField,
      direction: sortField === 'title' ? 'asc' : appliedSort.direction
    };

    setAppliedSort(updatedSortState);
    if (isViewingUserList) {
      setVisualNovelDatabaseEntries((currentEntries) => sortVisualNovelEntries(currentEntries, updatedSortState));
      return;
    }

    executeSearchWithCurrentQuery({ sort: updatedSortState });
  }

  function handleSortDirectionToggle() {
    const updatedSortState: ListSortState = {
      ...appliedSort,
      direction: appliedSort.direction === 'asc' ? 'desc' : 'asc'
    };

    setAppliedSort(updatedSortState);
    if (isViewingUserList) {
      setVisualNovelDatabaseEntries((currentEntries) => sortVisualNovelEntries(currentEntries, updatedSortState));
      return;
    }

    executeSearchWithCurrentQuery({ sort: updatedSortState });
  }

  const appliedFilterCount =
    appliedFilters.languages.length +
    (appliedFilters.originalLanguage ? 1 : 0) +
    (appliedFilters.onlyWithScreenshots ? 1 : 0) +
    (appliedFilters.onlyWithDescription ? 1 : 0);

  const originalLanguageOptions = [
    { value: '', label: 'Any Original Language' },
    ...LANGUAGE_OPTIONS.map((languageOption) => ({
      value: languageOption.code,
      label: languageOption.label
    }))
  ];

  const selectedLanguageLabels = appliedFilters.languages
    .map((languageCode) => LANGUAGE_OPTIONS.find((languageOption) => languageOption.code === languageCode)?.label || languageCode)
    .join(', ');

  const activeFilterSummarySegments = [
    selectedLanguageLabels ? `Available: ${selectedLanguageLabels}` : '',
    appliedFilters.originalLanguage
      ? `Original: ${LANGUAGE_OPTIONS.find((languageOption) => languageOption.code === appliedFilters.originalLanguage)?.label || appliedFilters.originalLanguage}`
      : '',
    appliedFilters.onlyWithScreenshots ? 'With screenshots' : '',
    appliedFilters.onlyWithDescription ? 'With descriptions' : ''
  ].filter((filterSummarySegment) => filterSummarySegment.length > 0);

  const activeFilterSummaryText = activeFilterSummarySegments.length > 0
    ? activeFilterSummarySegments.join(' • ')
    : 'No additional filters';

  useEffect(() => {
    setDraftFilters(appliedFilters);
  }, [isFilterPanelVisible, appliedFilters]);

  useEffect(() => {
    if (!rememberListSettings) {
      window.localStorage.removeItem(FILTER_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(appliedFilters));
  }, [appliedFilters, rememberListSettings]);

  useEffect(() => {
    if (!rememberListSettings) {
      window.localStorage.removeItem(SORT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(appliedSort));
  }, [appliedSort, rememberListSettings]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearchTerms));
  }, [recentSearchTerms]);

  useEffect(() => {
    // Global shortcut: "/" or Ctrl/Cmd+K focuses search, Escape closes filter panel.
    function handleGlobalShortcutKeyDown(keyboardEvent: KeyboardEvent) {
      const activeElement = document.activeElement;
      const isUserTypingInInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      if ((keyboardEvent.key === '/' || (keyboardEvent.key.toLowerCase() === 'k' && (keyboardEvent.metaKey || keyboardEvent.ctrlKey))) && !isUserTypingInInput) {
        keyboardEvent.preventDefault();
        searchInputReference.current?.focus();
        searchInputReference.current?.select();
        return;
      }

      if (keyboardEvent.key === 'Escape' && isFilterPanelVisible) {
        keyboardEvent.preventDefault();
        setIsFilterPanelVisible(false);
      }
    }

    window.addEventListener('keydown', handleGlobalShortcutKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcutKeyDown);
    };
  }, [isFilterPanelVisible]);

  useEffect(() => {
    // When remember mode is disabled, preference changes should immediately become active.
    if (rememberListSettings || isViewingUserList) {
      return;
    }

    const resetFilterState = createDefaultFilterState();
    const resetSortState = DEFAULT_SORT_STATE;
    setDraftFilters(resetFilterState);
    setAppliedFilters(resetFilterState);
    setAppliedSort(resetSortState);
    executeDataFetchOperation(
      {
        ...activeQueryDescriptor,
        filters: resetFilterState,
        sort: resetSortState
      },
      1,
      false
    );
  }, [
    rememberListSettings,
    isViewingUserList,
    defaultListOnlyWithScreenshots,
    defaultListOnlyWithDescription,
    defaultListSortField,
    defaultListSortDirection
  ]);

  useEffect(() => {
    // Initial bootstrap search for default list content.
    if (tagSearchRequest) {
      return;
    }

    executeDataFetchOperation({ kind: 'text', term: '', filters: initialFilterState, sort: initialSortState }, 1, false);
  }, []);

  useEffect(() => {
    if (!hasLiveSearchEffectInitializedReference.current) {
      hasLiveSearchEffectInitializedReference.current = true;
      return;
    }

    if (isViewingUserList || tagSearchRequest || developerSearchRequest) {
      return;
    }

    const debounceTimeoutIdentifier = window.setTimeout(() => {
      setUserListStatusByIdentifier({});
      executeDataFetchOperation(
        { kind: 'text', term: activeSearchTerm, filters: appliedFilters, sort: appliedSort },
        1,
        false
      );
    }, 350);

    return () => {
      window.clearTimeout(debounceTimeoutIdentifier);
    };
  }, [activeSearchTerm, appliedFilters, appliedSort, isViewingUserList, tagSearchRequest, developerSearchRequest]);

  async function executeDataFetchOperation(queryDescriptor: ListQueryDescriptor, pageNumber: number, shouldAppendResults: boolean) {
    if (shouldAppendResults) {
      setIsLoadingAdditionalPage(true);
    } else {
      setIsDataLoading(true);
    }

    setNetworkErrorMessage(null);

    try {
      const appliedFilters = buildFiltersFromQueryDescriptor(queryDescriptor);

      // Only pass sort settings when user selected explicit sort; default uses VNDB relevance order.
      const queryConfiguration: QueryParameters = {
        queryFilters: appliedFilters,
        requestedFields: "id, title, rating, image.thumbnail, image.sexual",
        maxResults: RESULTS_PER_PAGE,
        pageNumber,
        sortField: queryDescriptor.sort.field === 'default' ? undefined : queryDescriptor.sort.field,
        reverseSort: queryDescriptor.sort.field === 'default' ? undefined : queryDescriptor.sort.direction === 'desc'
      };
      
      const responsePayload: VisualNovelQueryResponse = await fetchVisualNovelEntries(queryConfiguration);
      setVisualNovelDatabaseEntries((currentEntries) => (
        shouldAppendResults ? [...currentEntries, ...responsePayload.results] : responsePayload.results
      ));
      setCurrentResultPage(pageNumber);
      setHasAdditionalResults(responsePayload.more);
      setActiveQueryDescriptor(queryDescriptor);
    } catch (caughtError) {
      setNetworkErrorMessage(
        caughtError instanceof Error ? caughtError.message : 'An unknown system error occurred.'
      );
    } finally {
      if (shouldAppendResults) {
        setIsLoadingAdditionalPage(false);
      } else {
        setIsDataLoading(false);
      }
    }
  }

  async function executeAuthenticatedUserListFetch() {
    if (!authenticatedSession) {
      setNetworkErrorMessage('Authentication required to load your VN list.');
      return;
    }

    setIsDataLoading(true);
    setNetworkErrorMessage(null);

    try {
      // Pull full user list in pages (VNDB responses are paginated).
      const MAXIMUM_USER_LIST_PAGES = 40;
      let activePageNumber = 1;
      let hasMorePages = true;
      const accumulatedUserListEntries: unknown[] = [];

      while (hasMorePages && activePageNumber <= MAXIMUM_USER_LIST_PAGES) {
        const userListResponse = await fetchAuthenticatedUserVisualNovelList(
          authenticatedSession.token,
          authenticatedSession.userId,
          activePageNumber,
          100
        );

        accumulatedUserListEntries.push(...userListResponse.results);
        hasMorePages = userListResponse.more;
        activePageNumber += 1;
      }

      const normalizedUserListStatuses: Record<string, number> = {};
      accumulatedUserListEntries.forEach((userListEntry) => {
        const rawVisualNovelPayload = (userListEntry as { vn?: unknown }).vn;
        const identifierFromVn = rawVisualNovelPayload && typeof rawVisualNovelPayload === 'object'
          ? normalizeVisualNovelIdentifier((rawVisualNovelPayload as { id?: unknown }).id)
          : null;
        const identifierFromEntry = normalizeVisualNovelIdentifier((userListEntry as { id?: unknown }).id);
        const normalizedVisualNovelIdentifier = identifierFromVn ?? identifierFromEntry;
        const normalizedStatusLabel = deriveStatusLabelFromUnknownLabels((userListEntry as { labels?: unknown }).labels);
        if (normalizedVisualNovelIdentifier && normalizedStatusLabel !== null) {
          normalizedUserListStatuses[normalizedVisualNovelIdentifier] = normalizedStatusLabel;
        }
      });

      // Normalize differing ulist response shapes (nested VN object vs id-only entry).
      const normalizedVisualNovelEntries = accumulatedUserListEntries
        .map((userListEntry) => {
          const rawVisualNovelPayload = (userListEntry as { vn?: unknown }).vn;
          const normalizedIdentifierFromEntry = normalizeEntryIdentifier((userListEntry as { id?: unknown }).id);

          if (rawVisualNovelPayload && typeof rawVisualNovelPayload === 'object') {
            const normalizedIdentifier = normalizeEntryIdentifier((rawVisualNovelPayload as { id?: unknown }).id) ?? normalizedIdentifierFromEntry;
            if (!normalizedIdentifier) {
              return null;
            }

            return {
              ...(rawVisualNovelPayload as VisualNovelDatabaseEntry),
              id: normalizedIdentifier
            };
          }

          const normalizedIdentifierFromVn = normalizeEntryIdentifier(rawVisualNovelPayload);
          if (normalizedIdentifierFromVn) {
            return {
              id: normalizedIdentifierFromVn,
              title: '',
              rating: null,
              image: null
            } as VisualNovelDatabaseEntry;
          }

          if (normalizedIdentifierFromEntry && normalizedIdentifierFromEntry.toLowerCase().startsWith('v')) {
            return {
              id: normalizedIdentifierFromEntry,
              title: '',
              rating: null,
              image: null
            } as VisualNovelDatabaseEntry;
          }

          return null;
        })
        .filter((userListEntry): userListEntry is VisualNovelDatabaseEntry => Boolean(userListEntry));

      const hasPlaceholderEntries = normalizedVisualNovelEntries.some(
        (userListEntry) => userListEntry.title.trim() === ''
      );

      // Hydrate id-only placeholders via /vn batch requests so cards have title/image/rating.
      if (hasPlaceholderEntries) {
        const distinctVisualNovelIdentifiers = [...new Set(
          normalizedVisualNovelEntries.map((userListEntry) => (
            userListEntry.id.toLowerCase().startsWith('v') ? userListEntry.id : `v${userListEntry.id}`
          ))
        )];
        const hydratedEntriesByIdentifier = new Map<string, VisualNovelDatabaseEntry>();
        const identifierChunks = chunkArray(distinctVisualNovelIdentifiers, 100);

        for (const identifierChunk of identifierChunks) {
          const identifierFilters =
            identifierChunk.length === 1
              ? ["id", "=", identifierChunk[0]]
              : ["or", ...identifierChunk.map((visualNovelIdentifier) => ["id", "=", visualNovelIdentifier])];

          const hydratedVisualNovelResponse = await fetchVisualNovelEntries({
            queryFilters: identifierFilters,
            requestedFields: "id, title, rating, image.thumbnail, image.sexual",
            maxResults: identifierChunk.length
          });

          for (const hydratedEntry of hydratedVisualNovelResponse.results) {
            const normalizedHydratedIdentifier = hydratedEntry.id.toLowerCase().startsWith('v') ? hydratedEntry.id : `v${hydratedEntry.id}`;
            hydratedEntriesByIdentifier.set(normalizedHydratedIdentifier, hydratedEntry);
          }
        }

        const hydratedAndFallbackEntries = normalizedVisualNovelEntries.map((userListEntry) => {
          const normalizedIdentifier = userListEntry.id.toLowerCase().startsWith('v') ? userListEntry.id : `v${userListEntry.id}`;
          return hydratedEntriesByIdentifier.get(normalizedIdentifier) ?? userListEntry;
        });

        setVisualNovelDatabaseEntries(sortVisualNovelEntries(hydratedAndFallbackEntries, appliedSort));
      } else {
        setVisualNovelDatabaseEntries(sortVisualNovelEntries(normalizedVisualNovelEntries, appliedSort));
      }
      setUserListStatusByIdentifier(normalizedUserListStatuses);
      setCurrentResultPage(1);
      setHasAdditionalResults(false);
      setIsViewingUserList(true);
    } catch (caughtError) {
      setNetworkErrorMessage(
        caughtError instanceof Error ? caughtError.message : 'Unable to load your VN list.'
      );
    } finally {
      setIsDataLoading(false);
    }
  }

  function handleSearchFormSubmission(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setIsViewingUserList(false);
    setUserListStatusByIdentifier({});
    registerRecentSearchTerm(activeSearchTerm);
    executeSearchWithFilters(activeSearchTerm, appliedFilters);
  }

  const loadNextPage = useCallback(() => {
    if (isViewingUserList || isDataLoading || isLoadingAdditionalPage || !hasAdditionalResults) {
      return;
    }

    executeDataFetchOperation(activeQueryDescriptor, currentResultPage + 1, true);
  }, [isViewingUserList, isDataLoading, isLoadingAdditionalPage, hasAdditionalResults, activeQueryDescriptor, currentResultPage]);

  useEffect(() => {
    if (homeNavigationRequestToken === previousHomeNavigationRequestTokenReference.current) {
      return;
    }

    previousHomeNavigationRequestTokenReference.current = homeNavigationRequestToken;
    setIsViewingUserList(false);
    setUserListStatusByIdentifier({});
    setActiveSearchTerm('');
    const resetFilterState = createDefaultFilterState();
    const resetSortState = DEFAULT_SORT_STATE;
    setDraftFilters(resetFilterState);
    setAppliedFilters(resetFilterState);
    setAppliedSort(resetSortState);
    executeDataFetchOperation({ kind: 'text', term: '', filters: resetFilterState, sort: resetSortState }, 1, false);
  }, [homeNavigationRequestToken, defaultListOnlyWithScreenshots, defaultListOnlyWithDescription, defaultListSortField, defaultListSortDirection]);

  useEffect(() => {
    // External tag search requests should replace current list context immediately.
    if (!tagSearchRequest) {
      return;
    }

    setIsViewingUserList(false);
    setUserListStatusByIdentifier({});
    setActiveSearchTerm(tagSearchRequest.tagName);
    executeDataFetchOperation(
      {
        kind: 'tag',
        term: tagSearchRequest.tagName,
        tagIdentifier: tagSearchRequest.tagIdentifier,
        filters: appliedFilters,
        sort: appliedSort
      },
      1,
      false
    );
  }, [tagSearchRequest, appliedFilters, appliedSort]);

  useEffect(() => {
    // External developer search requests should replace current list context immediately.
    if (!developerSearchRequest) {
      return;
    }

    setIsViewingUserList(false);
    setUserListStatusByIdentifier({});
    setActiveSearchTerm(developerSearchRequest.developerName);
    executeDataFetchOperation(
      {
        kind: 'developer',
        term: developerSearchRequest.developerName,
        developerIdentifier: developerSearchRequest.developerIdentifier,
        filters: appliedFilters,
        sort: appliedSort
      },
      1,
      false
    );
  }, [developerSearchRequest, appliedFilters, appliedSort]);

  useEffect(() => {
    if (authenticatedSession) {
      return;
    }

    setIsViewingUserList(false);
    setUserListIdentifierSet(new Set());
    setUserListStatusByIdentifier({});
  }, [authenticatedSession]);

  useEffect(() => {
    // Background fetch of membership IDs to mark "already added" cards in current search results.
    let hasLifecycleBeenCancelled = false;

    async function executeUserListIdentifierFetch() {
      if (!authenticatedSession || !hasListReadPermission) {
        setUserListIdentifierSet(new Set());
        return;
      }

      try {
        const visualNovelIdentifierSet = await fetchAuthenticatedUserVisualNovelIdentifierSet(
          authenticatedSession.token,
          authenticatedSession.userId
        );
        if (!hasLifecycleBeenCancelled) {
          setUserListIdentifierSet(visualNovelIdentifierSet);
        }
      } catch {
        if (!hasLifecycleBeenCancelled) {
          setUserListIdentifierSet(new Set());
        }
      }
    }

    executeUserListIdentifierFetch();

    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [authenticatedSession, hasListReadPermission]);

  useEffect(() => {
    if (!isViewingUserList || !authenticatedSession) {
      return;
    }

    executeAuthenticatedUserListFetch();
  }, [userListRefreshToken]);

  useEffect(() => {
    const paginationTriggerElement = paginationTriggerReference.current;
    if (!paginationTriggerElement) {
      return;
    }

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: '150px' }
    );

    visibilityObserver.observe(paginationTriggerElement);
    return () => {
      visibilityObserver.disconnect();
    };
  }, [loadNextPage]);

  return (
    <div className={styles.interfaceContainerBoundary}>
      <div className={styles.listHeaderBlock}>
        <h2 className={styles.listHeadingText}>Discover Visual Novels</h2>
        <p className={styles.listSubheadingText}>Image-first browsing with quick search and infinite scroll.</p>
      </div>

      <form onSubmit={handleSearchFormSubmission} className={styles.searchControlBoundary}>
        <input 
          ref={searchInputReference}
          type="text" 
          value={activeSearchTerm}
          onChange={(inputEvent) => setActiveSearchTerm(inputEvent.target.value)}
          placeholder="Search visual novels (e.g., Steins;Gate)..."
          className={styles.searchInputField}
          aria-label="Search visual novels"
        />
        <button type="submit" className={styles.searchExecutionButton} style={themedPrimaryButtonStyle}>Search</button>
      </form>
      {recentSearchTerms.length > 0 && (
        <div className={styles.recentSearchRow}>
          <span className={styles.recentSearchLabel}>Recent:</span>
          {recentSearchTerms.map((recentSearchTerm) => (
            <button
              key={recentSearchTerm}
              type="button"
              className={styles.recentSearchChip}
              onClick={() => {
                setActiveSearchTerm(recentSearchTerm);
                setIsViewingUserList(false);
                setUserListStatusByIdentifier({});
                executeSearchWithFilters(recentSearchTerm, appliedFilters);
              }}
            >
              {recentSearchTerm}
            </button>
          ))}
          <button
            type="button"
            className={styles.recentSearchClearButton}
            onClick={() => setRecentSearchTerms([])}
          >
            Clear
          </button>
        </div>
      )}
      <div className={styles.filterControlRow}>
        {authenticatedSession && (
          <button
            type="button"
            className={styles.userListToggleButton}
            onClick={() => {
              if (isViewingUserList) {
                setIsViewingUserList(false);
                setUserListStatusByIdentifier({});
                executeSearchWithFilters(activeSearchTerm, appliedFilters);
              } else {
                executeAuthenticatedUserListFetch();
              }
            }}
          >
            {isViewingUserList ? 'Back to Search' : 'My VN List'}
          </button>
        )}
        <button
          type="button"
          className={styles.filterToggleButton}
          onClick={() => setIsFilterPanelVisible((currentVisibility) => !currentVisibility)}
        >
          Filters {appliedFilterCount > 0 ? `(${appliedFilterCount})` : ''}
        </button>
        <div className={styles.sortControlGroup}>
          <label htmlFor="sort-field-select" className={styles.sortLabelText}>Sort:</label>
          <select
            id="sort-field-select"
            className={styles.sortSelectField}
            value={appliedSort.field}
            onChange={(changeEvent) => handleSortFieldChange(changeEvent.target.value as ListSortState['field'])}
          >
            {SORT_FIELD_OPTIONS.map((sortFieldOption) => (
              <option key={sortFieldOption.value} value={sortFieldOption.value}>
                {sortFieldOption.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.sortDirectionButton}
            onClick={handleSortDirectionToggle}
            disabled={appliedSort.field === 'default'}
          >
            {appliedSort.direction === 'asc' ? 'Asc' : 'Desc'}
          </button>
        </div>
        <p className={styles.activeFilterText}>{activeFilterSummaryText}</p>
      </div>

      {isFilterPanelVisible && (
        <div className={styles.filterPanelBoundary}>
          <div className={styles.filterSectionBoundary}>
            <p className={styles.filterSectionTitle}>Available Languages</p>
            <div className={styles.filterChipRow}>
              {LANGUAGE_OPTIONS.map((languageOption) => {
                const isSelected = draftFilters.languages.includes(languageOption.code);
                return (
                  <button
                    key={languageOption.code}
                    type="button"
                    className={`${styles.filterChipButton} ${isSelected ? styles.filterChipButtonSelected : ''}`}
                    onClick={() => handleLanguageFilterToggle(languageOption.code)}
                  >
                    {languageOption.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.filterSectionBoundary}>
            <label htmlFor="original-language-select" className={styles.filterSectionTitle}>Original Language</label>
            <select
              id="original-language-select"
              className={styles.filterSelectField}
              value={draftFilters.originalLanguage}
              onChange={(changeEvent) => setDraftFilters((currentFilters) => ({
                ...currentFilters,
                originalLanguage: changeEvent.target.value
              }))}
            >
              {originalLanguageOptions.map((originalLanguageOption) => (
                <option key={originalLanguageOption.value || 'any'} value={originalLanguageOption.value}>
                  {originalLanguageOption.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterToggleGrid}>
            <label className={styles.filterCheckboxLabel}>
              <input
                type="checkbox"
                checked={draftFilters.onlyWithScreenshots}
                onChange={(changeEvent) => setDraftFilters((currentFilters) => ({
                  ...currentFilters,
                  onlyWithScreenshots: changeEvent.target.checked
                }))}
              />
              Only with screenshots
            </label>
            <label className={styles.filterCheckboxLabel}>
              <input
                type="checkbox"
                checked={draftFilters.onlyWithDescription}
                onChange={(changeEvent) => setDraftFilters((currentFilters) => ({
                  ...currentFilters,
                  onlyWithDescription: changeEvent.target.checked
                }))}
              />
              Only with descriptions
            </label>
          </div>

          <div className={styles.filterActionRow}>
            <button type="button" className={styles.filterSecondaryButton} onClick={handleFilterReset}>
              Clear
            </button>
            <button type="button" className={styles.searchExecutionButton} style={themedPrimaryButtonStyle} onClick={handleFilterApplication}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {isDataLoading && (
        <>
          <div className={styles.systemStatusMessage}>Executing network request...</div>
          <ul className={styles.visualNovelResultsList} aria-hidden>
            {loadingSkeletonIdentifiers.map((skeletonIdentifier) => (
              <li key={skeletonIdentifier} className={styles.visualNovelListItemSkeleton}>
                <div className={styles.visualNovelCardSkeleton} />
              </li>
            ))}
          </ul>
        </>
      )}
      {networkErrorMessage && <div className={styles.systemErrorMessage}>System Error: {networkErrorMessage}</div>}

      {!isDataLoading && !networkErrorMessage && (
        <>
          <p className={styles.resultSummaryText}>
            {visualNovelDatabaseEntries.length} result{visualNovelDatabaseEntries.length === 1 ? '' : 's'} loaded
          </p>
          {isViewingUserList && (
            <p className={styles.userListInfoText}>
              Note: VNDB API does not return deleted visual novels from user lists, even if they still appear on the website.
            </p>
          )}
          {isViewingUserList && authenticatedSession && !hasListReadPermission && (
            <p className={styles.userListInfoText}>
              Your token does not include `listread`; entries under private labels may be hidden by VNDB API.
            </p>
          )}
          {isViewingUserList && visualNovelDatabaseEntries.length === 0 && (
            <div className={styles.systemStatusMessage}>Your VN list is currently empty or unavailable.</div>
          )}
          {!isViewingUserList && visualNovelDatabaseEntries.length === 0 && (
            <div className={styles.emptyStateBoundary}>
              <p className={styles.emptyStateTitle}>No visual novels found.</p>
              <p className={styles.emptyStateBody}>Try a broader title, remove filters, or clear the search term.</p>
              {activeSearchTerm.trim() !== '' && (
                <button
                  type="button"
                  className={styles.filterSecondaryButton}
                  onClick={() => setActiveSearchTerm('')}
                >
                  Clear Search
                </button>
              )}
            </div>
          )}
          <ul className={styles.visualNovelResultsList}>
            {/* The parent component now strictly maps data to the child interface. */}
            {visualNovelDatabaseEntries
              .map((novelEntry) => {
                const normalizedIdentifier = normalizeEntryIdentifier((novelEntry as { id?: unknown }).id);
                if (!normalizedIdentifier) {
                  return null;
                }

                return {
                  ...novelEntry,
                  id: normalizedIdentifier
                };
              })
              .filter((novelEntry): novelEntry is VisualNovelDatabaseEntry => Boolean(novelEntry))
              .map((novelEntry, itemIndex) => (
                <VisualNovelListItem 
                    key={novelEntry.id} 
                    visualNovelData={novelEntry} 
                    onVisualNovelSelection={() => onVisualNovelSelection(novelEntry.id)}
                    onVisualNovelPrefetch={onVisualNovelPrefetch}
                    onAddVisualNovelToUserList={onAddVisualNovelToUserList}
                    canAddToUserList={Boolean(authenticatedSession && hasListWritePermission)}
                    canEditExistingUserListEntry={Boolean(isViewingUserList && authenticatedSession && hasListWritePermission)}
                    nsfwCoverBlurMode={nsfwCoverBlurMode}
                    isAlreadyInUserList={userListIdentifierSet.has(
                      novelEntry.id.toLowerCase().startsWith('v') ? novelEntry.id.toLowerCase() : `v${novelEntry.id.toLowerCase()}`
                    )}
                    initialStatusLabelIdentifier={userListStatusByIdentifier[
                      novelEntry.id.toLowerCase().startsWith('v') ? novelEntry.id.toLowerCase() : `v${novelEntry.id.toLowerCase()}`
                    ] ?? 5}
                    onMarkedAsAdded={(visualNovelIdentifier) => {
                      setUserListIdentifierSet((currentSet) => {
                        const normalizedIdentifier = visualNovelIdentifier.toLowerCase().startsWith('v')
                          ? visualNovelIdentifier.toLowerCase()
                          : `v${visualNovelIdentifier.toLowerCase()}`;
                        const updatedSet = new Set(currentSet);
                        updatedSet.add(normalizedIdentifier);
                        return updatedSet;
                      });
                    }}
                    onUpdateUserListStatus={async (visualNovelIdentifier, statusLabelIdentifier) => {
                      await onUpdateVisualNovelUserListStatus(visualNovelIdentifier, statusLabelIdentifier);
                      setUserListStatusByIdentifier((currentStatusMap) => {
                        const normalizedVisualNovelIdentifier = visualNovelIdentifier.toLowerCase().startsWith('v')
                          ? visualNovelIdentifier.toLowerCase()
                          : `v${visualNovelIdentifier.toLowerCase()}`;
                        return {
                          ...currentStatusMap,
                          [normalizedVisualNovelIdentifier]: statusLabelIdentifier
                        };
                      });
                    }}
                    itemIndex={itemIndex} 
                />
                ))}
          </ul>

          <div ref={paginationTriggerReference} />
          {isLoadingAdditionalPage && <div className={styles.systemStatusMessage}>Loading additional results...</div>}
        </>
      )}
    </div>
  );
}
