const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  InteractionType
} = require("discord.js");

const { REST } = require("@discordjs/rest");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "DEINE_CLIENT_ID_HIER"; // aus Discord Developer Portal

// Slash Command registrieren
const commands = [
  new SlashCommandBuilder()
    .setName("text")
    .setDescription("Schreibe eine Nachricht als Bot")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Slash Command /text registriert");
  } catch (error) {
    console.error(error);
  }
})();

// Interaktionen
client.on("interactionCreate", async interaction => {

  // Slash Command
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "text") {

      const modal = new ModalBuilder()
        .setCustomId("textModal")
        .setTitle("Bot-Nachricht");

      const textInput = new TextInputBuilder()
        .setCustomId("botText")
        .setLabel("Was soll der Bot schreiben?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(textInput)
      );

      await interaction.showModal(modal);
    }
  }

  // Modal absenden
  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === "textModal") {

      const text = interaction.fields.getTextInputValue("botText");

      await interaction.channel.send(text);

      await interaction.reply({
        content: "✅ Nachricht gesendet!",
        ephemeral: true
      });
    }
  }
});

client.once("ready", () => {
  console.log(`🤖 Bot online als ${client.user.tag}`);
});

client.login(TOKEN);