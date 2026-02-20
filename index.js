import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) throw new Error("DISCORD_TOKEN fehlt");

const commands = [
  new SlashCommandBuilder()
    .setName("text")
    .setDescription("Schreibe eine Nachricht über ein Formular")
    .toJSON()
];

// ---- DEPLOY MODE: einmalig Commands registrieren ----
async function deployCommands() {
  if (!CLIENT_ID || !GUILD_ID) {
    throw new Error("DISCORD_CLIENT_ID oder DISCORD_GUILD_ID fehlt");
  }
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  console.log("⏳ Registriere /text …");
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands
  });
  console.log("✅ Fertig! /text ist im Server verfügbar.");
}

// Wenn gestartet mit: node index.js deploy
if (process.argv[2] === "deploy") {
  deployCommands().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  // ---- BOT MODE: normal laufen ----
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, () => {
    console.log(`✅ Eingeloggt als ${client.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // /text -> Modal öffnen
      if (interaction.isChatInputCommand() && interaction.commandName === "text") {
        const modal = new ModalBuilder()
          .setCustomId("text_modal")
          .setTitle("Nachricht senden");

        const input = new TextInputBuilder()
          .setCustomId("text_content")
          .setLabel("Welche Nachricht soll der Bot senden?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // Modal submit -> im selben Channel posten
      if (interaction.isModalSubmit() && interaction.customId === "text_modal") {
        const content = interaction.fields.getTextInputValue("text_content");

        await interaction.reply({ content: "✅ Gesendet.", ephemeral: true });

        // Kasten (Embed)
        const embed = new EmbedBuilder()
          .setTitle("Neue Nachricht")
          .setDescription(content)
          .setTimestamp();

        await interaction.channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(err);
      if (interaction.isRepliable()) {
        const payload = { content: "❌ Fehler im Bot.", ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    }
  });

  client.login(TOKEN);
}