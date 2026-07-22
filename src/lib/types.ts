export type MediaType = "movie" | "series";
export type MediaHint = MediaType | "auto";

export interface PublicSettings {
  radarr: {
    url: string;
    hasApiKey: boolean;
    rootFolderPath: string;
    qualityProfileId: number | null;
    minimumAvailability: string;
    monitored: boolean;
    searchOnAdd: boolean;
  };
  sonarr: {
    url: string;
    hasApiKey: boolean;
    rootFolderPath: string;
    qualityProfileId: number | null;
    seriesType: string;
    monitor: string;
    seasonFolder: boolean;
    searchOnAdd: boolean;
  };
  discord: {
    applicationId: string;
    hasPublicKey: boolean;
    hasBotToken: boolean;
    guildId: string;
    allowedChannelIds: string;
    allowedRoleIds: string;
    configured: boolean;
    managedByEnvironment: boolean;
  };
}

export interface StoredSettings {
  radarrUrl: string;
  radarrApiKey: string;
  radarrRootFolderPath: string;
  radarrQualityProfileId: number | null;
  radarrMinimumAvailability: string;
  radarrMonitored: boolean;
  radarrSearchOnAdd: boolean;
  sonarrUrl: string;
  sonarrApiKey: string;
  sonarrRootFolderPath: string;
  sonarrQualityProfileId: number | null;
  sonarrSeriesType: string;
  sonarrMonitor: string;
  sonarrSeasonFolder: boolean;
  sonarrSearchOnAdd: boolean;
  discordApplicationId: string;
  discordPublicKey: string;
  discordBotToken: string;
  discordGuildId: string;
  discordAllowedChannelIds: string;
  discordAllowedRoleIds: string;
}

export interface ParsedListItem {
  id: string;
  original: string;
  query: string;
  year: number | null;
  hint: MediaHint;
}

export interface LookupCandidate {
  token: string;
  type: MediaType;
  title: string;
  year: number | null;
  overview: string;
  posterUrl: string | null;
  externalId: number;
  score: number;
  confidence: "high" | "medium" | "low";
  alreadyExists: boolean;
}

export interface LookupItemResult {
  item: ParsedListItem;
  candidates: LookupCandidate[];
  error: string | null;
}

export interface ArrOption {
  id: number;
  name: string;
}

export interface RootFolderOption {
  id: number;
  path: string;
  freeSpace?: number;
}

export interface ConnectionTestResult {
  service: "radarr" | "sonarr";
  version: string;
  apiVersion: "v3" | "v5";
  instanceName: string;
  qualityProfiles: ArrOption[];
  rootFolders: RootFolderOption[];
}
