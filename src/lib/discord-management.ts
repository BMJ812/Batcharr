import { readDiscordConfig } from "@/lib/discord";

export interface DiscordManagementInput {
  applicationId?: unknown;
  botToken?: unknown;
  guildId?: unknown;
}

export interface ResolvedDiscordManagementConfig {
  applicationId: string;
  botToken: string;
  guildId: string;
}

export const BATCHARR_DISCORD_COMMANDS = [
  {
    name: "movie",
    description: "Find a movie through Batcharr",
    type: 1,
    dm_permission: false,
    options: [
      {
        name: "title",
        description: "Movie title, optionally including a year",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "show",
    description: "Find a television series through Batcharr",
    type: 1,
    dm_permission: false,
    options: [
      {
        name: "title",
        description: "Series title, optionally including a year",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "list",
    description: "Resolve a list of movies and television series",
    type: 1,
    dm_permission: false,
    options: [
      {
        name: "titles",
        description: "Titles separated by lines, commas, semicolons, or tabs",
        type: 3,
        required: true,
      },
    ],
  },
] as const;

function submittedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveDiscordManagementConfig(
  input: DiscordManagementInput,
): ResolvedDiscordManagementConfig {
  const stored = readDiscordConfig();

  return {
    applicationId:
      submittedString(input.applicationId) ||
      stored.applicationId,
    botToken:
      submittedString(input.botToken) ||
      stored.botToken,
    guildId:
      submittedString(input.guildId) ||
      stored.guildId,
  };
}

export function validateDiscordManagementConfig(
  config: ResolvedDiscordManagementConfig,
): string | null {
  if (!config.applicationId) {
    return "Discord Application ID is required.";
  }

  if (!config.botToken) {
    return "Discord bot token is required.";
  }

  if (!config.guildId) {
    return "Discord Guild ID is required.";
  }

  if (!/^\d+$/.test(config.applicationId)) {
    return "Discord Application ID must contain only numbers.";
  }

  if (!/^\d+$/.test(config.guildId)) {
    return "Discord Guild ID must contain only numbers.";
  }

  return null;
}

export async function discordApiRequest(
  path: string,
  botToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

interface DiscordErrorBody {
  message?: unknown;
  code?: unknown;
}

export async function discordErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response
    .json()
    .catch(() => null)) as DiscordErrorBody | null;

  const message =
    typeof body?.message === "string"
      ? body.message
      : fallback;

  const code =
    typeof body?.code === "number" ||
    typeof body?.code === "string"
      ? ` Discord code: ${body.code}.`
      : "";

  if (response.status === 401) {
    return "Discord rejected the bot token.";
  }

  if (response.status === 403) {
    return `Discord denied access. Confirm that the bot is installed in the server and has permission.${code}`;
  }

  if (response.status === 404) {
    return `Discord could not find the requested application or server.${code}`;
  }

  return `${message}${code}`;
}