import React, { useEffect, useState } from 'react';
import { VisualNovelList } from './components/VisualNovelList';
import { VisualNovelDetailView } from './components/VisualNovelDetailView';
import {
  addVisualNovelToAuthenticatedUserList,
  fetchDatabaseStatistics,
  fetchAuthenticationInfoByToken,
  prefetchVisualNovelCoreDetailsById,
  updateAuthenticatedUserVisualNovelStatusLabel
} from './api/visualNovelClient';

interface TagSearchRequest {
  requestId: number;
  tagName: string;
  tagIdentifier?: string;
}

interface DeveloperSearchRequest {
  requestId: number;
  developerName: string;
  developerIdentifier?: string;
}

interface AuthenticatedSession {
  token: string;
  userId: string;
  username: string;
  permissions: string[];
}

interface DatabaseStatistics {
  visualNovels: number;
  tags: number;
  releases: number;
  producers: number;
  staff: number;
  characters: number;
  traits: number;
}

type ThemeIdentifier = 'midnight' | 'aurora' | 'sunset' | 'light' | 'crimson';
type NsfwCoverBlurMode = 'auto' | 'always' | 'never';
type DefaultTagSpoilerLevel = 0 | 1 | 2;
type DefaultListSortField = 'default' | 'title' | 'released' | 'rating' | 'votecount' | 'id';
type DefaultListSortDirection = 'asc' | 'desc';

interface UserDisplayPreferences {
  nsfwCoverBlurMode: NsfwCoverBlurMode;
  defaultTagSpoilerLevel: DefaultTagSpoilerLevel;
  rememberListSettings: boolean;
  defaultListSortField: DefaultListSortField;
  defaultListSortDirection: DefaultListSortDirection;
  defaultListOnlyWithScreenshots: boolean;
  defaultListOnlyWithDescription: boolean;
}

interface DetailViewErrorBoundaryProperties {
  children: React.ReactNode;
  onNavigateBack: () => void;
}

interface DetailViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class DetailViewErrorBoundary extends React.Component<DetailViewErrorBoundaryProperties, DetailViewErrorBoundaryState> {
  state: DetailViewErrorBoundaryState = {
    hasError: false,
    errorMessage: ''
  };

  static getDerivedStateFromError(caughtError: unknown): DetailViewErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: caughtError instanceof Error ? caughtError.message : 'Unknown detail render failure.'
    };
  }

  componentDidCatch(caughtError: unknown) {
    console.error('Detail view render failure:', caughtError);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="detail-error-panel">
          <h2 className="detail-error-title">Detail View Error</h2>
          <p className="detail-error-text">{this.state.errorMessage}</p>
          <button type="button" className="header-auth-button" onClick={this.props.onNavigateBack}>
            Return to Search
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

// The RootApplication manages the highest-level view state, dictating which "box" is currently active.
export default function RootApplication() {
  const AUTH_TOKEN_STORAGE_KEY = 'vndb_client_auth_token_v1';
  const ONBOARDING_COMPLETED_STORAGE_KEY = 'vndb_client_onboarding_completed_v1';
  const THEME_STORAGE_KEY = 'vndb_client_theme_v1';
  const DISPLAY_PREFERENCES_STORAGE_KEY = 'vndb_client_display_preferences_v1';
  const THEME_OPTIONS: Array<{ id: ThemeIdentifier; label: string }> = [
    { id: 'midnight', label: 'Midnight (Dark)' },
    { id: 'aurora', label: 'Aurora (Dark)' },
    { id: 'sunset', label: 'Sunset (Colorful)' },
    { id: 'light', label: 'Paper (Light)' },
    { id: 'crimson', label: 'Crimson (Black/Red)' }
  ];
  const DEFAULT_DISPLAY_PREFERENCES: UserDisplayPreferences = {
    nsfwCoverBlurMode: 'auto',
    defaultTagSpoilerLevel: 0,
    rememberListSettings: true,
    defaultListSortField: 'default',
    defaultListSortDirection: 'desc',
    defaultListOnlyWithScreenshots: false,
    defaultListOnlyWithDescription: false
  };
  const [activeVisualNovelIdentifier, setActiveVisualNovelIdentifier] = useState<string | null>(null);
  const [activeTagSearchRequest, setActiveTagSearchRequest] = useState<TagSearchRequest | null>(null);
  const [activeDeveloperSearchRequest, setActiveDeveloperSearchRequest] = useState<DeveloperSearchRequest | null>(null);
  const [isMenuPanelVisible, setIsMenuPanelVisible] = useState<boolean>(false);
  const [tokenInputValue, setTokenInputValue] = useState<string>('');
  const [authenticatedSession, setAuthenticatedSession] = useState<AuthenticatedSession | null>(null);
  const [isAuthenticationInFlight, setIsAuthenticationInFlight] = useState<boolean>(false);
  const [authenticationErrorMessage, setAuthenticationErrorMessage] = useState<string | null>(null);
  const [isOnboardingCheckComplete, setIsOnboardingCheckComplete] = useState<boolean>(false);
  const [isOnboardingRequired, setIsOnboardingRequired] = useState<boolean>(false);
  const [activeThemeIdentifier, setActiveThemeIdentifier] = useState<ThemeIdentifier>('midnight');
  const [userListRefreshToken, setUserListRefreshToken] = useState<number>(0);
  const [homeNavigationRequestToken, setHomeNavigationRequestToken] = useState<number>(0);
  const [isLogoutConfirmationVisible, setIsLogoutConfirmationVisible] = useState<boolean>(false);
  const [databaseStatistics, setDatabaseStatistics] = useState<DatabaseStatistics | null>(null);
  const [isDatabaseStatisticsLoading, setIsDatabaseStatisticsLoading] = useState<boolean>(false);
  const [databaseStatisticsErrorMessage, setDatabaseStatisticsErrorMessage] = useState<string | null>(null);
  const [isBackToTopButtonVisible, setIsBackToTopButtonVisible] = useState<boolean>(false);
  const [displayPreferences, setDisplayPreferences] = useState<UserDisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);

  function completeOnboarding() {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
    setIsOnboardingRequired(false);
  }

  async function applyAuthenticationToken(authenticationToken: string): Promise<boolean> {
    setIsAuthenticationInFlight(true);
    setAuthenticationErrorMessage(null);

    try {
      const authenticationInfo = await fetchAuthenticationInfoByToken(authenticationToken);
      setAuthenticatedSession({
        token: authenticationToken,
        userId: authenticationInfo.id,
        username: authenticationInfo.username,
        permissions: authenticationInfo.permissions
      });
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authenticationToken);
      setIsMenuPanelVisible(false);
      setTokenInputValue('');
      return true;
    } catch (caughtError) {
      setAuthenticatedSession(null);
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      setAuthenticationErrorMessage(
        caughtError instanceof Error ? caughtError.message : 'Unable to validate authentication token.'
      );
      return false;
    } finally {
      setIsAuthenticationInFlight(false);
    }
  }

  // Keep browser history in sync with list/detail view so native back gestures behave consistently.
  useEffect(() => {
    const existingHistoryState = window.history.state as { view?: string } | null;
    if (!existingHistoryState || existingHistoryState.view !== 'list') {
      window.history.replaceState({ view: 'list' }, '');
    }

    function handleHistoryPopState(popStateEvent: PopStateEvent) {
      const navigationState = popStateEvent.state as {
        view?: 'list' | 'detail';
        visualNovelIdentifier?: string;
      } | null;

      if (navigationState?.view === 'detail' && navigationState.visualNovelIdentifier) {
        setActiveVisualNovelIdentifier(navigationState.visualNovelIdentifier);
      } else {
        setActiveVisualNovelIdentifier(null);
      }
    }

    window.addEventListener('popstate', handleHistoryPopState);
    return () => {
      window.removeEventListener('popstate', handleHistoryPopState);
    };
  }, []);

  // Boot-time auth restore: reuse saved token when present, otherwise show onboarding once.
  useEffect(() => {
    const hasOnboardingBeenCompleted = window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) === 'true';
    const storedAuthenticationToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (storedAuthenticationToken) {
      applyAuthenticationToken(storedAuthenticationToken);
      setIsOnboardingRequired(false);
    } else {
      setIsOnboardingRequired(!hasOnboardingBeenCompleted);
    }

    setIsOnboardingCheckComplete(true);
  }, []);

  useEffect(() => {
    const storedThemeIdentifier = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (
      storedThemeIdentifier === 'midnight' ||
      storedThemeIdentifier === 'aurora' ||
      storedThemeIdentifier === 'sunset' ||
      storedThemeIdentifier === 'light' ||
      storedThemeIdentifier === 'crimson'
    ) {
      setActiveThemeIdentifier(storedThemeIdentifier);
    }
  }, []);

  useEffect(() => {
    try {
      const storedDisplayPreferences = window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
      if (!storedDisplayPreferences) {
        return;
      }

      const parsedDisplayPreferences = JSON.parse(storedDisplayPreferences) as Partial<UserDisplayPreferences>;
      setDisplayPreferences({
        nsfwCoverBlurMode:
          parsedDisplayPreferences.nsfwCoverBlurMode === 'always' ||
          parsedDisplayPreferences.nsfwCoverBlurMode === 'never'
            ? parsedDisplayPreferences.nsfwCoverBlurMode
            : 'auto',
        defaultTagSpoilerLevel:
          parsedDisplayPreferences.defaultTagSpoilerLevel === 1 || parsedDisplayPreferences.defaultTagSpoilerLevel === 2
            ? parsedDisplayPreferences.defaultTagSpoilerLevel
            : 0,
        rememberListSettings: parsedDisplayPreferences.rememberListSettings !== false,
        defaultListSortField:
          parsedDisplayPreferences.defaultListSortField === 'title' ||
          parsedDisplayPreferences.defaultListSortField === 'released' ||
          parsedDisplayPreferences.defaultListSortField === 'rating' ||
          parsedDisplayPreferences.defaultListSortField === 'votecount' ||
          parsedDisplayPreferences.defaultListSortField === 'id'
            ? parsedDisplayPreferences.defaultListSortField
            : 'default',
        defaultListSortDirection: parsedDisplayPreferences.defaultListSortDirection === 'asc' ? 'asc' : 'desc',
        defaultListOnlyWithScreenshots: Boolean(parsedDisplayPreferences.defaultListOnlyWithScreenshots),
        defaultListOnlyWithDescription: Boolean(parsedDisplayPreferences.defaultListOnlyWithDescription)
      });
    } catch {
      setDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeThemeIdentifier);
    window.localStorage.setItem(THEME_STORAGE_KEY, activeThemeIdentifier);
  }, [activeThemeIdentifier]);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(displayPreferences));
  }, [displayPreferences]);

  useEffect(() => {
    if (!isMenuPanelVisible || databaseStatistics) {
      return;
    }

    let hasLifecycleBeenCancelled = false;
    setIsDatabaseStatisticsLoading(true);
    setDatabaseStatisticsErrorMessage(null);

    fetchDatabaseStatistics()
      .then((statisticsPayload) => {
        if (!hasLifecycleBeenCancelled) {
          setDatabaseStatistics(statisticsPayload);
        }
      })
      .catch((caughtError) => {
        if (!hasLifecycleBeenCancelled) {
          setDatabaseStatisticsErrorMessage(
            caughtError instanceof Error ? caughtError.message : 'Unable to retrieve VNDB statistics.'
          );
        }
      })
      .finally(() => {
        if (!hasLifecycleBeenCancelled) {
          setIsDatabaseStatisticsLoading(false);
        }
      });

    return () => {
      hasLifecycleBeenCancelled = true;
    };
  }, [isMenuPanelVisible, databaseStatistics]);

  // Detect coarse-pointer/mobile vs desktop and current orientation for responsive layout tuning.
  useEffect(() => {
    function updateViewportClassifications() {
      const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isLandscapeOrientation = window.matchMedia('(orientation: landscape)').matches;
      const isMobileLikeViewport = hasCoarsePointer || window.innerWidth < 900;
      document.documentElement.setAttribute('data-device', isMobileLikeViewport ? 'mobile' : 'desktop');
      document.documentElement.setAttribute('data-orientation', isLandscapeOrientation ? 'landscape' : 'portrait');
    }

    updateViewportClassifications();
    window.addEventListener('resize', updateViewportClassifications);
    window.addEventListener('orientationchange', updateViewportClassifications);
    return () => {
      window.removeEventListener('resize', updateViewportClassifications);
      window.removeEventListener('orientationchange', updateViewportClassifications);
    };
  }, []);

  useEffect(() => {
    function handleWindowScroll() {
      setIsBackToTopButtonVisible(window.scrollY > 520);
    }

    handleWindowScroll();
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, []);

  function handleNavigateToDetailView(visualNovelIdentifier: string) {
    setActiveVisualNovelIdentifier(visualNovelIdentifier);
    window.history.pushState({ view: 'detail', visualNovelIdentifier }, '');
  }

  function handleVisualNovelPrefetch(visualNovelIdentifier: string) {
    void prefetchVisualNovelCoreDetailsById(visualNovelIdentifier);
  }

  function handleNavigateToListView() {
    const currentHistoryState = window.history.state as { view?: string } | null;
    if (currentHistoryState?.view === 'detail') {
      window.history.back();
      return;
    }

    setActiveVisualNovelIdentifier(null);
  }

  function handleNavigateToHome() {
    setActiveTagSearchRequest(null);
    setActiveDeveloperSearchRequest(null);
    setHomeNavigationRequestToken((currentToken) => currentToken + 1);
    handleNavigateToListView();
  }

  function handleTagSelection(tagName: string, tagIdentifier?: string) {
    // Tag/developer navigation always returns to list and triggers a new list query context.
    handleNavigateToListView();
    setActiveTagSearchRequest({
      requestId: Date.now(),
      tagName,
      tagIdentifier
    });
  }

  function handleDeveloperSelection(developerName: string, developerIdentifier?: string) {
    handleNavigateToListView();
    setActiveDeveloperSearchRequest({
      requestId: Date.now(),
      developerName,
      developerIdentifier
    });
  }

  function handleAuthenticationFormSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (tokenInputValue.trim() === '') {
      setAuthenticationErrorMessage('Please enter a VNDB API token.');
      return;
    }

    applyAuthenticationToken(tokenInputValue.trim());
  }

  async function handleOnboardingTokenSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (tokenInputValue.trim() === '') {
      setAuthenticationErrorMessage('Please enter a VNDB API token.');
      return;
    }

    const hasAuthenticationSucceeded = await applyAuthenticationToken(tokenInputValue.trim());
    if (hasAuthenticationSucceeded) {
      completeOnboarding();
    }
  }

  function handleOnboardingSkip() {
    setAuthenticationErrorMessage(null);
    completeOnboarding();
  }

  function handleLogout() {
    setIsLogoutConfirmationVisible(true);
  }

  function handleConfirmLogout() {
    setIsLogoutConfirmationVisible(false);

    setAuthenticatedSession(null);
    setAuthenticationErrorMessage(null);
    setTokenInputValue('');
    setIsMenuPanelVisible(false);
    setIsOnboardingRequired(true);
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY);
    handleNavigateToListView();
  }

  function handleCancelLogout() {
    setIsLogoutConfirmationVisible(false);
  }

  async function handleAddVisualNovelToUserList(visualNovelIdentifier: string, labelIdentifier = 5) {
    // Write operations are centralized here so list/detail UIs share one permission gate.
    if (!authenticatedSession) {
      throw new Error('Authentication required to add visual novels to your list.');
    }

    if (!authenticatedSession.permissions.includes('listwrite')) {
      throw new Error('Your token does not include `listwrite` permission.');
    }

    await addVisualNovelToAuthenticatedUserList(authenticatedSession.token, visualNovelIdentifier, labelIdentifier);
  }

  async function handleUpdateVisualNovelUserListStatus(visualNovelIdentifier: string, statusLabelIdentifier: number) {
    if (!authenticatedSession) {
      throw new Error('Authentication required to update visual novel status.');
    }

    if (!authenticatedSession.permissions.includes('listwrite')) {
      throw new Error('Your token does not include `listwrite` permission.');
    }

    await updateAuthenticatedUserVisualNovelStatusLabel(authenticatedSession.token, visualNovelIdentifier, statusLabelIdentifier);
  }

  function handleUserListRefreshRequest() {
    setUserListRefreshToken((currentToken) => currentToken + 1);
  }

  if (!isOnboardingCheckComplete) {
    return null;
  }

  if (isOnboardingRequired) {
    return (
      <main className="application-container">
        <section className="onboarding-screen-boundary">
          <h1 className="onboarding-title-text">Connect Your VNDB Account</h1>
          <p className="onboarding-body-text">
            VNDB API v2 uses API token authentication. Add your token to unlock your personal visual novel list.
          </p>
          <form onSubmit={handleOnboardingTokenSubmit} className="login-form-boundary">
            <label htmlFor="onboarding-vndb-api-token" className="login-label-text">VNDB API Token</label>
            <input
              id="onboarding-vndb-api-token"
              type="password"
              className="login-token-input"
              value={tokenInputValue}
              onChange={(changeEvent) => setTokenInputValue(changeEvent.target.value)}
              placeholder="Paste your token from vndb.org settings"
              autoComplete="off"
            />
            <div className="onboarding-action-row">
              <button type="submit" className="header-auth-button" disabled={isAuthenticationInFlight}>
                {isAuthenticationInFlight ? 'Checking...' : 'Continue with Token'}
              </button>
              <button type="button" className="onboarding-skip-button" onClick={handleOnboardingSkip}>
                Skip for Now
              </button>
            </div>
          </form>
          {authenticationErrorMessage && <p className="login-error-text">{authenticationErrorMessage}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="application-container">
      <div className="minimal-topbar">
        <button
          type="button"
          className={`menu-toggle-button ${isMenuPanelVisible ? 'is-hidden' : ''}`}
          aria-label="Open app menu"
          aria-expanded={isMenuPanelVisible}
          onClick={() => setIsMenuPanelVisible((currentVisibility) => !currentVisibility)}
        >
          Menu
        </button>
      </div>

      {isMenuPanelVisible && (
        <div className="menu-overlay-layer" onClick={() => setIsMenuPanelVisible(false)} aria-hidden />
      )}

      <aside className={`menu-drawer-panel ${isMenuPanelVisible ? 'is-open' : ''}`} aria-hidden={!isMenuPanelVisible}>
        <div className="menu-drawer-header">
          <h2 className="menu-drawer-title">Account</h2>
          <button type="button" className="menu-close-button" onClick={() => setIsMenuPanelVisible(false)}>
            Close
          </button>
        </div>

        <div className="theme-settings-panel">
          <p className="theme-settings-title">Theme</p>
          <div className="theme-chip-row">
            {THEME_OPTIONS.map((themeOption) => (
              <button
                key={themeOption.id}
                type="button"
                className={`theme-chip-button ${activeThemeIdentifier === themeOption.id ? 'is-active' : ''}`}
                onClick={() => setActiveThemeIdentifier(themeOption.id)}
              >
                {themeOption.label}
              </button>
            ))}
          </div>
        </div>

        <div className="theme-settings-panel">
          <p className="theme-settings-title">Preferences</p>
          <div className="preferences-grid">
            <label className="preferences-label">
              NSFW Cover Blur
              <select
                className="preferences-select"
                value={displayPreferences.nsfwCoverBlurMode}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  nsfwCoverBlurMode: changeEvent.target.value as NsfwCoverBlurMode
                }))}
              >
                <option value="auto">Blur explicit, tap to reveal</option>
                <option value="always">Always blur explicit</option>
                <option value="never">Never blur explicit</option>
              </select>
            </label>

            <label className="preferences-label">
              Default Tag Spoilers
              <select
                className="preferences-select"
                value={displayPreferences.defaultTagSpoilerLevel}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  defaultTagSpoilerLevel: Number(changeEvent.target.value) as DefaultTagSpoilerLevel
                }))}
              >
                <option value={0}>Hide spoilers</option>
                <option value={1}>Show minor spoilers</option>
                <option value={2}>Show all spoilers</option>
              </select>
            </label>

            <label className="preferences-label">
              Default Sort Field
              <select
                className="preferences-select"
                value={displayPreferences.defaultListSortField}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  defaultListSortField: changeEvent.target.value as DefaultListSortField
                }))}
              >
                <option value="default">Default (Relevance)</option>
                <option value="title">Title</option>
                <option value="released">Release Date</option>
                <option value="rating">Rating</option>
                <option value="votecount">Vote Count</option>
                <option value="id">ID</option>
              </select>
            </label>

            <label className="preferences-label">
              Default Sort Direction
              <select
                className="preferences-select"
                value={displayPreferences.defaultListSortDirection}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  defaultListSortDirection: changeEvent.target.value as DefaultListSortDirection
                }))}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>

            <label className="preferences-checkbox-label">
              <input
                type="checkbox"
                checked={displayPreferences.defaultListOnlyWithScreenshots}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  defaultListOnlyWithScreenshots: changeEvent.target.checked
                }))}
              />
              Default filter: only with screenshots
            </label>

            <label className="preferences-checkbox-label">
              <input
                type="checkbox"
                checked={displayPreferences.defaultListOnlyWithDescription}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  defaultListOnlyWithDescription: changeEvent.target.checked
                }))}
              />
              Default filter: only with descriptions
            </label>

            <label className="preferences-checkbox-label">
              <input
                type="checkbox"
                checked={displayPreferences.rememberListSettings}
                onChange={(changeEvent) => setDisplayPreferences((currentPreferences) => ({
                  ...currentPreferences,
                  rememberListSettings: changeEvent.target.checked
                }))}
              />
              Remember last sort/filter after changes
            </label>
          </div>
        </div>

        <p className="menu-drawer-note">VNDB API v2 uses API tokens for authentication.</p>

        <section className="menu-stats-panel">
          <h3 className="menu-stats-title">VNDB Database Stats</h3>
          {isDatabaseStatisticsLoading && <p className="menu-stats-status">Loading statistics...</p>}
          {databaseStatisticsErrorMessage && <p className="menu-stats-error">{databaseStatisticsErrorMessage}</p>}
          {databaseStatistics && (
            <ul className="menu-stats-list">
              <li><span>Visual novels</span><strong>{databaseStatistics.visualNovels.toLocaleString()}</strong></li>
              <li><span>Tags</span><strong>{databaseStatistics.tags.toLocaleString()}</strong></li>
              <li><span>Releases</span><strong>{databaseStatistics.releases.toLocaleString()}</strong></li>
              <li><span>Producers</span><strong>{databaseStatistics.producers.toLocaleString()}</strong></li>
              <li><span>Staff</span><strong>{databaseStatistics.staff.toLocaleString()}</strong></li>
              <li><span>Characters</span><strong>{databaseStatistics.characters.toLocaleString()}</strong></li>
              <li><span>Traits</span><strong>{databaseStatistics.traits.toLocaleString()}</strong></li>
            </ul>
          )}
        </section>

        {authenticatedSession ? (
          <div className="menu-auth-block">
            <p className="auth-status-text">Logged in as @{authenticatedSession.username}</p>
            <button type="button" className="header-auth-button" onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <section className="login-panel-boundary">
            <form onSubmit={handleAuthenticationFormSubmit} className="login-form-boundary">
              <label htmlFor="vndb-api-token" className="login-label-text">VNDB API Token</label>
              <input
                id="vndb-api-token"
                type="password"
                className="login-token-input"
                value={tokenInputValue}
                onChange={(changeEvent) => setTokenInputValue(changeEvent.target.value)}
                placeholder="Paste your token from vndb.org settings"
                autoComplete="off"
              />
              <button type="submit" className="header-auth-button" disabled={isAuthenticationInFlight}>
                {isAuthenticationInFlight ? 'Checking...' : 'Validate Token'}
              </button>
            </form>
            {authenticationErrorMessage && <p className="login-error-text">{authenticationErrorMessage}</p>}
          </section>
        )}
      </aside>
      
      <section className="data-presentation-layer">
        <div className={`view-pane ${activeVisualNovelIdentifier === null ? 'is-visible' : 'is-hidden'}`} aria-hidden={activeVisualNovelIdentifier !== null}>
          <VisualNovelList
            onVisualNovelSelection={handleNavigateToDetailView}
            onVisualNovelPrefetch={handleVisualNovelPrefetch}
            homeNavigationRequestToken={homeNavigationRequestToken}
            tagSearchRequest={activeTagSearchRequest}
            developerSearchRequest={activeDeveloperSearchRequest}
            authenticatedSession={authenticatedSession}
            onAddVisualNovelToUserList={handleAddVisualNovelToUserList}
            onUpdateVisualNovelUserListStatus={handleUpdateVisualNovelUserListStatus}
            userListRefreshToken={userListRefreshToken}
            nsfwCoverBlurMode={displayPreferences.nsfwCoverBlurMode}
            rememberListSettings={displayPreferences.rememberListSettings}
            defaultListSortField={displayPreferences.defaultListSortField}
            defaultListSortDirection={displayPreferences.defaultListSortDirection}
            defaultListOnlyWithScreenshots={displayPreferences.defaultListOnlyWithScreenshots}
            defaultListOnlyWithDescription={displayPreferences.defaultListOnlyWithDescription}
          />
        </div>

        {activeVisualNovelIdentifier !== null && (
          <div className="view-pane is-visible">
            <DetailViewErrorBoundary
              key={activeVisualNovelIdentifier}
              onNavigateBack={handleNavigateToListView}
            >
              <VisualNovelDetailView
                visualNovelIdentifier={activeVisualNovelIdentifier}
                onNavigateBack={handleNavigateToListView}
                onNavigateHome={handleNavigateToHome}
                onTagSelection={handleTagSelection}
                onRelatedVisualNovelSelection={handleNavigateToDetailView}
                onDeveloperSelection={handleDeveloperSelection}
                authenticatedSession={authenticatedSession}
                onAddVisualNovelToUserList={handleAddVisualNovelToUserList}
                onUserListRefreshRequested={handleUserListRefreshRequest}
                defaultTagSpoilerLevel={displayPreferences.defaultTagSpoilerLevel}
              />
            </DetailViewErrorBoundary>
          </div>
        )}
      </section>

      {isLogoutConfirmationVisible && (
        <div className="modal-overlay-layer" onClick={handleCancelLogout}>
          <section className="confirmation-modal-panel" onClick={(clickEvent) => clickEvent.stopPropagation()}>
            <h3 className="confirmation-modal-title">Confirm Logout</h3>
            <p className="confirmation-modal-text">Log out of your VNDB account and return to login?</p>
            <div className="confirmation-modal-actions">
              <button type="button" className="onboarding-skip-button" onClick={handleCancelLogout}>
                Cancel
              </button>
              <button type="button" className="header-auth-button" onClick={handleConfirmLogout}>
                Logout
              </button>
            </div>
          </section>
        </div>
      )}

      {isBackToTopButtonVisible && (
        <button
          type="button"
          className="back-to-top-button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          ↑ Top
        </button>
      )}
    </main>
  );
}
