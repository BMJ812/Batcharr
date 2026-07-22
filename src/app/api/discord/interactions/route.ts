import { NextResponse } from "next/server";
import {
  discordCancelId,
  isDiscordCancelId,
  makeDiscordRequestId,
  readDiscordRequestId,
} from "@/lib/discord-actions";
import {
  discordChannelAllowed,
  discordConfigured,
  discordRolesAllowed,
  readDiscordConfig,
  verifyDiscordRequest,
} from "@/lib/discord";
import { submitMediaSelection } from "@/lib/media-request";
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
const INTERACTION_MESSAGE_COMPONENT = 3;

const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;
const RESPONSE_DEFERRED_CHANNEL_MESSAGE = 5;
const RESPONSE_DEFERRED_MESSAGE_UPDATE = 6;

const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;

const BUTTON_PRIMARY = 1;
const BUTTON_SECONDARY = 2;

const EPHEMERAL_FLAG = 1 << 6;

interface DiscordCommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

interface DiscordEmbedField {
  name?: string;
  value?: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  thumbnail?: {
    url?: string;
  };
  fields?: DiscordEmbedField[];
  footer?: {
    text?: string;
  };
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
    custom_id?: string;
    options?: DiscordCommandOption[];
  };
  message?: {
    embeds?: DiscordEmbed[];
  };
}

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: unknown[];
  flags?: number;
  allowed_mentions?: {
    parse: string[];
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

function formatCandidate(
  candidate: LookupCandidate,
): string {
  const year = candidate.year
    ? ` (${candidate.year})`
    : "";

  const target =
    candidate.type === "movie"
      ? "Radarr"
      : "Sonarr";

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

function candidateEmbed(
  candidate: LookupCandidate,
): DiscordEmbed {
  const target =
    candidate.type === "movie"
      ? "Radarr"
      : "Sonarr";

  const status = candidate.alreadyExists
    ? "Already in library"
    : "Available to request";

  const embed: DiscordEmbed = {
    title: candidate.title,
    description:
      candidate.overview ||
      "No overview is available for this title.",
    color: candidate.alreadyExists
      ? 0xf0ad4e
      : 0x5865f2,
    fields: [
      {
        name: "Year",
        value: candidate.year
          ? String(candidate.year)
          : "Unknown",
        inline: true,
      },
      {
        name: "Target",
        value: target,
        inline: true,
      },
      {
        name: "Status",
        value: status,
        inline: true,
      },
    ],
    footer: {
      text:
        `Batcharr|${candidate.type}|` +
        `${candidate.externalId}|` +
        `${candidate.year ?? ""}`,
    },
  };

  if (candidate.posterUrl) {
    embed.thumbnail = {
      url: candidate.posterUrl,
    };
  }

  return embed;
}

function candidateComponents(
  candidate: LookupCandidate,
): unknown[] {
  return [
    {
      type: COMPONENT_ACTION_ROW,
      components: [
        {
          type: COMPONENT_BUTTON,
          style: BUTTON_PRIMARY,
          label: candidate.alreadyExists
            ? "Already in Library"
            : "Request",
          custom_id: makeDiscordRequestId(
            candidate.type,
            candidate.externalId,
          ),
          disabled: candidate.alreadyExists,
        },
        {
          type: COMPONENT_BUTTON,
          style: BUTTON_SECONDARY,
          label: "Cancel",
          custom_id: discordCancelId(),
        },
      ],
    },
  ];
}

function resultPayload(
  candidate: LookupCandidate,
): DiscordMessagePayload {
  return {
    content: "",
    embeds: [
      candidateEmbed(candidate),
    ],
    components:
      candidateComponents(candidate),
    allowed_mentions: {
      parse: [],
    },
  };
}

function errorPayload(
  message: string,
): DiscordMessagePayload {
  return {
    content: `❌ ${message}`,
    embeds: [],
    components: [],
    allowed_mentions: {
      parse: [],
    },
  };
}

function readSelectionFromMessage(
  interaction: DiscordInteraction,
) {
  const embed = interaction.message?.embeds?.[0];
  const footer = embed?.footer?.text;

  if (!embed?.title || !footer) {
    throw new Error(
      "The selected Discord result is missing its media details.",
    );
  }

  const [
    marker,
    type,
    externalIdText,
    yearText,
  ] = footer.split("|");

  const externalId = Number(externalIdText);
  const year = yearText
    ? Number(yearText)
    : null;

  if (
    marker !== "Batcharr" ||
    !["movie", "series"].includes(type) ||
    !Number.isInteger(externalId) ||
    externalId <= 0 ||
    (
      year !== null &&
      (
        !Number.isInteger(year) ||
        year <= 0
      )
    )
  ) {
    throw new Error(
      "The selected Discord result contains invalid media details.",
    );
  }

  return {
    type:
      type === "movie"
        ? "movie" as const
        : "series" as const,
    externalId,
    title: embed.title,
    year,
  };
}

function completedEmbed(
  original: DiscordEmbed | undefined,
  status: "added" | "duplicate" | "cancelled",
  message: string,
): DiscordEmbed {
  const title =
    original?.title ??
    "Batcharr Request";

  const description =
    original?.description ??
    "";

  let color: number;
  let statusText: string;

  switch (status) {
    case "added":
      color = 0x57f287;
      statusText = "Requested";
      break;

    case "duplicate":
      color = 0xf0ad4e;
      statusText = "Already in library";
      break;

    case "cancelled":
      color = 0x747f8d;
      statusText = "Cancelled";
      break;
  }

  return {
    title,
    description,
    color,
    thumbnail: original?.thumbnail,
    fields: [
      ...(original?.fields ?? []).filter(
        (field) => field.name !== "Status",
      ),
      {
        name: "Status",
        value: statusText,
        inline: true,
      },
      {
        name: "Result",
        value: message,
        inline: false,
      },
    ],
  };
}

async function updateDeferredResponse(
  applicationId: string,
  interactionToken: string,
  payload: DiscordMessagePayload,
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const responseText =
      await response.text();

    console.error(
      `Discord follow-up failed with ${response.status}: ${responseText}`,
    );
  }
}

async function processCommand(
  interaction: DiscordInteraction,
): Promise<DiscordMessagePayload> {
  const command = interaction.data?.name;

  let hint: MediaHint;
  let text: string;

  switch (command) {
    case "movie":
      hint = "movie";
      text = getStringOption(
        interaction,
        "title",
      );
      break;

    case "show":
      hint = "series";
      text = getStringOption(
        interaction,
        "title",
      );
      break;

    case "list":
      hint = "auto";
      text = getStringOption(
        interaction,
        "titles",
      );
      break;

    default:
      throw new Error(
        "Unknown Batcharr command.",
      );
  }

  if (!text) {
    throw new Error(
      "A title or list of titles is required.",
    );
  }

  const results =
    await resolveMediaList(text, hint);

  if (command === "list") {
    return {
      content:
        formatLookupResults(results),
      embeds: [],
      components: [],
      allowed_mentions: {
        parse: [],
      },
    };
  }

  const firstResult = results[0];
  const candidate =
    firstResult?.candidates[0];

  if (!candidate) {
    throw new Error(
      firstResult?.error ??
      "No matching title was found.",
    );
  }

  return resultPayload(candidate);
}

async function processComponent(
  interaction: DiscordInteraction,
): Promise<DiscordMessagePayload> {
  const customId =
    interaction.data?.custom_id ?? "";

  const originalEmbed =
    interaction.message?.embeds?.[0];

  if (isDiscordCancelId(customId)) {
    return {
      content: "",
      embeds: [
        completedEmbed(
          originalEmbed,
          "cancelled",
          "No request was submitted.",
        ),
      ],
      components: [],
      allowed_mentions: {
        parse: [],
      },
    };
  }

  const action =
    readDiscordRequestId(customId);

  const selected =
    readSelectionFromMessage(interaction);

  if (
    action.type !== selected.type ||
    action.externalId !==
      selected.externalId
  ) {
    throw new Error(
      "The request button does not match the displayed title.",
    );
  }

  const result =
    await submitMediaSelection(selected);

  return {
    content: "",
    embeds: [
      completedEmbed(
        originalEmbed,
        result.status,
        result.message,
      ),
    ],
    components: [],
    allowed_mentions: {
      parse: [],
    },
  };
}

export async function POST(
  request: Request,
) {
  const config = readDiscordConfig();

  if (!discordConfigured(config)) {
    return NextResponse.json(
      {
        error:
          "Discord integration is not configured.",
      },
      { status: 503 },
    );
  }

  const signature =
    request.headers.get(
      "x-signature-ed25519",
    ) ?? "";

  const timestamp =
    request.headers.get(
      "x-signature-timestamp",
    ) ?? "";

  const rawBody = await request.text();

  const valid =
    await verifyDiscordRequest(
      rawBody,
      signature,
      timestamp,
      config.publicKey,
    );

  if (!valid) {
    return NextResponse.json(
      {
        error:
          "Invalid Discord request signature.",
      },
      { status: 401 },
    );
  }

  let interaction:
    DiscordInteraction;

  try {
    interaction =
      JSON.parse(
        rawBody,
      ) as DiscordInteraction;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid interaction payload.",
      },
      { status: 400 },
    );
  }

  if (
    interaction.type ===
    INTERACTION_PING
  ) {
    return NextResponse.json({
      type: RESPONSE_PONG,
    });
  }

  const supported =
    interaction.type ===
      INTERACTION_APPLICATION_COMMAND ||
    interaction.type ===
      INTERACTION_MESSAGE_COMPONENT;

  if (!supported) {
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

  const applicationId =
    interaction.application_id;

  const interactionToken =
    interaction.token;

  const isComponent =
    interaction.type ===
    INTERACTION_MESSAGE_COMPONENT;

  const operation = isComponent
    ? processComponent(interaction)
    : processCommand(interaction);

  void operation
    .then((payload) =>
      updateDeferredResponse(
        applicationId,
        interactionToken,
        payload,
      ),
    )
    .catch((error: unknown) =>
      updateDeferredResponse(
        applicationId,
        interactionToken,
        errorPayload(
          error instanceof Error
            ? error.message
            : "Unable to process the Batcharr request.",
        ),
      ),
    );

  if (isComponent) {
    return NextResponse.json({
      type:
        RESPONSE_DEFERRED_MESSAGE_UPDATE,
    });
  }

  return NextResponse.json({
    type:
      RESPONSE_DEFERRED_CHANNEL_MESSAGE,
    data: {
      flags: EPHEMERAL_FLAG,
    },
  });
}
