import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { type VisualNovelDatabaseEntry } from '../types/apiTypes';
import styles from './VisualNovelList.module.css';

// We define a strict interface for the data crossing into this component boundary.
interface VisualNovelListItemProperties {
  visualNovelData: VisualNovelDatabaseEntry;
  onVisualNovelSelection: () => void;
  onVisualNovelPrefetch?: (visualNovelIdentifier: string) => void;
  onAddVisualNovelToUserList: (visualNovelIdentifier: string, labelIdentifier?: number) => Promise<void>;
  canAddToUserList: boolean;
  canEditExistingUserListEntry: boolean;
  isAlreadyInUserList: boolean;
  initialStatusLabelIdentifier: number;
  onMarkedAsAdded: (visualNovelIdentifier: string) => void;
  onUpdateUserListStatus: (visualNovelIdentifier: string, statusLabelIdentifier: number) => Promise<void>;
  itemIndex: number;
}

// This component isolates the presentation and state logic for a single list item.
// It ensures that unblurring one image does not trigger cascading state changes across the entire list.
export function VisualNovelListItem({
  visualNovelData,
  onVisualNovelSelection,
  onVisualNovelPrefetch,
  onAddVisualNovelToUserList,
  canAddToUserList,
  canEditExistingUserListEntry,
  isAlreadyInUserList,
  initialStatusLabelIdentifier,
  onMarkedAsAdded,
  onUpdateUserListStatus,
  itemIndex
}: VisualNovelListItemProperties) {
  const USER_LIST_STATUS_OPTIONS = [
    { id: 1, label: 'Playing' },
    { id: 2, label: 'Finished' },
    { id: 3, label: 'Stalled' },
    { id: 4, label: 'Dropped' },
    { id: 5, label: 'Wishlist' },
    { id: 6, label: 'Blacklist' }
  ];
  const [isImageExplicitlyRevealed, setIsImageExplicitlyRevealed] = useState<boolean>(false);
  const [isAddOperationInFlight, setIsAddOperationInFlight] = useState<boolean>(false);
  const [addOperationMessage, setAddOperationMessage] = useState<string | null>(null);
  const [selectedStatusLabelIdentifier, setSelectedStatusLabelIdentifier] = useState<number>(initialStatusLabelIdentifier);

  const hasExplicitContentFlag = visualNovelData.image && visualNovelData.image.sexual > 1.0;
  const requiresBlurFilter = hasExplicitContentFlag && !isImageExplicitlyRevealed;

  useEffect(() => {
    setSelectedStatusLabelIdentifier(initialStatusLabelIdentifier);
  }, [initialStatusLabelIdentifier, visualNovelData.id]);

  function handleImageRevealClick(clickEvent: MouseEvent<HTMLButtonElement>) {
    clickEvent.stopPropagation();
    setIsImageExplicitlyRevealed(true);
  }

  function handleOverlayRevealClick(clickEvent: MouseEvent<HTMLDivElement>) {
    clickEvent.stopPropagation();
    setIsImageExplicitlyRevealed(true);
  }

  // Separate handler so add action never bubbles and accidentally opens detail view.
  async function handleAddToUserListClick(clickEvent: MouseEvent<HTMLButtonElement>) {
    clickEvent.stopPropagation();
    setAddOperationMessage(null);
    setIsAddOperationInFlight(true);

    try {
      await onAddVisualNovelToUserList(visualNovelData.id, selectedStatusLabelIdentifier);
      const selectedStatusLabel = USER_LIST_STATUS_OPTIONS.find((statusOption) => statusOption.id === selectedStatusLabelIdentifier)?.label ?? 'Wishlist';
      setAddOperationMessage(`Added (${selectedStatusLabel})`);
      onMarkedAsAdded(visualNovelData.id);
    } catch (caughtError) {
      setAddOperationMessage(caughtError instanceof Error ? caughtError.message : 'Add failed');
    } finally {
      setIsAddOperationInFlight(false);
    }
  }

  async function handleUpdateUserListStatusClick(clickEvent: MouseEvent<HTMLButtonElement>) {
    clickEvent.stopPropagation();
    setAddOperationMessage(null);
    setIsAddOperationInFlight(true);

    try {
      await onUpdateUserListStatus(visualNovelData.id, selectedStatusLabelIdentifier);
      const selectedStatusLabel = USER_LIST_STATUS_OPTIONS.find((statusOption) => statusOption.id === selectedStatusLabelIdentifier)?.label ?? 'Updated';
      setAddOperationMessage(`Updated (${selectedStatusLabel})`);
    } catch (caughtError) {
      setAddOperationMessage(caughtError instanceof Error ? caughtError.message : 'Update failed');
    } finally {
      setIsAddOperationInFlight(false);
    }
  }

  return (
    <li
      className={styles.visualNovelListItem}
      style={{ '--stagger-index': itemIndex } as CSSProperties}
      role="button"
      tabIndex={0}
      onMouseEnter={() => onVisualNovelPrefetch?.(visualNovelData.id)}
      onFocus={() => onVisualNovelPrefetch?.(visualNovelData.id)}
      onTouchStart={() => onVisualNovelPrefetch?.(visualNovelData.id)}
      onClick={onVisualNovelSelection}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onVisualNovelSelection();
        }
      }}
    >
      <div className={styles.imageContainerWrapper}>
        <div className={styles.coverImageBoundary}>
          {visualNovelData.image && visualNovelData.image.thumbnail ? (
            <img 
              src={visualNovelData.image.thumbnail} 
              alt={`Cover art for ${visualNovelData.title}`} 
              className={`${styles.coverImageElement} ${requiresBlurFilter ? styles.explicitContentBlur : ''}`} 
            />
          ) : (
            <span className={styles.placeholderText}>No Image</span>
          )}
        </div>

        {/* If the image requires a blur, we render an overlay with an interactive reveal button */}
        {requiresBlurFilter && (
          <div className={styles.explicitContentOverlay} onClick={handleOverlayRevealClick}>
            <button 
              type="button"
              onClick={handleImageRevealClick}
              className={styles.revealContentButton}
              aria-label="Reveal explicit cover image"
            >
              Unblur
            </button>
          </div>
        )}

        <div className={styles.cardTextOverlay}>
          <p className={styles.novelTitleText}>{visualNovelData.title}</p>
          {visualNovelData.rating && <p className={styles.novelRatingText}>Rating: {visualNovelData.rating}</p>}
        </div>

        {/* Quick-add controls are intentionally compact/overlayed to preserve image-first browsing. */}
        {canAddToUserList && (
          <div className={styles.quickAddRow}>
            {(!isAlreadyInUserList || canEditExistingUserListEntry) && (
              <select
                className={styles.quickAddSelectField}
                value={selectedStatusLabelIdentifier}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                onChange={(changeEvent) => setSelectedStatusLabelIdentifier(Number(changeEvent.target.value))}
                disabled={isAddOperationInFlight}
              >
                {USER_LIST_STATUS_OPTIONS.map((statusOption) => (
                  <option key={statusOption.id} value={statusOption.id}>
                    {statusOption.label}
                  </option>
                ))}
              </select>
            )}
            {isAlreadyInUserList && canEditExistingUserListEntry ? (
              <button
                type="button"
                className={`${styles.quickAddButton} ${styles.quickAddButtonAdded}`}
                onClick={handleUpdateUserListStatusClick}
                disabled={isAddOperationInFlight}
              >
                {isAddOperationInFlight ? 'Saving...' : 'Save Status'}
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.quickAddButton} ${isAlreadyInUserList ? styles.quickAddButtonAdded : ''}`}
                onClick={handleAddToUserListClick}
                disabled={isAddOperationInFlight || isAlreadyInUserList}
              >
                {isAlreadyInUserList ? 'Already Added' : isAddOperationInFlight ? 'Adding...' : '+ My List'}
              </button>
            )}
            {addOperationMessage && <span className={styles.quickAddMessage}>{addOperationMessage}</span>}
          </div>
        )}
      </div>
    </li>
  );
}
