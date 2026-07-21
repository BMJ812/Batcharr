import { verifyKey } from "discord-interactions";

export interface DiscordConfig {
  applicationId: string;
  publicKey: string;
  botToken: string;
  guildId: string;
  allowedChannelIds: Set<string>;
  allowedRoleIds: Set<string>;
}

function parseIdSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function readDiscordConfig(): DiscordConfig {
  return {
    applicationId: process.env.DISCORD_APPLICATION_ID?.trim() ?? "",
    publicKey: process.env.DISCORD_PUBLIC_KEY?.trim() ?? "",
    botToken: process.env.DISCORD_BOT_TOKEN?.trim() ?? "",
    guildId: process.env.DISCORD_GUILD_ID?.trim() ?? "",
    allowedChannelIds: parseIdSet(process.env.DISCORD_ALLOWED_CHANNEL_IDS),
    allowedRoleIds: parseIdSet(process.env.DISCORD_ALLOWED_ROLE_IDS),
  };
}

export function discordConfigured(config = readDiscordConfig()): boolean {
  return Boolean(
    config.applicationId &&
      config.publicKey &&
      config.botToken &&
      config.guildId,
  );
}

export async function verifyDiscordRequest(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  if (!signature || !timestamp || !publicKey) return false;

  return verifyKey(body, signature, timestamp, publicKey);
}

export function discordChannelAllowed(
  channelId: string | undefined,
  config = readDiscordConfig(),
): boolean {
  if (!config.allowedChannelIds.size) return true;
  return Boolean(channelId && config.allowedChannelIds.has(channelId));
}

export function discordRolesAllowed(
  roleIds: string[] | undefined,
  config = readDiscordConfig(),
): boolean {
  if (!config.allowedRoleIds.size) return true;
  return Boolean(roleIds?.some((roleId) => config.allowedRoleIds.has(roleId)));
}


