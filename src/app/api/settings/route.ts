import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readPublicSettings, readSettings, updateSettings } from "@/lib/db";
import type { StoredSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export async function GET() {
  if (!(await isAuthenticated())) return unauthorized();
  return NextResponse.json(readPublicSettings());
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) return unauthorized();
  const body = (await request.json()) as Partial<StoredSettings> & {
    radarrApiKey?: string;
    sonarrApiKey?: string;
    tmdbAccessToken?: string;
    discordPublicKey?: string;
    discordBotToken?: string;
  };
  const current = readSettings();

  const input: Partial<StoredSettings> = {
    radarrUrl: typeof body.radarrUrl === "string" ? body.radarrUrl.trim().replace(/\/+$/, "") : current.radarrUrl,
    radarrApiKey: typeof body.radarrApiKey === "string" && body.radarrApiKey.trim() ? body.radarrApiKey.trim() : current.radarrApiKey,
    radarrRootFolderPath: typeof body.radarrRootFolderPath === "string" ? body.radarrRootFolderPath : current.radarrRootFolderPath,
    radarrQualityProfileId: typeof body.radarrQualityProfileId === "number" ? body.radarrQualityProfileId : current.radarrQualityProfileId,
    radarrMinimumAvailability: typeof body.radarrMinimumAvailability === "string" ? body.radarrMinimumAvailability : current.radarrMinimumAvailability,
    radarrMonitored: typeof body.radarrMonitored === "boolean" ? body.radarrMonitored : current.radarrMonitored,
    radarrSearchOnAdd: typeof body.radarrSearchOnAdd === "boolean" ? body.radarrSearchOnAdd : current.radarrSearchOnAdd,
    sonarrUrl: typeof body.sonarrUrl === "string" ? body.sonarrUrl.trim().replace(/\/+$/, "") : current.sonarrUrl,
    sonarrApiKey: typeof body.sonarrApiKey === "string" && body.sonarrApiKey.trim() ? body.sonarrApiKey.trim() : current.sonarrApiKey,
    sonarrRootFolderPath: typeof body.sonarrRootFolderPath === "string" ? body.sonarrRootFolderPath : current.sonarrRootFolderPath,
    sonarrQualityProfileId: typeof body.sonarrQualityProfileId === "number" ? body.sonarrQualityProfileId : current.sonarrQualityProfileId,
    sonarrSeriesType: typeof body.sonarrSeriesType === "string" ? body.sonarrSeriesType : current.sonarrSeriesType,
    sonarrMonitor: typeof body.sonarrMonitor === "string" ? body.sonarrMonitor : current.sonarrMonitor,
    sonarrSeasonFolder: typeof body.sonarrSeasonFolder === "boolean" ? body.sonarrSeasonFolder : current.sonarrSeasonFolder,
    sonarrSearchOnAdd: typeof body.sonarrSearchOnAdd === "boolean" ? body.sonarrSearchOnAdd : current.sonarrSearchOnAdd,
    tmdbAccessToken:
      typeof body.tmdbAccessToken === "string" &&
      body.tmdbAccessToken.trim()
        ? body.tmdbAccessToken.trim()
        : current.tmdbAccessToken,
    discordApplicationId:
      typeof body.discordApplicationId === "string"
        ? body.discordApplicationId.trim()
        : current.discordApplicationId,
    discordPublicKey:
      typeof body.discordPublicKey === "string" &&
      body.discordPublicKey.trim()
        ? body.discordPublicKey.trim()
        : current.discordPublicKey,
    discordBotToken:
      typeof body.discordBotToken === "string" &&
      body.discordBotToken.trim()
        ? body.discordBotToken.trim()
        : current.discordBotToken,
    discordGuildId:
      typeof body.discordGuildId === "string"
        ? body.discordGuildId.trim()
        : current.discordGuildId,
    discordAllowedChannelIds:
      typeof body.discordAllowedChannelIds === "string"
        ? body.discordAllowedChannelIds.trim()
        : current.discordAllowedChannelIds,
    discordAllowedRoleIds:
      typeof body.discordAllowedRoleIds === "string"
        ? body.discordAllowedRoleIds.trim()
        : current.discordAllowedRoleIds,
  };

  updateSettings(input);
  return NextResponse.json(readPublicSettings());
}
