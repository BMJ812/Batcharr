import { NextResponse } from "next/server";
import {
  discordChannelAllowed,
  discordConfigured,
  discordRolesAllowed,
  readDiscordConfig,
  verifyDiscordRequest,
} from "@/lib/discord";
import { resolveMediaList } from "@/lib/requests";
import type {
  LookupCandidate,
  LookupItemResult,
  MediaHint,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;

const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;
const RESPONSE_DEFERRED_CHANNEL_MESSAGE = 5;

const EPHEMERAL_FLAG = 1 << 6;

interface DiscordCommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

interface DiscordInteraction {
  type?: number;
  token?: string;
  application_id?: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    roles?: string[];
    user?: {
      id?: string;
      username?: string;
      global_name?: string | null;
    };
  };
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
  data?: {
    name?: string;
    options?: DiscordCommandOption[];
  };
}

function interactionResponse(
  content: string,
  status = 200,
): NextResponse {
  return NextResponse.json(
    {
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content,
        flags: EPHEMERAL_FLAG,
        allowed_mentions: {
          parse: [],
        },
      },
    },
    { status },
  );
}

function getStringOption(
  interaction: DiscordInteraction,
  name: string,
): string {
  const option = interaction.data?.options?.find(
    (entry) => entry.name === name,
  );

  return typeof option?.value === "string"
    ? option.value.trim()
    : "";
}

function formatCandidate(candidate: LookupCandidate): string {
  const year = candidate.year ? ` (${candidate.year})` : "";
  const target = candidate.type === "movie" ? "Radarr" : "Sonarr";
  const duplicate = candidate.alreadyExists
    ? " — already in library"
    : "";

  return `**${candidate.title}${year}** — ${target}${duplicate}`;
}

function formatLookupResults(
  results: LookupItemResult[],
): string {
  const lines: string[] = [];

  for (const result of results.slice(0, 20)) {
    const best = result.candidates[0];

    if (!best) {
      lines.push(
        `❌ **${result.item.query}** — ${
          result.error ?? "No match found."
        }`,
      );
      continue;
    }

    lines.push(
      `${best.alreadyExists ? "⚠️" : "✅"} ${formatCandidate(best)}`,
    );
  }

  if (results.length > 20) {
    lines.push(
      `\nShowing the first 20 of ${results.length} resolved titles.`,
    );
  }

  return lines.join("\n");
}

async function updateDeferredResponse(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        allowed_mentions: {
          parse: [],
        },
      }),
    },
  );

  if (!response.ok) {
    const responseText = await response.text();

    console.error(
      `Discord follow-up failed with ${response.status}: ${responseText}`,
    );
  }
}

async function processCommand(
  interaction: DiscordInteraction,
): Promise<string> {
  const command = interaction.data?.name;

  let hint: MediaHint;
  let text: string;

  switch (command) {
    case "movie":
      hint = "movie";
      text = getStringOption(interaction, "title");
      break;

    case "show":
      hint = "series";
      text = getStringOption(interaction, "title");
      break;

    case "list":
      hint = "auto";
      text = getStringOption(interaction, "titles");
      break;

    default:
      throw new Error("Unknown Batcharr command.");
  }

  if (!text) {
    throw new Error("A title or list of titles is required.");
  }

  const results = await resolveMediaList(text, hint);

  return formatLookupResults(results);
}

export async function POST(request: Request) {
  const config = readDiscordConfig();

  if (!discordConfigured(config)) {
    return NextResponse.json(
      { error: "Discord integration is not configured." },
      { status: 503 },
    );
  }

  const signature =
    request.headers.get("x-signature-ed25519") ?? "";

  const timestamp =
    request.headers.get("x-signature-timestamp") ?? "";

  const rawBody = await request.text();

  const valid = await verifyDiscordRequest(
    rawBody,
    signature,
    timestamp,
    config.publicKey,
  );

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid Discord request signature." },
      { status: 401 },
    );
  }

  let interaction: DiscordInteraction;

  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return NextResponse.json(
      { error: "Invalid interaction payload." },
      { status: 400 },
    );
  }

  if (interaction.type === INTERACTION_PING) {
    return NextResponse.json({
      type: RESPONSE_PONG,
    });
  }

  if (interaction.type !== INTERACTION_APPLICATION_COMMAND) {
    return interactionResponse(
      "This interaction type is not supported.",
    );
  }

  if (
    !discordChannelAllowed(
      interaction.channel_id,
      config,
    )
  ) {
    return interactionResponse(
      "Batcharr commands are not allowed in this channel.",
    );
  }

  if (
    !discordRolesAllowed(
      interaction.member?.roles,
      config,
    )
  ) {
    return interactionResponse(
      "You do not have a role permitted to use Batcharr.",
    );
  }

  if (
    !interaction.application_id ||
    !interaction.token
  ) {
    return interactionResponse(
      "Discord did not provide the required interaction identifiers.",
    );
  }

  const applicationId = interaction.application_id;
  const interactionToken = interaction.token;

  void processCommand(interaction)
    .then((content) =>
      updateDeferredResponse(
        applicationId,
        interactionToken,
        content,
      ),
    )
    .catch((error: unknown) =>
      updateDeferredResponse(
        applicationId,
        interactionToken,
        `❌ ${
          error instanceof Error
            ? error.message
            : "Unable to process the Batcharr request."
        }`,
      ),
    );

  return NextResponse.json({
    type: RESPONSE_DEFERRED_CHANNEL_MESSAGE,
    data: {
      flags: EPHEMERAL_FLAG,
    },
  });
}
