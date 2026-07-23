import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { PublicSettings, StoredSettings } from "@/lib/types";

let database: DatabaseSync | null = null;

function ensureSettingsColumn(
  db: DatabaseSync,
  columnName: string,
  definition: string,
): void {
  const columns = db
    .prepare("PRAGMA table_info(settings)")
    .all() as unknown as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) return;

  db.exec(
    `ALTER TABLE settings ADD COLUMN ${columnName} ${definition}`,
  );
}

function configDirectory(): string {
  const preferred = process.env.BATCHARR_CONFIG_DIR?.trim();
  if (preferred) return preferred;
  return path.join(process.cwd(), "data");
}

function getDatabase(): DatabaseSync {
  if (database) return database;

  const directory = configDirectory();
  fs.mkdirSync(directory, { recursive: true });
  database = new DatabaseSync(path.join(directory, "batcharr.db"));
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      radarr_url TEXT NOT NULL DEFAULT '',
      radarr_api_key TEXT NOT NULL DEFAULT '',
      radarr_root_folder_path TEXT NOT NULL DEFAULT '',
      radarr_quality_profile_id INTEGER,
      radarr_minimum_availability TEXT NOT NULL DEFAULT 'released',
      radarr_monitored INTEGER NOT NULL DEFAULT 1,
      radarr_search_on_add INTEGER NOT NULL DEFAULT 1,
      sonarr_url TEXT NOT NULL DEFAULT '',
      sonarr_api_key TEXT NOT NULL DEFAULT '',
      sonarr_root_folder_path TEXT NOT NULL DEFAULT '',
      sonarr_quality_profile_id INTEGER,
      sonarr_series_type TEXT NOT NULL DEFAULT 'standard',
      sonarr_monitor TEXT NOT NULL DEFAULT 'all',
      sonarr_season_folder INTEGER NOT NULL DEFAULT 1,
      sonarr_search_on_add INTEGER NOT NULL DEFAULT 1,
      tmdb_access_token TEXT NOT NULL DEFAULT '',
      discord_application_id TEXT NOT NULL DEFAULT '',
      discord_public_key TEXT NOT NULL DEFAULT '',
      discord_bot_token TEXT NOT NULL DEFAULT '',
      discord_guild_id TEXT NOT NULL DEFAULT '',
      discord_allowed_channel_ids TEXT NOT NULL DEFAULT '',
      discord_allowed_role_ids TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS request_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      external_id INTEGER,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureSettingsColumn(
    database,
    "tmdb_access_token",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_application_id",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_public_key",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_bot_token",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_guild_id",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_allowed_channel_ids",
    "TEXT NOT NULL DEFAULT ''",
  );
  ensureSettingsColumn(
    database,
    "discord_allowed_role_ids",
    "TEXT NOT NULL DEFAULT ''",
  );

  return database;
}

interface SettingsRow {
  radarr_url: string;
  radarr_api_key: string;
  radarr_root_folder_path: string;
  radarr_quality_profile_id: number | null;
  radarr_minimum_availability: string;
  radarr_monitored: number;
  radarr_search_on_add: number;
  sonarr_url: string;
  sonarr_api_key: string;
  sonarr_root_folder_path: string;
  sonarr_quality_profile_id: number | null;
  sonarr_series_type: string;
  sonarr_monitor: string;
  sonarr_season_folder: number;
  sonarr_search_on_add: number;
  tmdb_access_token: string;
  discord_application_id: string;
  discord_public_key: string;
  discord_bot_token: string;
  discord_guild_id: string;
  discord_allowed_channel_ids: string;
  discord_allowed_role_ids: string;
}

export function readSettings(): StoredSettings {
  const row = getDatabase().prepare("SELECT * FROM settings WHERE id = 1").get() as unknown as SettingsRow;
  return {
    radarrUrl: row.radarr_url,
    radarrApiKey: decryptSecret(row.radarr_api_key),
    radarrRootFolderPath: row.radarr_root_folder_path,
    radarrQualityProfileId: row.radarr_quality_profile_id,
    radarrMinimumAvailability: row.radarr_minimum_availability,
    radarrMonitored: Boolean(row.radarr_monitored),
    radarrSearchOnAdd: Boolean(row.radarr_search_on_add),
    sonarrUrl: row.sonarr_url,
    sonarrApiKey: decryptSecret(row.sonarr_api_key),
    sonarrRootFolderPath: row.sonarr_root_folder_path,
    sonarrQualityProfileId: row.sonarr_quality_profile_id,
    sonarrSeriesType: row.sonarr_series_type,
    sonarrMonitor: row.sonarr_monitor,
    sonarrSeasonFolder: Boolean(row.sonarr_season_folder),
    sonarrSearchOnAdd: Boolean(row.sonarr_search_on_add),
    tmdbAccessToken: decryptSecret(row.tmdb_access_token),
    discordApplicationId: row.discord_application_id,
    discordPublicKey: decryptSecret(row.discord_public_key),
    discordBotToken: decryptSecret(row.discord_bot_token),
    discordGuildId: row.discord_guild_id,
    discordAllowedChannelIds: row.discord_allowed_channel_ids,
    discordAllowedRoleIds: row.discord_allowed_role_ids,
  };
}

export function readPublicSettings(): PublicSettings {
  const settings = readSettings();
  return {
    radarr: {
      url: settings.radarrUrl,
      hasApiKey: Boolean(settings.radarrApiKey),
      rootFolderPath: settings.radarrRootFolderPath,
      qualityProfileId: settings.radarrQualityProfileId,
      minimumAvailability: settings.radarrMinimumAvailability,
      monitored: settings.radarrMonitored,
      searchOnAdd: settings.radarrSearchOnAdd,
    },
    sonarr: {
      url: settings.sonarrUrl,
      hasApiKey: Boolean(settings.sonarrApiKey),
      rootFolderPath: settings.sonarrRootFolderPath,
      qualityProfileId: settings.sonarrQualityProfileId,
      seriesType: settings.sonarrSeriesType,
      monitor: settings.sonarrMonitor,
      seasonFolder: settings.sonarrSeasonFolder,
      searchOnAdd: settings.sonarrSearchOnAdd,
    },
    tmdb: {
      hasAccessToken: Boolean(
        process.env.TMDB_ACCESS_TOKEN?.trim() ||
        settings.tmdbAccessToken
      ),
      managedByEnvironment: Boolean(
        process.env.TMDB_ACCESS_TOKEN?.trim()
      ),
    },
    discord: {
      applicationId:
        process.env.DISCORD_APPLICATION_ID?.trim() ||
        settings.discordApplicationId,
      hasPublicKey: Boolean(
        process.env.DISCORD_PUBLIC_KEY?.trim() ||
        settings.discordPublicKey,
      ),
      hasBotToken: Boolean(
        process.env.DISCORD_BOT_TOKEN?.trim() ||
        settings.discordBotToken,
      ),
      guildId:
        process.env.DISCORD_GUILD_ID?.trim() ||
        settings.discordGuildId,
      allowedChannelIds:
        process.env.DISCORD_ALLOWED_CHANNEL_IDS?.trim() ||
        settings.discordAllowedChannelIds,
      allowedRoleIds:
        process.env.DISCORD_ALLOWED_ROLE_IDS?.trim() ||
        settings.discordAllowedRoleIds,
      configured: Boolean(
        (
          process.env.DISCORD_APPLICATION_ID?.trim() ||
          settings.discordApplicationId
        ) &&
        (
          process.env.DISCORD_PUBLIC_KEY?.trim() ||
          settings.discordPublicKey
        ) &&
        (
          process.env.DISCORD_BOT_TOKEN?.trim() ||
          settings.discordBotToken
        ) &&
        (
          process.env.DISCORD_GUILD_ID?.trim() ||
          settings.discordGuildId
        ),
      ),
      managedByEnvironment: Boolean(
        process.env.DISCORD_APPLICATION_ID?.trim() ||
        process.env.DISCORD_PUBLIC_KEY?.trim() ||
        process.env.DISCORD_BOT_TOKEN?.trim() ||
        process.env.DISCORD_GUILD_ID?.trim() ||
        process.env.DISCORD_ALLOWED_CHANNEL_IDS?.trim() ||
        process.env.DISCORD_ALLOWED_ROLE_IDS?.trim()
      ),
    },
  };
}

export function updateSettings(input: Partial<StoredSettings>): StoredSettings {
  const current = readSettings();
  const merged: StoredSettings = { ...current, ...input };

  getDatabase().prepare(`
    UPDATE settings SET
      radarr_url = ?,
      radarr_api_key = ?,
      radarr_root_folder_path = ?,
      radarr_quality_profile_id = ?,
      radarr_minimum_availability = ?,
      radarr_monitored = ?,
      radarr_search_on_add = ?,
      sonarr_url = ?,
      sonarr_api_key = ?,
      sonarr_root_folder_path = ?,
      sonarr_quality_profile_id = ?,
      sonarr_series_type = ?,
      sonarr_monitor = ?,
      sonarr_season_folder = ?,
      sonarr_search_on_add = ?,
      discord_application_id = ?,
      discord_public_key = ?,
      discord_bot_token = ?,
      discord_guild_id = ?,
      discord_allowed_channel_ids = ?,
      discord_allowed_role_ids = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    merged.radarrUrl,
    encryptSecret(merged.radarrApiKey),
    merged.radarrRootFolderPath,
    merged.radarrQualityProfileId,
    merged.radarrMinimumAvailability,
    Number(merged.radarrMonitored),
    Number(merged.radarrSearchOnAdd),
    merged.sonarrUrl,
    encryptSecret(merged.sonarrApiKey),
    merged.sonarrRootFolderPath,
    merged.sonarrQualityProfileId,
    merged.sonarrSeriesType,
    merged.sonarrMonitor,
    Number(merged.sonarrSeasonFolder),
    Number(merged.sonarrSearchOnAdd),
    encryptSecret(merged.tmdbAccessToken),
    merged.discordApplicationId,
    encryptSecret(merged.discordPublicKey),
    encryptSecret(merged.discordBotToken),
    merged.discordGuildId,
    merged.discordAllowedChannelIds,
    merged.discordAllowedRoleIds,
  );

  return merged;
}

export function addHistory(entry: {
  mediaType: string;
  title: string;
  year: number | null;
  externalId: number | null;
  status: string;
  message?: string;
}): void {
  getDatabase().prepare(`
    INSERT INTO request_history (media_type, title, year, external_id, status, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.mediaType,
    entry.title,
    entry.year,
    entry.externalId,
    entry.status,
    entry.message ?? "",
  );
}

export function listHistory(limit = 100): unknown[] {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  return getDatabase().prepare(`
    SELECT
      id,
      media_type AS mediaType,
      title,
      year,
      external_id AS externalId,
      status,
      message,
      created_at AS createdAt
    FROM request_history
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
}
