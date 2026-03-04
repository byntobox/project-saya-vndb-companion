import { useEffect, useState } from 'react';
import { fetchTagEntries } from '../api/visualNovelClient';
import { type VisualNovelTagMetadataEntry } from '../types/apiTypes';
import styles from './TagExplorer.module.css';

interface TagExplorerProperties {
  onBackToSearch: () => void;
  onTagSelection: (tagName: string, tagIdentifier: string) => void;
}

export function TagExplorer({ onBackToSearch, onTagSelection }: TagExplorerProperties) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [networkErrorMessage, setNetworkErrorMessage] = useState<string | null>(null);
  const [tagEntries, setTagEntries] = useState<VisualNovelTagMetadataEntry[]>([]);
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(1);
  const [hasAdditionalResults, setHasAdditionalResults] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  useEffect(() => {
    const debounceTimeout = window.setTimeout(() => {
      setAppliedSearchTerm(searchTerm.trim());
      setCurrentPageNumber(1);
    }, 280);

    return () => window.clearTimeout(debounceTimeout);
  }, [searchTerm]);

  useEffect(() => {
    let hasLifecycleBeenCancelled = false;
    setIsLoading(true);
    setNetworkErrorMessage(null);

    fetchTagEntries(appliedSearchTerm, 1, 50)
      .then((responsePayload) => {
        if (hasLifecycleBeenCancelled) {
          return;
        }
        setTagEntries(responsePayload.results ?? []);
        setHasAdditionalResults(Boolean(responsePayload.more));
      })
      .catch((caughtError) => {
        if (hasLifecycleBeenCancelled) {
          return;
        }
        setNetworkErrorMessage(caughtError instanceof Error ? caughtError.message : 'Unable to load tags.');
      })
      .finally(() => {
        if (!hasLifecycleBeenCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [appliedSearchTerm]);

  async function handleLoadMore() {
    if (isLoadingMore || !hasAdditionalResults) {
      return;
    }

    setIsLoadingMore(true);
    setNetworkErrorMessage(null);
    const nextPageNumber = currentPageNumber + 1;

    try {
      const responsePayload = await fetchTagEntries(appliedSearchTerm, nextPageNumber, 50);
      setTagEntries((currentEntries) => [...currentEntries, ...(responsePayload.results ?? [])]);
      setCurrentPageNumber(nextPageNumber);
      setHasAdditionalResults(Boolean(responsePayload.more));
    } catch (caughtError) {
      setNetworkErrorMessage(caughtError instanceof Error ? caughtError.message : 'Unable to load additional tags.');
    } finally {
      setIsLoadingMore(false);
    }
  }

  function normalizeCategoryLabel(categoryIdentifier: string | undefined) {
    const normalizedValue = (categoryIdentifier ?? '').toLowerCase();
    if (normalizedValue === 'cont') return 'Content';
    if (normalizedValue === 'ero') return 'Sexual';
    if (normalizedValue === 'tech') return 'Technical';
    return 'Other';
  }

  return (
    <section className={styles.containerBoundary}>
      <div className={styles.headerRow}>
        <button type="button" className={styles.backButton} onClick={onBackToSearch}>
          ← Return to Search
        </button>
        <h2 className={styles.headingText}>Browse VNDB Tags</h2>
      </div>

      <p className={styles.subheadingText}>
        Search tags, then tap one to load matching visual novels.
      </p>

      <input
        type="text"
        className={styles.searchInput}
        value={searchTerm}
        onChange={(changeEvent) => setSearchTerm(changeEvent.target.value)}
        placeholder="Search tags (e.g., romance, nakige, mystery)"
        aria-label="Search VNDB tags"
      />

      {isLoading && <p className={styles.statusText}>Loading tags...</p>}
      {networkErrorMessage && <p className={styles.errorText}>System Error: {networkErrorMessage}</p>}

      {!isLoading && !networkErrorMessage && (
        <>
          <p className={styles.resultSummaryText}>
            {tagEntries.length} tag{tagEntries.length === 1 ? '' : 's'} loaded
          </p>
          <ul className={styles.tagList}>
            {tagEntries.map((tagEntry) => (
              <li key={tagEntry.id} className={styles.tagListItem}>
                <button
                  type="button"
                  className={styles.tagButton}
                  onClick={() => onTagSelection(tagEntry.name, tagEntry.id)}
                >
                  <div className={styles.tagButtonHeader}>
                    <span className={styles.tagNameText}>{tagEntry.name}</span>
                    <span className={styles.tagMetaText}>{normalizeCategoryLabel(tagEntry.category)}</span>
                  </div>
                  <div className={styles.tagButtonFooter}>
                    <span className={styles.tagIdentifierText}>{tagEntry.id}</span>
                    <span className={styles.tagMetaText}>{(tagEntry.vn_count ?? 0).toLocaleString()} VNs</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {hasAdditionalResults && (
            <div className={styles.loadMoreRow}>
              <button type="button" className={styles.loadMoreButton} onClick={handleLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? 'Loading...' : 'Load More Tags'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
