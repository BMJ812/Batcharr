const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();
const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

if (!applicationId || !guildId || !botToken) {
  console.error(
    "DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, and DISCORD_BOT_TOKEN are required.",
  );
  process.exit(1);
}

const commands = [
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
        description:
          "Titles separated by lines, commas, semicolons, or tabs",
        type: 3,
        required: true,
      },
    ],
  },
];

const url =
  `https://discord.com/api/v10/applications/${applicationId}` +
  `/guilds/${guildId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const responseText = await response.text();

if (!response.ok) {
  console.error(
    `Discord command registration failed with ${response.status}.`,
  );
  console.error(responseText);
  process.exit(1);
}

console.log("Batcharr Discord commands registered.");
console.log(responseText);
