import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  BATCHARR_DISCORD_COMMANDS,
  discordApiRequest,
  discordErrorMessage,
  resolveDiscordManagementConfig,
  validateDiscordManagementConfig,
} from "@/lib/discord-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegisteredCommand {
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
    const response = await discordApiRequest(
      `/applications/${config.applicationId}/guilds/${config.guildId}/commands`,
      config.botToken,
      {
        method: "PUT",
        body: JSON.stringify(BATCHARR_DISCORD_COMMANDS),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: await discordErrorMessage(
            response,
            "Discord command registration failed.",
          ),
        },
        { status: 502 },
      );
    }

    const commands =
      (await response.json()) as RegisteredCommand[];

    const commandNames = commands
      .map((command) =>
        typeof command.name === "string"
          ? `/${command.name}`
          : "",
      )
      .filter(Boolean);

    return NextResponse.json({
      registered: commandNames,
      count: commandNames.length,
      message:
        commandNames.length > 0
          ? `Registered ${commandNames.join(", ")} in the selected Discord server.`
          : "Discord accepted the command registration request.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Discord command registration failed: ${error.message}`
            : "Discord command registration failed.",
      },
      { status: 502 },
    );
  }
}