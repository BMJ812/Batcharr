import {
  discordCancelId,
  discordListSelectId,
  isDiscordCancelId,
  isDiscordListSelectId,
  makeDiscordListValue,
  makeDiscordRequestId,
  readDiscordListValue,
  readDiscordRequestId,
} from "@/lib/discord-actions";
import { submitMediaSelection } from "@/lib/media-request";
import { resolveMediaList } from "@/lib/requests";
import type { APIEmbed } from "discord.js";
import type {
  LookupCandidate,
  LookupItemResult,
  MediaHint,
} from "@/lib/types";

const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const COMPONENT_STRING_SELECT = 3;

const BUTTON_PRIMARY = 1;
const BUTTON_SECONDARY = 2;
interface DiscordCommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

type DiscordEmbed = APIEmbed;

export interface DiscordInteraction {
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
    values?: string[];
  };
  message?: {
    embeds?: DiscordEmbed[];
  };
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: unknown[];
  flags?: number;
  allowed_mentions?: {
    parse: string[];
  };
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

function truncateDiscordText(
  value: string,
  maximumLength: number,
): string {
  const normalized = value.trim();

  if (normalized.length <= maximumLength) {
    return normalized;
  }

  return `${normalized.slice(0, maximumLength - 1)}…`;
}

function listReviewPayload(
  results: LookupItemResult[],
): DiscordMessagePayload {
  const resolved = results
    .map((result) => ({
      result,
      candidate: result.candidates[0],
    }))
    .filter(
      (
        entry,
      ): entry is {
        result: LookupItemResult;
        candidate: LookupCandidate;
      } => Boolean(entry.candidate),
    );

  const ready = resolved.filter(
    (entry) => !entry.candidate.alreadyExists,
  );

  const duplicates = resolved.filter(
    (entry) => entry.candidate.alreadyExists,
  );

  const unresolved = results.filter(
    (result) => !result.candidates[0],
  );

  const menuEntries = ready.slice(0, 25);

  const summaryLines = [
    `✅ **${ready.length}** available to review`,
    `⚠️ **${duplicates.length}** already in the library`,
    `❌ **${unresolved.length}** unresolved`,
  ];

  if (ready.length > 25) {
    summaryLines.push(
      `\nShowing the first 25 of ${ready.length} available titles.`,
    );
  }

  if (duplicates.length > 0) {
    const duplicateTitles = duplicates
      .slice(0, 8)
      .map(({ candidate }) => {
        const year = candidate.year
          ? ` (${candidate.year})`
          : "";

        return `• ${candidate.title}${year}`;
      });

    summaryLines.push(
      "",
      "**Already in library**",
      ...duplicateTitles,
    );

    if (duplicates.length > 8) {
      summaryLines.push(
        `• …and ${duplicates.length - 8} more`,
      );
    }
  }

  if (unresolved.length > 0) {
    const unresolvedTitles = unresolved
      .slice(0, 8)
      .map(
        (result) =>
          `• ${result.item.query}`,
      );

    summaryLines.push(
      "",
      "**Could not resolve**",
      ...unresolvedTitles,
    );

    if (unresolved.length > 8) {
      summaryLines.push(
        `• …and ${unresolved.length - 8} more`,
      );
    }
  }

  const components =
    menuEntries.length > 0
      ? [
          {
            type: COMPONENT_ACTION_ROW,
            components: [
              {
                type: COMPONENT_STRING_SELECT,
                custom_id: discordListSelectId(),
                placeholder:
                  "Choose a title to review",
                min_values: 1,
                max_values: 1,
                options: menuEntries.map(
                  ({ candidate }) => {
                    const year = candidate.year
                      ? ` (${candidate.year})`
                      : "";

                    const target =
                      candidate.type === "movie"
                        ? "Radarr"
                        : "Sonarr";

                    return {
                      label: truncateDiscordText(
                        `${candidate.title}${year}`,
                        100,
                      ),
                      description:
                        truncateDiscordText(
                          `${target} • Match confidence: ${candidate.confidence}`,
                          100,
                        ),
                      value: makeDiscordListValue(
                        candidate.type,
                        candidate.externalId,
                        candidate.title,
                        candidate.year,
                      ),
                    };
                  },
                ),
              },
            ],
          },
        ]
      : [];

  return {
    content: summaryLines.join("\n"),
    embeds: [],
    components,
    allowed_mentions: {
      parse: [],
    },
  };
}

async function selectedListCandidate(
  interaction: DiscordInteraction,
): Promise<LookupCandidate> {
  const selectedValue =
    interaction.data?.values?.[0];

  if (!selectedValue) {
    throw new Error(
      "Discord did not provide the selected title.",
    );
  }

  const selection =
    readDiscordListValue(selectedValue);

  const yearText = selection.year
    ? ` (${selection.year})`
    : "";

  const results = await resolveMediaList(
    `${selection.title}${yearText}`,
    selection.type,
  );

  const candidate = results
    .flatMap((result) => result.candidates)
    .find(
      (entry) =>
        entry.type === selection.type &&
        entry.externalId ===
          selection.externalId,
    );

  if (!candidate) {
    throw new Error(
      "The selected title could not be resolved again. Run the list command again.",
    );
  }

  return candidate;
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

export function errorPayload(
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

export async function processDiscordCommand(
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
    return listReviewPayload(results);
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

export async function processDiscordComponent(
  interaction: DiscordInteraction,
): Promise<DiscordMessagePayload> {
  const customId =
    interaction.data?.custom_id ?? "";

  const originalEmbed =
    interaction.message?.embeds?.[0];


  if (isDiscordListSelectId(customId)) {
    const candidate =
      await selectedListCandidate(interaction);

    return resultPayload(candidate);
  }
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

