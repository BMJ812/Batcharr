import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type BaseInteraction,
  type InteractionEditReplyOptions,
} from "discord.js";
import {
  discordChannelAllowed,
  discordGatewayConfigured,
  discordRolesAllowed,
  readDiscordConfig,
} from "../src/lib/discord";
import {
  errorPayload,
  processDiscordCommand,
  processDiscordComponent,
  type DiscordInteraction,
  type DiscordMessagePayload,
} from "../src/lib/discord-interaction-service";

function readRoleIds(
  interaction: BaseInteraction,
): string[] {
  const member = interaction.member;

  if (!member) {
    return [];
  }

  if (Array.isArray(member.roles)) {
    return member.roles;
  }

  return member.roles.cache.map(
    (role) => role.id,
  );
}

function toEditReplyOptions(
  payload: DiscordMessagePayload,
): InteractionEditReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components:
      payload.components as InteractionEditReplyOptions["components"],
    allowedMentions: {
      parse: [],
    },
  };
}

function commandPayload(
  interaction: BaseInteraction,
): DiscordInteraction {
  if (!interaction.isChatInputCommand()) {
    throw new Error(
      "The Discord interaction is not a slash command.",
    );
  }

  return {
    type: 2,
    guild_id: interaction.guildId ?? undefined,
    channel_id: interaction.channelId,
    member: {
      roles: readRoleIds(interaction),
      user: {
        id: interaction.user.id,
        username: interaction.user.username,
        global_name: interaction.user.globalName,
      },
    },
    data: {
      name: interaction.commandName,
      options: interaction.options.data.map(
        (option) => ({
          name: option.name,
          type: option.type,
          value:
            typeof option.value === "string" ||
            typeof option.value === "number" ||
            typeof option.value === "boolean"
              ? option.value
              : undefined,
        }),
      ),
    },
  };
}

function componentPayload(
  interaction: BaseInteraction,
): DiscordInteraction {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
    throw new Error(
      "The Discord interaction is not a supported message component.",
    );
  }

  return {
    type: 3,
    guild_id: interaction.guildId ?? undefined,
    channel_id: interaction.channelId,
    member: {
      roles: readRoleIds(interaction),
      user: {
        id: interaction.user.id,
        username: interaction.user.username,
        global_name: interaction.user.globalName,
      },
    },
    data: {
      custom_id: interaction.customId,
      values: interaction.isStringSelectMenu()
        ? interaction.values
        : undefined,
    },
    message: {
      embeds: interaction.message.embeds.map(
        (embed) => embed.toJSON(),
      ),
    },
  };
}

async function handleInteraction(
  interaction: BaseInteraction,
): Promise<void> {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isStringSelectMenu()
  ) {
    return;
  }

  const config = readDiscordConfig();

  if (
    interaction.guildId !== config.guildId
  ) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content:
          "Batcharr is not configured for this Discord server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  }

  if (
    !discordChannelAllowed(
      interaction.channelId,
      config,
    )
  ) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content:
          "Batcharr commands are not allowed in this channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  }

  if (
    !discordRolesAllowed(
      readRoleIds(interaction),
      config,
    )
  ) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content:
          "You do not have a role permitted to use Batcharr.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  }

  try {
    let payload: DiscordMessagePayload;

    if (

      interaction.isButton() ||

      interaction.isStringSelectMenu()

    ) {
      await interaction.deferUpdate();

      payload =
        await processDiscordComponent(
          componentPayload(interaction),
        );
    } else {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      payload =
        await processDiscordCommand(
          commandPayload(interaction),
        );
    }

    await interaction.editReply(
      toEditReplyOptions(payload),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to process the Batcharr request.";

    console.error(
      "Discord Gateway interaction failed:",
      error,
    );

    if (!interaction.isRepliable()) {
      return;
    }

    const payload = toEditReplyOptions(
      errorPayload(message),
    );

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: {
          parse: [],
        },
      });
    }
  }
}

async function main(): Promise<void> {
  const config = readDiscordConfig();

  if (!discordGatewayConfigured(config)) {
    console.log(
      "Discord Gateway is disabled because its application ID, bot token, or guild ID is missing.",
    );

    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });

  client.once(
    Events.ClientReady,
    (readyClient) => {
      if (
        readyClient.application.id !==
        config.applicationId
      ) {
        console.error(
          "Discord application ID does not match the authenticated bot application.",
        );

        void readyClient.destroy();
        process.exitCode = 1;
        return;
      }

      console.log(
        `Discord Gateway connected as ${readyClient.user.tag}.`,
      );
    },
  );

  client.on(
    Events.InteractionCreate,
    (interaction) => {
      void handleInteraction(
        interaction,
      ).catch((error: unknown) => {
        console.error(
          "Unhandled Discord Gateway interaction error:",
          error,
        );
      });
    },
  );

  client.on(
    Events.Error,
    (error) => {
      console.error(
        "Discord Gateway client error:",
        error,
      );
    },
  );

  await client.login(config.botToken);
}

void main().catch((error: unknown) => {
  console.error(
    "Discord Gateway failed to start:",
    error,
  );

  process.exitCode = 1;
});