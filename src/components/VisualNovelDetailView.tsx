import { useState, useEffect, useRef } from 'react';
import {
  fetchAuthenticatedUserVisualNovelListEntry,
  fetchVisualNovelCoreDetailsById,
  fetchVisualNovelStoreLinksById,
  fetchVisualNovelSupplementalDetailsById,
  fetchTagMetadataByIds,
  removeVisualNovelFromAuthenticatedUserList,
  updateAuthenticatedUserVisualNovelStatusLabel
} from '../api/visualNovelClient';
import { type VisualNovelDetailedEntry, type VisualNovelExternalLinkEntry } from '../types/apiTypes';
import { renderVndbDescription } from '../utils/renderVndbDescription';
import styles from './VisualNovelList.module.css'; // Reusing our structural styles for consistency

interface VisualNovelDetailViewProperties {
  visualNovelIdentifier: string;
  onNavigateBack: () => void;
  onNavigateHome: () => void;
  onTagSelection: (tagName: string, tagIdentifier?: string) => void;
  onRelatedVisualNovelSelection: (visualNovelIdentifier: string) => void;
  onDeveloperSelection: (developerName: string, developerIdentifier?: string) => void;
  authenticatedSession: {
    token: string;
    userId: string;
    username: string;
    permissions: string[];
  } | null;
  onAddVisualNovelToUserList: (visualNovelIdentifier: string, labelIdentifier?: number) => Promise<void>;
  onUserListRefreshRequested: () => void;
}

// This component strictly manages the lifecycle and presentation of a single detailed record.
export function VisualNovelDetailView({
  visualNovelIdentifier,
  onNavigateBack,
  onNavigateHome,
  onTagSelection,
  onRelatedVisualNovelSelection,
  onDeveloperSelection,
  authenticatedSession,
  onAddVisualNovelToUserList,
  onUserListRefreshRequested
}: VisualNovelDetailViewProperties) {
  type TagCategoryFilter = 'all' | 'cont' | 'ero' | 'tech';
  const themedPrimaryButtonStyle = {
    background: 'var(--button-primary-bg)',
    borderColor: 'var(--button-primary-border)',
    color: 'var(--button-primary-text)',
    boxShadow: 'var(--button-primary-shadow)'
  } as const;
  const themedSecondaryButtonStyle = {
    background: 'var(--button-secondary-bg)',
    borderColor: 'var(--button-secondary-border)',
    color: 'var(--button-secondary-text)'
  } as const;
  const [detailedVisualNovelData, setDetailedVisualNovelData] = useState<VisualNovelDetailedEntry | null>(null);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(true);
  const [isSupplementalDataLoading, setIsSupplementalDataLoading] = useState<boolean>(true);
  const [storeLinkEntries, setStoreLinkEntries] = useState<VisualNovelExternalLinkEntry[]>([]);
  const [networkErrorMessage, setNetworkErrorMessage] = useState<string | null>(null);
  const [areTagsVisible, setAreTagsVisible] = useState<boolean>(false);
  const [areScreenshotsVisible, setAreScreenshotsVisible] = useState<boolean>(false);
  const [areStoreLinksVisible, setAreStoreLinksVisible] = useState<boolean>(false);
  const [areDevelopersVisible, setAreDevelopersVisible] = useState<boolean>(false);
  const [areRelatedTitlesVisible, setAreRelatedTitlesVisible] = useState<boolean>(false);
  const [maxVisibleTagSpoilerLevel, setMaxVisibleTagSpoilerLevel] = useState<0 | 1 | 2>(0);
  const [activeTagCategoryFilter, setActiveTagCategoryFilter] = useState<TagCategoryFilter>('all');
  const [tagCategoryByIdentifier, setTagCategoryByIdentifier] = useState<Record<string, string>>({});
  const [isAddOperationInFlight, setIsAddOperationInFlight] = useState<boolean>(false);
  const [addOperationMessage, setAddOperationMessage] = useState<string | null>(null);
  const hasListWritePermission = authenticatedSession?.permissions.includes('listwrite') ?? false;
  const hasListReadPermission = authenticatedSession?.permissions.includes('listread') ?? false;
  const [isUserListStateLoading, setIsUserListStateLoading] = useState<boolean>(false);
  const [isCurrentVisualNovelInUserList, setIsCurrentVisualNovelInUserList] = useState<boolean>(false);
  const [selectedStatusLabelIdentifier, setSelectedStatusLabelIdentifier] = useState<number>(5);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState<number | null>(null);
  const screenshotTouchStartXRef = useRef<number | null>(null);
  const screenshotTouchCurrentXRef = useRef<number | null>(null);

  const USER_LIST_STATUS_OPTIONS = [
    { id: 1, label: 'Playing' },
    { id: 2, label: 'Finished' },
    { id: 3, label: 'Stalled' },
    { id: 4, label: 'Dropped' },
    { id: 5, label: 'Wishlist' },
    { id: 6, label: 'Blacklist' }
  ];

  // Reload full detail record whenever selected VN changes.
  useEffect(() => {
    let hasLifecycleBeenCancelled = false;
    setIsDataLoading(true);
    setIsSupplementalDataLoading(true);
    setStoreLinkEntries([]);
    setNetworkErrorMessage(null);
    setDetailedVisualNovelData(null);
    setAreTagsVisible(false);
    setAreScreenshotsVisible(false);
    setAreStoreLinksVisible(false);
    setAreDevelopersVisible(false);
    setAreRelatedTitlesVisible(false);
    setMaxVisibleTagSpoilerLevel(0);
    setActiveTagCategoryFilter('all');
    setTagCategoryByIdentifier({});
    setAddOperationMessage(null);
    setIsAddOperationInFlight(false);
    setIsCurrentVisualNovelInUserList(false);
    setSelectedStatusLabelIdentifier(5);
    setActiveScreenshotIndex(null);

    async function executeDetailedDataFetch() {
      try {
        const coreResponsePayload = await fetchVisualNovelCoreDetailsById(visualNovelIdentifier);
        if (coreResponsePayload.results.length === 0) {
          if (!hasLifecycleBeenCancelled) {
            setNetworkErrorMessage('System Error: No visual novel found with that identifier.');
            setIsDataLoading(false);
            setIsSupplementalDataLoading(false);
          }
          return;
        }

        const coreEntry = coreResponsePayload.results[0];
        if (!hasLifecycleBeenCancelled) {
          setDetailedVisualNovelData(coreEntry);
          setIsDataLoading(false);
        }

        try {
          const [supplementalResponsePayload, storeLinksResponsePayload] = await Promise.all([
            fetchVisualNovelSupplementalDetailsById(visualNovelIdentifier),
            fetchVisualNovelStoreLinksById(visualNovelIdentifier).catch(() => [])
          ]);
          const supplementalEntry = supplementalResponsePayload.results[0] as Partial<VisualNovelDetailedEntry> | undefined;

          if (!hasLifecycleBeenCancelled && supplementalEntry) {
            setDetailedVisualNovelData((currentData) => {
              if (!currentData) {
                return currentData;
              }

              return {
                ...currentData,
                ...supplementalEntry
              };
            });
          }

          if (!hasLifecycleBeenCancelled) {
            setStoreLinkEntries(storeLinksResponsePayload);
          }

          const tagIdentifiers = (supplementalEntry?.tags ?? [])
            .map((tagEntry) => tagEntry.id)
            .filter((tagIdentifier): tagIdentifier is string => typeof tagIdentifier === 'string' && tagIdentifier.trim() !== '');
          if (tagIdentifiers.length > 0) {
            try {
              const tagMetadataResponse = await fetchTagMetadataByIds(tagIdentifiers);
              if (!hasLifecycleBeenCancelled) {
                setTagCategoryByIdentifier(
                  Object.fromEntries(
                    tagMetadataResponse.results.map((tagMetadataEntry) => [tagMetadataEntry.id, tagMetadataEntry.category])
                  )
                );
              }
            } catch {
              if (!hasLifecycleBeenCancelled) {
                setTagCategoryByIdentifier({});
              }
            }
          }
        } finally {
          if (!hasLifecycleBeenCancelled) {
            setIsSupplementalDataLoading(false);
          }
        }
      } catch (caughtError) {
        if (!hasLifecycleBeenCancelled) {
          setNetworkErrorMessage(
            caughtError instanceof Error ? caughtError.message : 'An unknown system error occurred.'
          );
          setIsSupplementalDataLoading(false);
        }
      } finally {
        if (!hasLifecycleBeenCancelled) {
          setIsDataLoading(false);
        }
      }
    }

    executeDetailedDataFetch();

    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [visualNovelIdentifier]);

  // Lightweight membership probe used to switch "Add" vs "Already in My List" state on detail screen.
  useEffect(() => {
    let hasLifecycleBeenCancelled = false;

    async function executeUserListMembershipLookup() {
      if (!authenticatedSession || !hasListReadPermission) {
        setIsCurrentVisualNovelInUserList(false);
        setIsUserListStateLoading(false);
        return;
      }

      setIsUserListStateLoading(true);
      try {
        const userListEntry = await fetchAuthenticatedUserVisualNovelListEntry(
          authenticatedSession.token,
          authenticatedSession.userId,
          visualNovelIdentifier
        );
        if (hasLifecycleBeenCancelled) {
          return;
        }

        setIsCurrentVisualNovelInUserList(userListEntry.isInList);
        if (userListEntry.isInList) {
          const activeStatusLabel = USER_LIST_STATUS_OPTIONS.find((statusOption) => userListEntry.labels.includes(statusOption.id));
          setSelectedStatusLabelIdentifier(activeStatusLabel?.id ?? 5);
        } else {
          setSelectedStatusLabelIdentifier(5);
        }
      } catch (caughtError) {
        if (hasLifecycleBeenCancelled) {
          return;
        }

        console.warn('List membership check failed in detail view:', caughtError);
        setIsCurrentVisualNovelInUserList(false);
      } finally {
        if (!hasLifecycleBeenCancelled) {
          setIsUserListStateLoading(false);
        }
      }
    }

    executeUserListMembershipLookup();

    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [authenticatedSession, hasListReadPermission, visualNovelIdentifier]);

  const fullSizeCoverImageUrl = detailedVisualNovelData?.image?.url || detailedVisualNovelData?.image?.thumbnail;
  function normalizeTagCategory(rawCategory: string | undefined): 'cont' | 'ero' | 'tech' | 'unknown' {
    const normalizedCategoryValue = (rawCategory ?? '').toLowerCase();
    if (normalizedCategoryValue === 'cont' || normalizedCategoryValue === 'content') {
      return 'cont';
    }

    if (normalizedCategoryValue === 'ero' || normalizedCategoryValue === 'sexual') {
      return 'ero';
    }

    if (normalizedCategoryValue === 'tech' || normalizedCategoryValue === 'technical') {
      return 'tech';
    }

    return 'unknown';
  }
  const rawTagEntries = Array.isArray(detailedVisualNovelData?.tags) ? detailedVisualNovelData.tags : [];
  const normalizedTagEntries = rawTagEntries.reduce<Array<{
    id: string | undefined;
    name: string;
    spoiler: number;
    rating: number | null;
    category: 'cont' | 'ero' | 'tech' | 'unknown';
  }>>((accumulatedTagEntries, rawTagEntry) => {
    if (!rawTagEntry || typeof rawTagEntry !== 'object') {
      return accumulatedTagEntries;
    }

    const tagEntry = rawTagEntry as {
      id?: unknown;
      name?: unknown;
      spoiler?: unknown;
      rating?: unknown;
      category?: unknown;
    };
    const normalizedTagName = typeof tagEntry.name === 'string' ? tagEntry.name.trim() : '';
    if (normalizedTagName === '') {
      return accumulatedTagEntries;
    }

    const normalizedTagIdentifier = typeof tagEntry.id === 'string' ? tagEntry.id : undefined;
    accumulatedTagEntries.push({
      id: normalizedTagIdentifier,
      name: normalizedTagName,
      spoiler: typeof tagEntry.spoiler === 'number' && Number.isFinite(tagEntry.spoiler) ? Number(tagEntry.spoiler) : 0,
      rating: typeof tagEntry.rating === 'number' && Number.isFinite(tagEntry.rating) ? Number(tagEntry.rating) : null,
      category: normalizeTagCategory(
        (typeof tagEntry.category === 'string' ? tagEntry.category : undefined) ||
          (normalizedTagIdentifier ? tagCategoryByIdentifier[normalizedTagIdentifier] : undefined)
      )
    });
    return accumulatedTagEntries;
  }, []);
  // Respect spoiler and category toggles before rendering tag chips.
  const filteredTagEntries = normalizedTagEntries
    .filter((tagEntry) => tagEntry.spoiler <= maxVisibleTagSpoilerLevel)
    .filter((tagEntry) => activeTagCategoryFilter === 'all' || tagEntry.category === activeTagCategoryFilter)
    .sort((firstTagEntry, secondTagEntry) => (secondTagEntry.rating ?? 0) - (firstTagEntry.rating ?? 0));
  const screenshotEntries = Array.isArray(detailedVisualNovelData?.screenshots) ? detailedVisualNovelData.screenshots : [];
  const normalizedScreenshotEntries = screenshotEntries
    .map((rawScreenshotEntry, screenshotIndex) => {
      if (!rawScreenshotEntry || typeof rawScreenshotEntry !== 'object') {
        return null;
      }

      const screenshotEntry = rawScreenshotEntry as { id?: unknown; thumbnail?: unknown; url?: unknown };
      const previewUrl = typeof screenshotEntry.thumbnail === 'string'
        ? screenshotEntry.thumbnail
        : typeof screenshotEntry.url === 'string'
          ? screenshotEntry.url
          : '';
      const fullSizeUrl = typeof screenshotEntry.url === 'string'
        ? screenshotEntry.url
        : typeof screenshotEntry.thumbnail === 'string'
          ? screenshotEntry.thumbnail
          : '';
      if (!previewUrl || !fullSizeUrl) {
        return null;
      }

      const normalizedScreenshotIdentifier = typeof screenshotEntry.id === 'string' && screenshotEntry.id.trim() !== ''
        ? screenshotEntry.id
        : `screenshot-${screenshotIndex}`;

      return {
        id: normalizedScreenshotIdentifier,
        previewUrl,
        fullSizeUrl
      };
    })
    .filter((screenshotEntry): screenshotEntry is { id: string; previewUrl: string; fullSizeUrl: string } => Boolean(screenshotEntry));
  const relationLabelByCode: Record<string, string> = {
    preq: 'Prequel',
    seq: 'Sequel',
    side: 'Side Story',
    fan: 'Fan Disc',
    orig: 'Original',
    set: 'Shared Setting',
    alt: 'Alternative Version',
    char: 'Character',
    summary: 'Summary'
  };
  const rawRelationEntries = Array.isArray(detailedVisualNovelData?.relations) ? detailedVisualNovelData.relations : [];
  const relatedVisualNovelEntries = rawRelationEntries
    .map((rawRelationEntry) => {
      if (!rawRelationEntry || typeof rawRelationEntry !== 'object') {
        return null;
      }

      const relationEntry = rawRelationEntry as { id?: unknown; title?: unknown; relation?: unknown };
      const normalizedRelationIdentifier = typeof relationEntry.id === 'string' ? relationEntry.id : '';
      const normalizedRelationTitle = typeof relationEntry.title === 'string' ? relationEntry.title : '';
      if (!normalizedRelationIdentifier || !normalizedRelationTitle) {
        return null;
      }

      const relationCode = typeof relationEntry.relation === 'string' ? relationEntry.relation.toLowerCase() : '';
      return {
        id: normalizedRelationIdentifier,
        title: normalizedRelationTitle,
        relation: relationCode,
        relationLabel: relationLabelByCode[relationCode] || 'Related'
      };
    })
    .filter((relationEntry): relationEntry is { id: string; title: string; relation: string; relationLabel: string } => Boolean(relationEntry));

  interface NormalizedContributorEntry {
    id?: string;
    name: string;
    role: string;
  }

  function normalizeContributorEntries(rawContributorEntries: unknown[]): NormalizedContributorEntry[] {
    const normalizedEntries: NormalizedContributorEntry[] = [];

    for (const rawContributorEntry of rawContributorEntries) {
      if (!rawContributorEntry || typeof rawContributorEntry !== 'object') {
        continue;
      }

      const contributorEntry = rawContributorEntry as Record<string, unknown>;
        const nestedContributor = contributorEntry.developer && typeof contributorEntry.developer === 'object'
          ? contributorEntry.developer as Record<string, unknown>
          : null;
        const idValue = nestedContributor?.id ?? contributorEntry.id;
        const nameValue = nestedContributor?.name ?? contributorEntry.name;
        const roleValue = contributorEntry.role;

      if (typeof nameValue !== 'string' || nameValue.trim() === '') {
        continue;
      }

      normalizedEntries.push({
        id: typeof idValue === 'string' ? idValue : undefined,
        name: nameValue,
        role: typeof roleValue === 'string' ? roleValue : ''
      });
    }

    return normalizedEntries;
  }

  const developerEntries = normalizeContributorEntries((detailedVisualNovelData?.developers ?? []) as unknown[]);

  function formatReleaseDateForDisplay(rawReleaseDate: string | null | undefined) {
    if (!rawReleaseDate || rawReleaseDate.trim() === '') {
      return 'Unknown';
    }

    const normalizedReleaseDate = rawReleaseDate.trim();
    const isoDateMatch = normalizedReleaseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoDateMatch) {
      return normalizedReleaseDate;
    }

    const parsedYear = Number(isoDateMatch[1]);
    const parsedMonth = Number(isoDateMatch[2]);
    const parsedDay = Number(isoDateMatch[3]);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth) || !Number.isFinite(parsedDay)) {
      return normalizedReleaseDate;
    }

    const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(parsedYear, parsedMonth - 1, 1))
    );

    function getOrdinalSuffix(dayValue: number) {
      const moduloHundred = dayValue % 100;
      if (moduloHundred >= 11 && moduloHundred <= 13) {
        return 'th';
      }

      const moduloTen = dayValue % 10;
      if (moduloTen === 1) return 'st';
      if (moduloTen === 2) return 'nd';
      if (moduloTen === 3) return 'rd';
      return 'th';
    }

    return `${monthLabel} ${parsedDay}${getOrdinalSuffix(parsedDay)}, ${parsedYear}`;
  }

  // List mutation handlers are kept distinct for clear user feedback and button-state control.
  async function handleAddToUserListClick() {
    const visualNovelIdForMutation = detailedVisualNovelData?.id;
    if (!visualNovelIdForMutation) {
      setAddOperationMessage('Unable to resolve visual novel identifier.');
      return;
    }

    setAddOperationMessage(null);
    setIsAddOperationInFlight(true);

    try {
      await onAddVisualNovelToUserList(visualNovelIdForMutation, selectedStatusLabelIdentifier);
      setIsCurrentVisualNovelInUserList(true);
      const selectedStatusLabel = USER_LIST_STATUS_OPTIONS.find((statusOption) => statusOption.id === selectedStatusLabelIdentifier)?.label ?? 'Wishlist';
      setAddOperationMessage(`Added to your list (${selectedStatusLabel}).`);
      onUserListRefreshRequested();
    } catch (caughtError) {
      setAddOperationMessage(caughtError instanceof Error ? caughtError.message : 'Unable to add visual novel.');
    } finally {
      setIsAddOperationInFlight(false);
    }
  }

  async function handleStatusUpdateClick() {
    if (!authenticatedSession) {
      setAddOperationMessage('Authentication required.');
      return;
    }
    const visualNovelIdForMutation = detailedVisualNovelData?.id;
    if (!visualNovelIdForMutation) {
      setAddOperationMessage('Unable to resolve visual novel identifier.');
      return;
    }

    setAddOperationMessage(null);
    setIsAddOperationInFlight(true);
    try {
      await updateAuthenticatedUserVisualNovelStatusLabel(
        authenticatedSession.token,
        visualNovelIdForMutation,
        selectedStatusLabelIdentifier
      );
      const selectedStatusLabel = USER_LIST_STATUS_OPTIONS.find((statusOption) => statusOption.id === selectedStatusLabelIdentifier)?.label ?? 'Updated';
      setAddOperationMessage(`Status updated to ${selectedStatusLabel}.`);
      onUserListRefreshRequested();
    } catch (caughtError) {
      setAddOperationMessage(caughtError instanceof Error ? caughtError.message : 'Unable to update list status.');
    } finally {
      setIsAddOperationInFlight(false);
    }
  }

  async function handleRemoveFromListClick() {
    if (!authenticatedSession) {
      setAddOperationMessage('Authentication required.');
      return;
    }
    const visualNovelIdForMutation = detailedVisualNovelData?.id;
    if (!visualNovelIdForMutation) {
      setAddOperationMessage('Unable to resolve visual novel identifier.');
      return;
    }

    setAddOperationMessage(null);
    setIsAddOperationInFlight(true);
    try {
      await removeVisualNovelFromAuthenticatedUserList(authenticatedSession.token, visualNovelIdForMutation);
      setIsCurrentVisualNovelInUserList(false);
      setSelectedStatusLabelIdentifier(5);
      setAddOperationMessage('Removed from your list.');
      onUserListRefreshRequested();
    } catch (caughtError) {
      setAddOperationMessage(caughtError instanceof Error ? caughtError.message : 'Unable to remove visual novel.');
    } finally {
      setIsAddOperationInFlight(false);
    }
  }

  function navigateToPreviousScreenshot() {
    if (activeScreenshotIndex === null || normalizedScreenshotEntries.length === 0) {
      return;
    }

    setActiveScreenshotIndex((activeScreenshotIndex + normalizedScreenshotEntries.length - 1) % normalizedScreenshotEntries.length);
  }

  function navigateToNextScreenshot() {
    if (activeScreenshotIndex === null || normalizedScreenshotEntries.length === 0) {
      return;
    }

    setActiveScreenshotIndex((activeScreenshotIndex + 1) % normalizedScreenshotEntries.length);
  }

  useEffect(() => {
    if (activeScreenshotIndex === null || normalizedScreenshotEntries.length === 0) {
      return;
    }

    function handleGlobalKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === 'Escape') {
        setActiveScreenshotIndex(null);
        return;
      }

      if (keyboardEvent.key === 'ArrowLeft') {
        navigateToPreviousScreenshot();
        return;
      }

      if (keyboardEvent.key === 'ArrowRight') {
        navigateToNextScreenshot();
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [activeScreenshotIndex, normalizedScreenshotEntries.length]);

  useEffect(() => {
    if (activeScreenshotIndex === null || normalizedScreenshotEntries.length === 0) {
      return;
    }

    // Preload immediate neighbors for smoother left/right navigation with minimal extra bandwidth.
    const previousScreenshotIndex = (activeScreenshotIndex + normalizedScreenshotEntries.length - 1) % normalizedScreenshotEntries.length;
    const nextScreenshotIndex = (activeScreenshotIndex + 1) % normalizedScreenshotEntries.length;
    const preloadedImageUrls = [
      normalizedScreenshotEntries[previousScreenshotIndex].fullSizeUrl,
      normalizedScreenshotEntries[nextScreenshotIndex].fullSizeUrl
    ];

    preloadedImageUrls.forEach((imageUrl) => {
      const preloadedImage = new Image();
      preloadedImage.src = imageUrl;
    });
  }, [activeScreenshotIndex, normalizedScreenshotEntries]);

  if (isDataLoading) {
    return (
      <div className={`${styles.interfaceContainerBoundary} ${styles.detailContentCentered}`}>
        <div className={styles.detailSkeletonButton} />
        <div className={styles.detailSkeletonTitle} />
        <div className={styles.detailHeroLayout}>
          <div className={styles.detailSkeletonCover} />
          <div className={styles.detailHeroInfo}>
            <div className={styles.detailMetaRow}>
              <div className={styles.detailSkeletonMetaChip} />
              <div className={styles.detailSkeletonMetaChip} />
            </div>
            <div className={styles.detailActionRow}>
              <div className={styles.detailSkeletonAction} />
              <div className={styles.detailSkeletonActionWide} />
            </div>
          </div>
        </div>
        <div className={styles.detailSkeletonSection} />
      </div>
    );
  }

  if (networkErrorMessage || !detailedVisualNovelData) {
    return (
      <div className={styles.interfaceContainerBoundary}>
        <button onClick={onNavigateHome} className={styles.searchExecutionButton} style={themedPrimaryButtonStyle}>&larr; Return to Home</button>
        <div className={styles.systemErrorMessage}>{networkErrorMessage ?? 'Unable to load visual novel details.'}</div>
      </div>
    );
  }

  return (
    <div className={`${styles.interfaceContainerBoundary} ${styles.detailContentCentered}`}>
      <button
        onClick={onNavigateBack}
        className={styles.floatingBackButton}
        aria-label="Go back"
      >
        &larr;
      </button>

      <button onClick={onNavigateHome} className={`${styles.searchExecutionButton} ${styles.backToSearchButton}`} style={themedPrimaryButtonStyle}>
        &larr; Return to Home
      </button>

      <h2 className={styles.detailTitleText}>{detailedVisualNovelData.title}</h2>

      <div className={styles.detailHeroLayout}>
        <div className={styles.detailCoverSection}>
          {fullSizeCoverImageUrl ? (
            <img
              src={fullSizeCoverImageUrl}
              alt={`Cover art for ${detailedVisualNovelData.title}`}
              className={styles.detailCoverImage}
            />
          ) : (
            <div className={styles.detailNoImagePlaceholder}>No Image Available</div>
          )}
        </div>

        <div className={styles.detailHeroInfo}>
          <div className={styles.detailMetaRow}>
            <div className={styles.detailMetaChip}>
              <span className={styles.detailMetaLabel}>Release</span>
              <span>{formatReleaseDateForDisplay(detailedVisualNovelData.released)}</span>
            </div>
            <div className={styles.detailMetaChip}>
              <span className={styles.detailMetaLabel}>Rating</span>
              <span>{detailedVisualNovelData.rating || 'No rating available'}</span>
            </div>
          </div>

          {authenticatedSession && (
            <div className={styles.detailActionRow}>
              {isCurrentVisualNovelInUserList ? (
                <>
                  <span className={`${styles.detailActionStateChip} ${styles.detailActionStateChipAdded}`}>Already in My List</span>
                  <select
                    className={styles.detailStatusSelectField}
                    value={selectedStatusLabelIdentifier}
                    onChange={(changeEvent) => setSelectedStatusLabelIdentifier(Number(changeEvent.target.value))}
                    disabled={!hasListWritePermission || isAddOperationInFlight}
                  >
                    {USER_LIST_STATUS_OPTIONS.map((statusOption) => (
                      <option key={statusOption.id} value={statusOption.id}>
                        {statusOption.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.searchExecutionButton}
                    style={themedPrimaryButtonStyle}
                    onClick={handleStatusUpdateClick}
                    disabled={!hasListWritePermission || isAddOperationInFlight}
                  >
                    {isAddOperationInFlight ? 'Saving...' : 'Save Status'}
                  </button>
                  <button
                    type="button"
                    className={styles.filterSecondaryButton}
                    onClick={handleRemoveFromListClick}
                    disabled={!hasListWritePermission || isAddOperationInFlight}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <select
                    className={styles.detailStatusSelectField}
                    value={selectedStatusLabelIdentifier}
                    onChange={(changeEvent) => setSelectedStatusLabelIdentifier(Number(changeEvent.target.value))}
                    disabled={!hasListWritePermission || isAddOperationInFlight}
                  >
                    {USER_LIST_STATUS_OPTIONS.map((statusOption) => (
                      <option key={statusOption.id} value={statusOption.id}>
                        {statusOption.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.searchExecutionButton}
                    style={themedPrimaryButtonStyle}
                    onClick={handleAddToUserListClick}
                    disabled={!hasListWritePermission || isAddOperationInFlight}
                  >
                    {isAddOperationInFlight ? 'Adding...' : 'Add to My List'}
                  </button>
                </>
              )}
              {isUserListStateLoading && <p className={styles.detailActionMessage}>Checking list status...</p>}
              {addOperationMessage && <p className={styles.detailActionMessage}>{addOperationMessage}</p>}
              {!hasListWritePermission && (
                <p className={styles.detailActionMessage}>Token missing `listwrite` permission.</p>
              )}
              {!hasListReadPermission && (
                <p className={styles.detailActionMessage}>Token missing `listread`; existing status may be hidden.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.detailSectionsGrid}>
      <div className={`${styles.detailDescriptionSection} ${styles.detailSectionFull}`}>
        <h3 className={styles.sectionHeadingText}>Description</h3>
        {detailedVisualNovelData.description ? (
          <div className={styles.detailDescriptionText}>
            {renderVndbDescription(detailedVisualNovelData.description)}
          </div>
        ) : (
          <p>No description provided.</p>
        )}
      </div>

      <div className={styles.detailTagSection}>
        <button
          type="button"
          className={styles.detailTagToggleButton}
          style={themedSecondaryButtonStyle}
          onClick={() => setAreTagsVisible((currentState) => !currentState)}
          aria-expanded={areTagsVisible}
        >
          {areTagsVisible ? 'Hide Tags' : 'Show Tags'}
        </button>

        {areTagsVisible && (
          <>
            {isSupplementalDataLoading && <p className={styles.detailActionMessage}>Loading tags...</p>}
            <div className={styles.tagVisibilityControlRow}>
              <label htmlFor="spoiler-visibility-select" className={styles.tagControlLabel}>Spoilers</label>
              <select
                id="spoiler-visibility-select"
                className={styles.tagSpoilerSelectField}
                value={maxVisibleTagSpoilerLevel}
                onChange={(changeEvent) => setMaxVisibleTagSpoilerLevel(Number(changeEvent.target.value) as 0 | 1 | 2)}
              >
                <option value={0}>Hide Spoilers</option>
                <option value={1}>Show Minor Spoilers</option>
                <option value={2}>Show All Spoilers</option>
              </select>
            </div>

            <div className={styles.tagCategoryFilterRow}>
              <button
                type="button"
                className={`${styles.tagCategoryFilterButton} ${activeTagCategoryFilter === 'all' ? styles.tagCategoryFilterButtonActive : ''}`}
                onClick={() => setActiveTagCategoryFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`${styles.tagCategoryFilterButton} ${activeTagCategoryFilter === 'cont' ? styles.tagCategoryFilterButtonActive : ''}`}
                onClick={() => setActiveTagCategoryFilter('cont')}
              >
                Content
              </button>
              <button
                type="button"
                className={`${styles.tagCategoryFilterButton} ${activeTagCategoryFilter === 'ero' ? styles.tagCategoryFilterButtonActive : ''}`}
                onClick={() => setActiveTagCategoryFilter('ero')}
              >
                Sexual
              </button>
              <button
                type="button"
                className={`${styles.tagCategoryFilterButton} ${activeTagCategoryFilter === 'tech' ? styles.tagCategoryFilterButtonActive : ''}`}
                onClick={() => setActiveTagCategoryFilter('tech')}
              >
                Technical
              </button>
            </div>

            {filteredTagEntries.length > 0 ? (
              <ul className={styles.detailTagList}>
                {filteredTagEntries.map((tagEntry) => (
                  <li key={tagEntry.id ?? tagEntry.name}>
                    <button
                      type="button"
                      className={`${styles.detailTagPillButton} ${
                        tagEntry.category === 'ero'
                          ? styles.detailTagPillSexual
                          : tagEntry.category === 'tech'
                            ? styles.detailTagPillTechnical
                            : tagEntry.category === 'cont'
                              ? styles.detailTagPillContent
                              : styles.detailTagPillOther
                      }`}
                      onClick={() => onTagSelection(tagEntry.name, tagEntry.id)}
                    >
                      <span>{tagEntry.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No tags match current filters.</p>
            )}
          </>
        )}
      </div>

      <div className={styles.detailStoreLinkSection}>
        <button
          type="button"
          className={styles.detailTagToggleButton}
          style={themedSecondaryButtonStyle}
          onClick={() => setAreStoreLinksVisible((currentState) => !currentState)}
          aria-expanded={areStoreLinksVisible}
        >
          {areStoreLinksVisible ? 'Hide Store Links' : `Show Store Links (${storeLinkEntries.length})`}
        </button>
        {!areStoreLinksVisible && (
          <p className={styles.detailActionMessage}>Purchase links are grouped here.</p>
        )}
        {areStoreLinksVisible && isSupplementalDataLoading && <p className={styles.detailActionMessage}>Loading store links...</p>}
        {areStoreLinksVisible && !isSupplementalDataLoading && storeLinkEntries.length === 0 && (
          <p>No store links available.</p>
        )}
        {areStoreLinksVisible && storeLinkEntries.length > 0 && (
          <ul className={styles.detailStoreLinkList}>
            {storeLinkEntries.map((storeLinkEntry) => (
              <li key={`${storeLinkEntry.url}-${storeLinkEntry.label}`} className={styles.detailStoreLinkListItem}>
                <a
                  href={storeLinkEntry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.detailStoreLinkButton}
                >
                  <span className={styles.detailStoreLinkLabel}>{storeLinkEntry.label}</span>
                  <span className={styles.detailStoreLinkMeta}>
                    {storeLinkEntry.source ?? 'External'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.detailScreenshotSection}>
        <button
          type="button"
          className={styles.detailTagToggleButton}
          style={themedSecondaryButtonStyle}
          onClick={() => setAreScreenshotsVisible((currentState) => !currentState)}
          aria-expanded={areScreenshotsVisible}
        >
          {areScreenshotsVisible ? 'Hide Screenshots' : `Show Screenshots (${normalizedScreenshotEntries.length})`}
        </button>

        {areScreenshotsVisible && (
          isSupplementalDataLoading ? (
            <p className={styles.detailActionMessage}>Loading screenshots...</p>
          ) : normalizedScreenshotEntries.length > 0 ? (
            <ul className={styles.detailScreenshotGrid}>
              {normalizedScreenshotEntries.map((screenshotEntry, screenshotIndex) => (
                <li key={screenshotEntry.id} className={styles.detailScreenshotItem}>
                  <button
                    type="button"
                    className={styles.detailScreenshotButton}
                    onClick={() => setActiveScreenshotIndex(screenshotIndex)}
                  >
                      <img
                        src={screenshotEntry.previewUrl}
                        alt={`Screenshot from ${detailedVisualNovelData.title}`}
                        className={styles.detailScreenshotImage}
                      />
                    </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No screenshots available.</p>
          )
        )}
      </div>

      <div className={styles.detailContributorSection}>
        <button
          type="button"
          className={styles.detailTagToggleButton}
          style={themedSecondaryButtonStyle}
          onClick={() => setAreDevelopersVisible((currentState) => !currentState)}
          aria-expanded={areDevelopersVisible}
        >
          {areDevelopersVisible ? 'Hide Developers' : `Show Developers (${developerEntries.length})`}
        </button>
        {!areDevelopersVisible && (
          <p className={styles.detailActionMessage}>Studio/developer credits.</p>
        )}
        {areDevelopersVisible && isSupplementalDataLoading && <p className={styles.detailActionMessage}>Loading developers...</p>}
        {areDevelopersVisible && developerEntries.length > 0 ? (
          <div className={styles.contributorChipRow}>
            {developerEntries.map((developerEntry) => (
              <button
                key={`${developerEntry.id ?? developerEntry.name}-developer`}
                type="button"
                className={styles.contributorChipButton}
                onClick={() => onDeveloperSelection(developerEntry.name, developerEntry.id)}
              >
                {developerEntry.name}
              </button>
            ))}
          </div>
        ) : areDevelopersVisible ? (
          <p>No developer data available.</p>
        ) : null}
      </div>

      <div className={`${styles.detailRelatedSection} ${styles.detailSectionFull}`}>
        <button
          type="button"
          className={styles.detailTagToggleButton}
          style={themedSecondaryButtonStyle}
          onClick={() => setAreRelatedTitlesVisible((currentState) => !currentState)}
          aria-expanded={areRelatedTitlesVisible}
        >
          {areRelatedTitlesVisible ? 'Hide Related Titles' : `Show Related Titles (${relatedVisualNovelEntries.length})`}
        </button>
        {!areRelatedTitlesVisible && (
          <p className={styles.detailActionMessage}>Prequels, sequels, and related entries.</p>
        )}
        {areRelatedTitlesVisible && isSupplementalDataLoading && <p className={styles.detailActionMessage}>Loading related titles...</p>}
        {areRelatedTitlesVisible && relatedVisualNovelEntries.length > 0 ? (
          <ul className={styles.relatedVisualNovelList}>
            {relatedVisualNovelEntries.map((relationEntry) => (
              <li key={`${relationEntry.id}-${relationEntry.relation}`} className={styles.relatedVisualNovelListItem}>
                <button
                  type="button"
                  className={styles.relatedVisualNovelButton}
                  onClick={() => onRelatedVisualNovelSelection(relationEntry.id)}
                >
                  <span className={styles.relatedVisualNovelRelationBadge}>{relationEntry.relationLabel}</span>
                  <span className={styles.relatedVisualNovelTitleText}>{relationEntry.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : areRelatedTitlesVisible ? (
          <p>No related titles available.</p>
        ) : null}
      </div>
      </div>
      {activeScreenshotIndex !== null && normalizedScreenshotEntries[activeScreenshotIndex] && (
        <div
          className={styles.screenshotLightboxOverlay}
          onClick={() => setActiveScreenshotIndex(null)}
        >
          <div
            className={styles.screenshotLightboxContent}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            onTouchStart={(touchEvent) => {
              screenshotTouchStartXRef.current = touchEvent.touches[0]?.clientX ?? null;
              screenshotTouchCurrentXRef.current = screenshotTouchStartXRef.current;
            }}
            onTouchMove={(touchEvent) => {
              screenshotTouchCurrentXRef.current = touchEvent.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={() => {
              const startX = screenshotTouchStartXRef.current;
              const endX = screenshotTouchCurrentXRef.current;
              screenshotTouchStartXRef.current = null;
              screenshotTouchCurrentXRef.current = null;

              if (startX === null || endX === null) {
                return;
              }

              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 45) {
                return;
              }

              if (deltaX > 0) {
                navigateToPreviousScreenshot();
              } else {
                navigateToNextScreenshot();
              }
            }}
          >
            <button
              type="button"
              className={`${styles.screenshotLightboxControlButton} ${styles.screenshotLightboxCloseButton}`}
              onClick={() => setActiveScreenshotIndex(null)}
              aria-label="Close screenshot viewer"
            >
              Close
            </button>
            <button
              type="button"
              className={`${styles.screenshotLightboxControlButton} ${styles.screenshotLightboxPreviousButton}`}
              onClick={navigateToPreviousScreenshot}
              aria-label="Previous screenshot"
            >
              &larr;
            </button>
            <img
              src={normalizedScreenshotEntries[activeScreenshotIndex].fullSizeUrl}
              alt={`Screenshot ${activeScreenshotIndex + 1} from ${detailedVisualNovelData.title}`}
              className={styles.screenshotLightboxImage}
            />
            <button
              type="button"
              className={`${styles.screenshotLightboxControlButton} ${styles.screenshotLightboxNextButton}`}
              onClick={navigateToNextScreenshot}
              aria-label="Next screenshot"
            >
              &rarr;
            </button>
            <p className={styles.screenshotLightboxCounter}>
              {activeScreenshotIndex + 1} / {normalizedScreenshotEntries.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
