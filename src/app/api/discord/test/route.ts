import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  discordApiRequest,
  discordErrorMessage,
  resolveDiscordManagementConfig,
  validateDiscordManagementConfig,
} from "@/lib/discord-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DiscordBotUser {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
}

interface DiscordGuild {
  id?: unknown;
  name?: unknown;
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    applicationId?: unknown;
    botToken?: unknown;
    guildId?: unknown;
  };

  const config = resolveDiscordManagementConfig(body);
  const validationError =
    validateDiscordManagementConfig(config);

  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400 },
    );
  }

  try {
    const botResponse = await discordApiRequest(
      "/users/@me",
      config.botToken,
    );

    if (!botResponse.ok) {
      return NextResponse.json(
        {
          error: await discordErrorMessage(
            botResponse,
            "Discord could not validate the bot account.",
          ),
        },
        { status: 502 },
      );
    }

    const bot = (await botResponse.json()) as DiscordBotUser;

    const guildResponse = await discordApiRequest(
      `/guilds/${config.guildId}`,
      config.botToken,
    );

    if (!guildResponse.ok) {
      return NextResponse.json(
        {
          error: await discordErrorMessage(
            guildResponse,
            "Discord could not validate the server.",
          ),
        },
        { status: 502 },
      );
    }

    const guild = (await guildResponse.json()) as DiscordGuild;

    const botName =
      typeof bot.global_name === "string" &&
      bot.global_name.trim()
        ? bot.global_name.trim()
        : typeof bot.username === "string"
          ? bot.username
          : "Discord bot";

    const guildName =
      typeof guild.name === "string"
        ? guild.name
        : config.guildId;

    return NextResponse.json({
      applicationId: config.applicationId,
      botUserId:
        typeof bot.id === "string" ? bot.id : "",
      botName,
      guildId:
        typeof guild.id === "string"
          ? guild.id
          : config.guildId,
      guildName,
      message: `${botName} can access ${guildName}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Discord connection failed: ${error.message}`
            : "Discord connection failed.",
      },
      { status: 502 },
    );
  }
}