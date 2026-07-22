import { NextResponse } from "next/server";
import {
  discordChannelAllowed,
  discordConfigured,
  discordRolesAllowed,
  readDiscordConfig,
  verifyDiscordRequest,
} from "@/lib/discord";
import {
  errorPayload,
  processDiscordCommand,
  processDiscordComponent,
} from "@/lib/discord-interaction-service";
import type {
  DiscordInteraction,
  DiscordMessagePayload,
} from "@/lib/discord-interaction-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;
const INTERACTION_MESSAGE_COMPONENT = 3;

const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;
const RESPONSE_DEFERRED_CHANNEL_MESSAGE = 5;
const RESPONSE_DEFERRED_MESSAGE_UPDATE = 6;

const EPHEMERAL_FLAG = 1 << 6;

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
    const responseText = await response.text();

    console.error(
      `Discord follow-up failed with ${response.status}: ${responseText}`,
    );
  }
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
    ? processDiscordComponent(interaction)
    : processDiscordCommand(interaction);

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
