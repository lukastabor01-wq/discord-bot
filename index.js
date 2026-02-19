const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// 🔐 IDs
const STAFF_ROLE_ID = "1473195959247831170";
const ORDER_INPUT_CHANNEL_ID = "1473039686355390525";
const STAFF_NOTIFY_CHANNEL_ID = "1474089272054120580";

// 🍷 Weine
const WINES = [
  { key: "blanc", label: "44s No I - Blanc Elegance" },
  { key: "rose", label: "44s No II - Rose Prive" },
  { key: "rouge", label: "44s No III - Rouge Signature" },
  { key: "reserve", label: "44s No IV - Reserve Noire" },
  { key: "founder", label: "44s Founder Edition" },
];

const wineByKey = (key) => WINES.find(w => w.key === key);

client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

// 📩 !bestellen Panel
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content === "!bestellen") {
    if (message.channel.id !== ORDER_INPUT_CHANNEL_ID) {
      return message.reply("❌ Bitte nur im Bestell-Channel benutzen.");
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("order_select")
      .setPlaceholder("Wein auswaehlen")
      .addOptions(WINES.map(w => ({ label: w.label, value: w.key })));

    const row = new ActionRowBuilder().addComponents(select);

    const embed = new EmbedBuilder()
      .setTitle("44s Bestellsystem")
      .setDescription("Wein auswaehlen, dann Menge eingeben.");

    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

// 🎛 Interactions
client.on("interactionCreate", async (interaction) => {
  // 🍷 Wein gewählt
  if (interaction.isStringSelectMenu() && interaction.customId === "order_select") {
    const wine = wineByKey(interaction.values[0]);
    if (!wine) return;

    const modal = new ModalBuilder()
      .setCustomId(`qty:${wine.key}`)
      .setTitle("Menge");

    const qty = new TextInputBuilder()
      .setCustomId("qty")
      .setLabel("Anzahl Flaschen")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(qty));
    return interaction.showModal(modal);
  }

  // 📦 Menge eingegeben
  if (interaction.isModalSubmit() && interaction.customId.startsWith("qty:")) {
    const wineKey = interaction.customId.split(":")[1];
    const wine = wineByKey(wineKey);
    const qty = parseInt(interaction.fields.getTextInputValue("qty"), 10);

    if (!wine || !qty || qty <= 0) {
      return interaction.reply({ content: "❌ Ungueltige Menge.", ephemeral: true });
    }

    if (wineKey === "founder" && qty > 1) {
      return interaction.reply({ content: "❌ Founder Edition max. 1 Flasche.", ephemeral: true });
    }

    const doneButton = new ButtonBuilder()
      .setCustomId("order_done")
      .setLabel("Erledigt")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(doneButton);

    const embed = new EmbedBuilder()
      .setTitle("🛒 Neue Bestellung")
      .addFields(
        { name: "Kunde", value: `${interaction.user}`, inline: true },
        { name: "Wein", value: wine.label, inline: true },
        { name: "Menge", value: `${qty}`, inline: true }
      )
      .setTimestamp();

    const channel = await client.channels.fetch(STAFF_NOTIFY_CHANNEL_ID);
    await channel.send({
      content: `<@&${STAFF_ROLE_ID}>`,
      embeds: [embed],
      components: [row],
    });

    return interaction.reply({ content: "✅ Bestellung gesendet!", ephemeral: true });
  }

  // ✅ Erledigt Button
  if (interaction.isButton() && interaction.customId === "order_done") {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.reply({ content: "❌ Nur Mitarbeiter.", ephemeral: true });
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ecc71)
      .setFooter({ text: `Erledigt von ${interaction.user.tag}` });

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  }
});

client.login(process.env.DISCORD_TOKEN);