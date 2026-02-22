const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CLIP_URL =
  "https://cdn.discordapp.com/attachments/1475144172804636855/1475147494366384210/copy_FB303E9B-46C7-4B1A-9B7E-5D30AA53FBC7.mov";

client.once("ready", () => {
  console.log(`🤖 Online als ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.toLowerCase() !== "!münze") return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("kopf")
      .setLabel("🪙 Kopf")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("zahl")
      .setLabel("🪙 Zahl")
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({
    content: "🪙 **Wähle Kopf oder Zahl**",
    components: [row]
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userChoice = interaction.customId; // kopf oder zahl
  const result = Math.random() < 0.5 ? "kopf" : "zahl";
  const gewonnen = userChoice === result;

  // 1️⃣ Buttons entfernen + Bestätigung
  await interaction.update({
    content: `🪙 **Du hast ${userChoice.toUpperCase()} gewählt...**`,
    components: []
  });

  // 2️⃣ Clip senden
  await interaction.followUp({
    content: "🎥 **Münze wird geworfen...**",
    files: [CLIP_URL]
  });

  // 3️⃣ Ergebnis nach 2 Sekunden
  setTimeout(async () => {
    const embed = new EmbedBuilder()
      .setTitle("🪙 Münz-Ergebnis")
      .addFields(
        { name: "Deine Wahl", value: userChoice.toUpperCase(), inline: true },
        { name: "Ergebnis", value: result.toUpperCase(), inline: true }
      )
      .setTimestamp();

    if (gewonnen) {
      embed
        .setColor(0x2ecc71)
        .setDescription("🍾 **GEWONNEN! Glückwunsch!**");
    } else {
      embed
        .setColor(0xe74c3c)
        .setDescription("❌ **VERLOREN! Leider falsch geraten.**");
    }

    await interaction.followUp({ embeds: [embed] });
  }, 2000);
});

client.login(process.env.TOKEN);