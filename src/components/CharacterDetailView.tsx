import { useEffect, useMemo, useState } from 'react';
import {
  fetchCharacterDetailsById,
  fetchCharactersByTraitId,
  fetchTraitMetadataByIds,
  fetchVisualNovelEntries
} from '../api/visualNovelClient';
import { type CharacterDetailedEntry, type CharacterQueryResponse, type VisualNovelDatabaseEntry } from '../types/apiTypes';
import { renderVndbDescription } from '../utils/renderVndbDescription';
import styles from './VisualNovelList.module.css';

interface CharacterDetailViewProperties {
  characterIdentifier: string;
  onNavigateBack: () => void;
  onCharacterSelection: (characterIdentifier: string) => void;
  onVisualNovelSelection: (visualNovelIdentifier: string) => void;
}

export function CharacterDetailView({
  characterIdentifier,
  onNavigateBack,
  onCharacterSelection,
  onVisualNovelSelection
}: CharacterDetailViewProperties) {
  const [characterData, setCharacterData] = useState<CharacterDetailedEntry | null>(null);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(true);
  const [networkErrorMessage, setNetworkErrorMessage] = useState<string | null>(null);
  const [traitGroupByIdentifier, setTraitGroupByIdentifier] = useState<Record<string, string>>({});
  const [selectedTraitId, setSelectedTraitId] = useState<string | null>(null);
  const [isTraitLookupLoading, setIsTraitLookupLoading] = useState<boolean>(false);
  const [traitMatchedCharacters, setTraitMatchedCharacters] = useState<CharacterDetailedEntry[]>([]);
  const [traitMatchedVisualNovels, setTraitMatchedVisualNovels] = useState<VisualNovelDatabaseEntry[]>([]);

  useEffect(() => {
    let hasLifecycleBeenCancelled = false;
    setIsDataLoading(true);
    setNetworkErrorMessage(null);
    setCharacterData(null);
    setTraitGroupByIdentifier({});
    setSelectedTraitId(null);
    setTraitMatchedCharacters([]);
    setTraitMatchedVisualNovels([]);

    async function executeCharacterFetch() {
      try {
        const characterResponse: CharacterQueryResponse = await fetchCharacterDetailsById(characterIdentifier);
        const firstCharacterEntry = characterResponse.results[0];
        if (!firstCharacterEntry) {
          if (!hasLifecycleBeenCancelled) {
            setNetworkErrorMessage('No character found with that identifier.');
          }
          return;
        }

        if (!hasLifecycleBeenCancelled) {
          setCharacterData(firstCharacterEntry);
        }

        const traitIdentifiers = (firstCharacterEntry.traits ?? [])
          .map((traitEntry) => traitEntry.id)
          .filter((traitIdentifier): traitIdentifier is string => typeof traitIdentifier === 'string' && traitIdentifier.trim() !== '');
        if (traitIdentifiers.length === 0) {
          return;
        }

        const traitMetadataResponse = await fetchTraitMetadataByIds(traitIdentifiers);
        if (!hasLifecycleBeenCancelled) {
          setTraitGroupByIdentifier(
            Object.fromEntries(traitMetadataResponse.results.map((traitMetadataEntry) => [traitMetadataEntry.id, traitMetadataEntry.group_name ?? 'Other']))
          );
        }
      } catch (caughtError) {
        if (!hasLifecycleBeenCancelled) {
          setNetworkErrorMessage(caughtError instanceof Error ? caughtError.message : 'Unknown character lookup error.');
        }
      } finally {
        if (!hasLifecycleBeenCancelled) {
          setIsDataLoading(false);
        }
      }
    }

    executeCharacterFetch();
    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [characterIdentifier]);

  function normalizeTraitGroupLabel(rawGroupLabel: string) {
    const normalizedGroupLabel = rawGroupLabel.toLowerCase();
    if (normalizedGroupLabel.includes('hair')) return 'Hair';
    if (normalizedGroupLabel.includes('eye')) return 'Eyes';
    if (normalizedGroupLabel.includes('body')) return 'Body';
    if (normalizedGroupLabel.includes('cloth') || normalizedGroupLabel.includes('outfit')) return 'Clothes';
    if (normalizedGroupLabel.includes('personality')) return 'Personality';
    if (normalizedGroupLabel.includes('role')) return 'Role';
    if (normalizedGroupLabel.includes('engage')) return 'Engages In';
    if (normalizedGroupLabel.includes('subject')) return 'Subject Of';
    return 'Other';
  }

  const groupedCharacterTraits = useMemo(() => {
    const groupedTraits: Record<string, Array<{ id: string; name: string }>> = {
      Hair: [],
      Eyes: [],
      Body: [],
      Clothes: [],
      Personality: [],
      Role: [],
      'Engages In': [],
      'Subject Of': [],
      Other: []
    };

    (characterData?.traits ?? []).forEach((traitEntry) => {
      if (!traitEntry || typeof traitEntry.id !== 'string' || typeof traitEntry.name !== 'string') {
        return;
      }

      const traitGroupLabel = normalizeTraitGroupLabel(traitGroupByIdentifier[traitEntry.id] ?? 'Other');
      groupedTraits[traitGroupLabel] = groupedTraits[traitGroupLabel] ?? [];
      groupedTraits[traitGroupLabel].push({
        id: traitEntry.id,
        name: traitEntry.name
      });
    });

    return groupedTraits;
  }, [characterData, traitGroupByIdentifier]);

  async function handleTraitSelection(traitId: string) {
    setSelectedTraitId(traitId);
    setIsTraitLookupLoading(true);
    setTraitMatchedCharacters([]);
    setTraitMatchedVisualNovels([]);

    try {
      const traitCharacterResponse = await fetchCharactersByTraitId(traitId);
      const normalizedCharacters = traitCharacterResponse.results.filter(
        (characterEntry) => characterEntry && characterEntry.id && characterEntry.name
      );
      setTraitMatchedCharacters(normalizedCharacters);

      const visualNovelIdentifiers = [...new Set(
        normalizedCharacters
          .flatMap((characterEntry) => characterEntry.vns ?? [])
          .map((visualNovelEntry) => visualNovelEntry.id)
          .filter((visualNovelIdentifier): visualNovelIdentifier is string => typeof visualNovelIdentifier === 'string' && visualNovelIdentifier.trim() !== '')
          .map((visualNovelIdentifier) => visualNovelIdentifier.toLowerCase().startsWith('v') ? visualNovelIdentifier : `v${visualNovelIdentifier}`)
      )];

      if (visualNovelIdentifiers.length === 0) {
        setTraitMatchedVisualNovels([]);
        return;
      }

      const identifierFilter =
        visualNovelIdentifiers.length === 1
          ? ["id", "=", visualNovelIdentifiers[0]]
          : ["or", ...visualNovelIdentifiers.slice(0, 100).map((visualNovelIdentifier) => ["id", "=", visualNovelIdentifier])];
      const visualNovelLookupResponse = await fetchVisualNovelEntries({
        queryFilters: identifierFilter,
        requestedFields: "id, title, rating, image.thumbnail, image.sexual",
        maxResults: Math.min(100, visualNovelIdentifiers.length)
      });
      setTraitMatchedVisualNovels(visualNovelLookupResponse.results);
    } catch {
      setTraitMatchedCharacters([]);
      setTraitMatchedVisualNovels([]);
    } finally {
      setIsTraitLookupLoading(false);
    }
  }

  if (isDataLoading) {
    return <div className={styles.systemStatusMessage}>Loading character details...</div>;
  }

  if (networkErrorMessage || !characterData) {
    return (
      <div className={styles.interfaceContainerBoundary}>
        <button onClick={onNavigateBack} className={styles.searchExecutionButton}>&larr; Return</button>
        <div className={styles.systemErrorMessage}>System Error: {networkErrorMessage}</div>
      </div>
    );
  }

  const characterImageUrl = characterData.image?.url || characterData.image?.thumbnail;

  return (
    <div className={`${styles.interfaceContainerBoundary} ${styles.detailContentCentered}`}>
      <button
        onClick={onNavigateBack}
        className={styles.floatingBackButton}
        aria-label="Go back"
      >
        &larr;
      </button>
      <button onClick={onNavigateBack} className={`${styles.searchExecutionButton} ${styles.backToSearchButton}`}>
        &larr; Return
      </button>

      <h2 className={styles.detailTitleText}>{characterData.name}</h2>
      <p className={styles.listSubheadingText}>{characterData.original || ''}</p>

      <div className={styles.detailCoverSection}>
        {characterImageUrl ? (
          <img src={characterImageUrl} alt={`Character portrait for ${characterData.name}`} className={styles.detailCoverImage} />
        ) : (
          <div className={styles.detailNoImagePlaceholder}>No Image Available</div>
        )}
      </div>

      <div className={styles.detailDescriptionSection}>
        <h3 className={styles.sectionHeadingText}>Description</h3>
        {characterData.description ? (
          <div className={styles.detailDescriptionText}>{renderVndbDescription(characterData.description)}</div>
        ) : (
          <p>No character description provided.</p>
        )}
      </div>

      <div className={styles.detailTagSection}>
        <h3 className={styles.sectionHeadingText}>Traits</h3>
        {Object.entries(groupedCharacterTraits)
          .filter(([, traitEntries]) => traitEntries.length > 0)
          .map(([groupLabel, traitEntries]) => (
            <div key={groupLabel} className={styles.contributorGroupBoundary}>
              <h4 className={styles.contributorGroupTitle}>{groupLabel}</h4>
              <div className={styles.contributorChipRow}>
                {traitEntries.map((traitEntry) => (
                  <button
                    key={traitEntry.id}
                    type="button"
                    className={styles.contributorChipButton}
                    onClick={() => handleTraitSelection(traitEntry.id)}
                  >
                    {traitEntry.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className={styles.detailRelatedSection}>
        <h3 className={styles.sectionHeadingText}>Visual Novels</h3>
        {(characterData.vns ?? []).length > 0 ? (
          <ul className={styles.relatedVisualNovelList}>
            {(characterData.vns ?? []).map((visualNovelEntry) => (
              <li key={visualNovelEntry.id} className={styles.relatedVisualNovelListItem}>
                <button
                  type="button"
                  className={styles.relatedVisualNovelButton}
                  onClick={() => onVisualNovelSelection(visualNovelEntry.id)}
                >
                  <span className={styles.relatedVisualNovelRelationBadge}>{visualNovelEntry.role || 'Appears In'}</span>
                  <span className={styles.relatedVisualNovelTitleText}>{visualNovelEntry.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No linked visual novels available.</p>
        )}
      </div>

      {selectedTraitId && (
        <div className={styles.detailRelatedSection}>
          <h3 className={styles.sectionHeadingText}>Trait Matches</h3>
          {isTraitLookupLoading ? (
            <p>Loading trait matches...</p>
          ) : (
            <>
              <p className={styles.listSubheadingText}>Characters</p>
              {traitMatchedCharacters.length > 0 ? (
                <div className={styles.contributorChipRow}>
                  {traitMatchedCharacters.map((characterEntry) => (
                    <button
                      key={characterEntry.id}
                      type="button"
                      className={styles.contributorChipButton}
                      onClick={() => onCharacterSelection(characterEntry.id)}
                    >
                      {characterEntry.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p>No character matches.</p>
              )}

              <p className={styles.listSubheadingText}>Visual Novels</p>
              {traitMatchedVisualNovels.length > 0 ? (
                <ul className={styles.relatedVisualNovelList}>
                  {traitMatchedVisualNovels.map((visualNovelEntry) => (
                    <li key={visualNovelEntry.id} className={styles.relatedVisualNovelListItem}>
                      <button
                        type="button"
                        className={styles.relatedVisualNovelButton}
                        onClick={() => onVisualNovelSelection(visualNovelEntry.id)}
                      >
                        <span className={styles.relatedVisualNovelRelationBadge}>Match</span>
                        <span className={styles.relatedVisualNovelTitleText}>{visualNovelEntry.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No visual novel matches.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
