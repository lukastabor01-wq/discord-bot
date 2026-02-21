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
  InteractionType,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;

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
const isStaff = (member) => member?.roles?.cache?.has(STAFF_ROLE_ID);

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

// ================= MESSAGE COMMANDS =================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  // !ping
  if (message.content === "!ping") {
    return message.reply("pong 🏓");
  }

  // !bestellen
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
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (interaction) => {
  try {
    // ---------- /münze ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "münze") {
      await interaction.reply("🪙 Münze wird geworfen...");
      const result = Math.random() < 0.5 ? "🪙 **Kopf**" : "🪙 **Zahl**";
      return setTimeout(() => {
        interaction.editReply(`➡️ Ergebnis: ${result}`);
      }, 1500);
    }

    // ---------- /textbot ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "textbot") {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Keine Berechtigung.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("textbot_modal")
        .setTitle("Als Bot schreiben");

      const input = new TextInputBuilder()
        .setCustomId("textbot_text")
        .setLabel("Nachricht")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ---------- TEXTBOT MODAL ----------
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "textbot_modal") {
      if (!isStaff(interaction.member)) return;
      const text = interaction.fields.getTextInputValue("textbot_text");
      await interaction.channel.send(text);
      return interaction.reply({ content: "✅ Nachricht gesendet.", ephemeral: true });
    }

    // ---------- WEIN AUSWAHL ----------
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

    // ---------- MENGE ----------
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`done|${orderId}|${interaction.user.id}`)
          .setLabel("Erledigt")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject|${orderId}|${interaction.user.id}`)
          .setLabel("Ablehnen")
          .setStyle(ButtonStyle.Danger)
      );

      const staffChannel = await client.channels.fetch(STAFF_NOTIFY_CHANNEL_ID);
      await staffChannel.send({
        content: `<@&${STAFF_ROLE_ID}>`,
        embeds: [embed],
        components: [row],
      });

      return interaction.reply({ content: "✅ Bestellung gesendet!", ephemeral: true });
    }

    // ---------- ERLEDIGT ----------
    if (interaction.isButton() && interaction.customId.startsWith("done|")) {
      if (!isStaff(interaction.member)) return;

      const [, orderId, userId] = interaction.customId.split("|");

      const updated = EmbedBuilder.from(interaction.message.embeds[0])
        .spliceFields(1, 1, { name: "Status", value: "ERLEDIGT ✅", inline: true })
        .setFooter({ text: `Erledigt von ${interaction.user.tag}` });

      await interaction.update({ embeds: [updated], components: [] });

      try {
        const user = await client.users.fetch(userId);
        await user.send(
          `✅ Ihre Bestellung #${orderId} wurde angenommen.\nEin Mitarbeiter meldet sich bei Ihnen.`
        );
      } catch {}
    }

    // ---------- ABLEHNEN ----------
    if (interaction.isButton() && interaction.customId.startsWith("reject|")) {
      if (!isStaff(interaction.member)) return;

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

    // ---------- ABLEHNUNG BESTÄTIGEN ----------
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
          `❌ Ihre Bestellung #${orderId} wurde abgelehnt.\nGrund: ${reason}`
        );
      } catch {}
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(TOKEN);