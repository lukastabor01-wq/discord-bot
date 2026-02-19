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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🔐 IDs
const STAFF_ROLE_ID = "1473195959247831170";
const ORDER_INPUT_CHANNEL_ID = "1473039686355390525";
const STAFF_NOTIFY_CHANNEL_ID = "1474089272054120580";

// 🍷 Weine (nur normale Buchstaben)
const WINES = [
  { key: "blanc", label: "44s No I - Blanc Elegance" },
  { key: "rose", label: "44s No II - Rose Prive" },
  { key: "rouge", label: "44s No III - Rouge Signature" },
  { key: "reserve", label: "44s No IV - Reserve Noire" },
  { key: "founder", label: "44s Founder Edition" },
];

const wineByKey = (key) => WINES.find(w => w.key === key);
const isStaff = (member) => member?.roles?.cache?.has(STAFF_ROLE_ID);

client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

// 🧾 Bestell-Panel
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
      .setDescription("Wein auswaehlen → Menge eingeben.");

    return message.channel.send({ embeds: [embed], components: [row] });
  }

  if (message.content === "!ping") message.reply("pong 🏓");
});

// 🎛 Interactions
client.on("interactionCreate", async (interaction) => {
  try {
    // 🍷 Wein gewählt
    if (interaction.isStringSelectMenu() && interaction.customId === "order_select") {
      const wine = wineByKey(interaction.values[0]);
      if (!wine) return;

      const modal = new ModalBuilder()
        .setCustomId(`qty|${wine.key}`)
        .setTitle("Menge eingeben");

      const qtyInput = new TextInputBuilder()
        .setCustomId("qty")
        .setLabel("Wie viele Flaschen?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return interaction.showModal(modal);
    }

    // 📦 Menge eingegeben → Bestellung erstellen
    if (interaction.isModalSubmit() && interaction.customId.startsWith("qty|")) {
      const wineKey = interaction.customId.split("|")[1];
      const wine = wineByKey(wineKey);
      const qty = parseInt(interaction.fields.getTextInputValue("qty"), 10);

      if (!wine || !qty || qty <= 0) {
        return interaction.reply({ content: "❌ Ungueltige Menge.", ephemeral: true });
      }

      if (wineKey === "founder" && qty > 1) {
        return interaction.reply({ content: "❌ Founder Edition max. 1 Flasche.", ephemeral: true });
      }

      // 🔢 Bestellnummer
      const orderId = Math.floor(Math.random() * 1_000_000_001);

      const embed = new EmbedBuilder()
        .setTitle("🛒 Neue Bestellung")
        .addFields(
          { name: "Bestellnummer", value: `#${orderId}`, inline: true },
          { name: "Status", value: "OFFEN", inline: true },
          { name: "Kunde", value: `${interaction.user}`, inline: true },
          { name: "Wein", value: wine.label, inline: true },
          { name: "Menge", value: `${qty}`, inline: true }
        )
        .setTimestamp();

      const doneBtn = new ButtonBuilder()
        .setCustomId(`done|${orderId}|${interaction.user.id}`)
        .setLabel("Erledigt")
        .setStyle(ButtonStyle.Success);

      const rejectBtn = new ButtonBuilder()
        .setCustomId(`reject|${orderId}|${interaction.user.id}`)
        .setLabel("Ablehnen")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(doneBtn, rejectBtn);

      const staffChannel = await client.channels.fetch(STAFF_NOTIFY_CHANNEL_ID);
      await staffChannel.send({
        content: `<@&${STAFF_ROLE_ID}>`,
        embeds: [embed],
        components: [row],
      });

      return interaction.reply({ content: "✅ Bestellung gesendet!", ephemeral: true });
    }

    // ✅ ERLEDIGT
    if (interaction.isButton() && interaction.customId.startsWith("done|")) {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Nur Mitarbeiter.", ephemeral: true });
      }

      const [, orderId, userId] = interaction.customId.split("|");

      const updated = EmbedBuilder.from(interaction.message.embeds[0])
        .spliceFields(1, 1, { name: "Status", value: "ERLEDIGT ✅", inline: true })
        .setFooter({ text: `Erledigt von ${interaction.user.tag}` });

      await interaction.update({ embeds: [updated], components: [] });

      try {
        const user = await client.users.fetch(userId);
        await user.send(
          `✅ Ihre Bestellung #${orderId} wurde angenommen.\n` +
          "Ein Mitarbeiter wird sich in Kürze bei Ihnen melden."
        );
      } catch {}
    }

    // ❌ ABLEHNEN → Grund abfragen
    if (interaction.isButton() && interaction.customId.startsWith("reject|")) {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Nur Mitarbeiter.", ephemeral: true });
      }

      const [, orderId, userId] = interaction.customId.split("|");

      const modal = new ModalBuilder()
        .setCustomId(`reject_reason|${orderId}|${userId}`)
        .setTitle("Bestellung ablehnen");

      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Grund")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return interaction.showModal(modal);
    }

    // ❌ Ablehnung bestätigen
    if (interaction.isModalSubmit() && interaction.customId.startsWith("reject_reason|")) {
      if (!isStaff(interaction.member)) return;

      const [, orderId, userId] = interaction.customId.split("|");
      const reason = interaction.fields.getTextInputValue("reason");

      const updated = EmbedBuilder.from(interaction.message.embeds[0])
        .spliceFields(1, 1, { name: "Status", value: "ABGELEHNT ❌", inline: true })
        .addFields({ name: "Grund", value: reason });

      await interaction.update({ embeds: [updated], components: [] });

      try {
        const user = await client.users.fetch(userId);
        await user.send(
          `❌ Ihre Bestellung #${orderId} konnte leider nicht bearbeitet werden.\n` +
          "Grund: " + reason
        );
      } catch {}
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);