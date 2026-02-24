// This interface defines the expected input for our network boundary.
export interface QueryParameters {
  queryFilters: any[];
  requestedFields: string;
  maxResults: number;
  pageNumber?: number;
  sortField?: string;
  reverseSort?: boolean;
}

// This interface enforces a strict structural contract for the data returned by the VNDB API.
// We explicitly account for nullability, as a visual novel may not have received enough votes for a rating.
export interface VisualNovelDatabaseEntry {
  id: string;
  title: string;
  rating: number | null; 
  image: VisualNovelCoverImage | null; // The image object can be null if no cover exists
}

// This defines the top-level response envelope from the POST /vn endpoint.
export interface VisualNovelQueryResponse {
  results: VisualNovelDatabaseEntry[];
  more: boolean;
}

export interface VisualNovelAuthInfoResponse {
  id: string;
  username: string;
  permissions: string[];
}

// Define the nested image object returned by the API.
export interface VisualNovelCoverImage {
  id: string;
  url: string;
  thumbnail: string;
  sexual: number; // Represents the average image flagging vote for sexual content (0 to 2)
}

export interface VisualNovelRelationEntry {
  id: string;
  title: string;
  relation: string;
}

export interface VisualNovelTagEntry {
  id: string;
  name: string;
  spoiler?: number;
  rating?: number;
  category?: string;
}

export interface VisualNovelTagMetadataEntry {
  id: string;
  name: string;
  category: 'cont' | 'ero' | 'tech' | string;
}

export interface VisualNovelContributorEntry {
  id: string;
  name: string;
  role?: string;
}

export interface VisualNovelExternalLinkEntry {
  url: string;
  label: string;
  source?: string;
  releaseId?: string;
  releaseTitle?: string;
}

export interface VisualNovelCharacterEntry {
  id: string;
  name: string;
  original?: string | null;
  image?: VisualNovelCoverImage | null;
}

export interface CharacterTraitEntry {
  id: string;
  spoiler?: number;
  name?: string;
}

export interface CharacterVisualNovelLinkEntry {
  id: string;
  title: string;
  role?: string;
}

export interface CharacterDetailedEntry {
  id: string;
  name: string;
  original?: string | null;
  description?: string | null;
  image?: VisualNovelCoverImage | null;
  traits?: CharacterTraitEntry[] | null;
  vns?: CharacterVisualNovelLinkEntry[] | null;
}

export interface CharacterQueryResponse {
  results: CharacterDetailedEntry[];
  more: boolean;
}

export interface CharacterTraitMetadataEntry {
  id: string;
  name: string;
  group_name?: string;
}

export interface CharacterTraitQueryResponse {
  results: CharacterTraitMetadataEntry[];
  more: boolean;
}

// We define a separate interface for the detailed view to enforce the boundary 
// between lightweight list data and heavy detail data.
export interface VisualNovelDetailedEntry extends VisualNovelDatabaseEntry {
  description: string | null;
  released: string | null;
  tags: VisualNovelTagEntry[] | null;
  screenshots: VisualNovelCoverImage[] | null;
  relations: VisualNovelRelationEntry[] | null;
  developers: VisualNovelContributorEntry[] | null;
  characters?: VisualNovelCharacterEntry[] | null;
}

export interface VisualNovelDetailedQueryResponse {
  results: VisualNovelDetailedEntry[];
  more: boolean;
}

export interface VisualNovelTagQueryResponse {
  results: VisualNovelTagMetadataEntry[];
  more: boolean;
}

export interface UserVisualNovelListEntry {
  id: string;
  vn: VisualNovelDatabaseEntry;
}

export interface UserVisualNovelListResponse {
  results: UserVisualNovelListEntry[];
  more: boolean;
}
