const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require("discord.js");

const Database = require("better-sqlite3");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const db = new Database("orders.sqlite");

// --- DB Setup
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  orderNo INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  guildId TEXT NOT NULL,
  itemsJson TEXT NOT NULL,
  status TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  processingMessageId TEXT,
  processingChannelId TEXT
);
`);

const insertOrder = db.prepare(`
INSERT INTO orders (orderNo, userId, guildId, itemsJson, status, createdAt, processingMessageId, processingChannelId)
VALUES (@orderNo, @userId, @guildId, @itemsJson, @status, @createdAt, @processingMessageId, @processingChannelId)
`);

const getOrderByNo = db.prepare(`SELECT * FROM orders WHERE orderNo = ?`);
const updateOrderStatus = db.prepare(`
UPDATE orders
SET status = @status
WHERE orderNo = @orderNo
`);

const updateProcessingMessage = db.prepare(`
UPDATE orders
SET processingMessageId = @processingMessageId,
    processingChannelId = @processingChannelId
WHERE orderNo = @orderNo
`);

// --- Products
const PRODUCTS = [
  { key: "no1", name: "44s No I - Blanc Elegance", founder: false },
  { key: "no2", name: "44s No II - Rose Prive", founder: false },
  { key: "no3", name: "44s No III - Rouge Signature", founder: false },
  { key: "no4", name: "44s No IV - Reserve Noire", founder: false },
  { key: "founder", name: "44s Founder Edition", founder: true },
];

const PRODUCT_MAP = new Map(PRODUCTS.map(p => [p.key, p]));

// --- Temporary in-memory state (per user) for selection before quantities modal
// key: userId -> { selectedKeys: string[], createdAt: number }
const pendingSelections = new Map();

function generateOrderNo() {
  // 1 .. 1,000,000,000 with collision check against DB
  // (Collisions are already extremely unlikely, but we check anyway)
  while (true) {
    const n = Math.floor(Math.random() * 1_000_000_000) + 1;
    const exists = getOrderByNo.get(n);
    if (!exists) return n;
  }
}

function isStaff(member) {
  const permName = config.staffPermission || "ManageMessages";
  const bit = PermissionsBitField.Flags[permName];
  if (!bit) return member.permissions.has(PermissionsBitField.Flags.ManageMessages);
  return member.permissions.has(bit);
}

function safeInt(value) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function buildOrderEmbed({ orderNo, userId, items }) {
  const lines = items.map(i => `• **${i.name}** × **${i.qty}**`).join("\n");

  return new EmbedBuilder()
    .setTitle(`🍷 Neue Bestellung #${orderNo}`)
    .setDescription(lines)
    .addFields(
      { name: "Kunde", value: `<@${userId}> (${userId})`, inline: false }
    )
    .setFooter({ text: "Bestellsystem" })
    .setTimestamp(new Date());
}

function buildProcessingButtons(orderNo, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order_accept:${orderNo}`)
      .setLabel("Annehmen")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`order_reject:${orderNo}`)
      .setLabel("Ablehnen")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
  return row;
}

function buildCustomerAcceptedText(orderNo) {
  return `✅ Ihre Bestellung #${orderNo} wurde angenommen.\nEin Mitarbeiter meldet sich bei Ihnen.`;
}

function buildCustomerRejectedText(orderNo, reason) {
  return `❌ Ihre Bestellung #${orderNo} konnte leider nicht bearbeitet werden.\nGrund: ${reason}`;
}

async function tryDmUser(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    return true;
  } catch {
    return false;
  }
}

// --- Message command handler
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content.trim().toLowerCase() === "!bestellen") {
      if (message.channel.id !== config.orderChannelId) {
        await message.reply({
          content: `❗ Bestellen ist nur im vorgesehenen Channel möglich: <#${config.orderChannelId}>`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`order_select:${message.author.id}`)
        .setPlaceholder("Wähle deine Weine (Mehrfachauswahl möglich)")
        .setMinValues(1)
        .setMaxValues(PRODUCTS.length)
        .addOptions(
          PRODUCTS.map(p => ({
            label: p.name,
            value: p.key,
            description: p.founder ? "Maximal 1 Stück bestellbar" : "Menge frei wählbar",
          }))
        );

      const row1 = new ActionRowBuilder().addComponents(select);

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`order_confirm:${message.author.id}`)
          .setLabel("Bestätigen")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`order_cancel:${message.author.id}`)
          .setLabel("Abbrechen")
          .setStyle(ButtonStyle.Secondary),
      );

      pendingSelections.set(message.author.id, { selectedKeys: [], createdAt: Date.now() });

      await message.reply({
        content: "🧾 Bitte wähle die Weine aus und bestätige anschließend:",
        components: [row1, row2],
        allowedMentions: { repliedUser: false },
      });
    }
  } catch (err) {
    console.error(err);
  }
});

// --- Interaction handler (select menus, buttons, modals)
client.on("interactionCreate", async (interaction) => {
  try {
    // Select Menu: store selection
    if (interaction.isStringSelectMenu()) {
      const [kind, ownerId] = interaction.customId.split(":");
      if (kind !== "order_select") return;

      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "❗ Dieses Bestellmenü gehört nicht dir.", ephemeral: true });
        return;
      }

      const selectedKeys = interaction.values;
      pendingSelections.set(interaction.user.id, { selectedKeys, createdAt: Date.now() });

      const selectedNames = selectedKeys.map(k => PRODUCT_MAP.get(k)?.name ?? k);
      await interaction.reply({
        content: `✅ Ausgewählt:\n${selectedNames.map(n => `• ${n}`).join("\n")}\n\nDrücke **Bestätigen**, um Mengen einzugeben.`,
        ephemeral: true,
      });
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const [action, rest] = interaction.customId.split(":");
      // order_confirm / order_cancel include ownerId
      if (action === "order_confirm") {
        const ownerId = rest;
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: "❗ Diese Bestellung gehört nicht dir.", ephemeral: true });
          return;
        }
        if (interaction.channel.id !== config.orderChannelId) {
          await interaction.reply({ content: `❗ Bitte bestelle nur in <#${config.orderChannelId}>.`, ephemeral: true });
          return;
        }

        const pending = pendingSelections.get(interaction.user.id);
        const selectedKeys = pending?.selectedKeys ?? [];
        if (!selectedKeys.length) {
          await interaction.reply({ content: "❗ Bitte wähle zuerst mindestens einen Wein aus.", ephemeral: true });
          return;
        }

        // Build quantity modal dynamically (max 5 inputs, here we have max 5 products, perfect)
        const modal = new ModalBuilder()
          .setCustomId(`order_qty_modal:${interaction.user.id}`)
          .setTitle("Mengen eingeben");

        // For each selected item add input
        const rows = [];
        for (const key of selectedKeys) {
          const p = PRODUCT_MAP.get(key);
          if (!p) continue;

          const input = new TextInputBuilder()
            .setCustomId(`qty_${key}`)
            .setLabel(`${p.name} – Menge`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          // Suggest default values
          if (p.founder) {
            input.setPlaceholder("1 (Founder Edition max. 1)");
            input.setValue("1");
          } else {
            input.setPlaceholder("z.B. 1");
            input.setValue("1");
          }

          rows.push(new ActionRowBuilder().addComponents(input));
        }

        modal.addComponents(rows);
        await interaction.showModal(modal);
        return;
      }

      if (action === "order_cancel") {
        const ownerId = rest;
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: "❗ Diese Bestellung gehört nicht dir.", ephemeral: true });
          return;
        }
        pendingSelections.delete(interaction.user.id);

        // disable components on the message
        const msg = interaction.message;
        const disabled = msg.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components = newRow.components.map(c => {
            const comp = c.data?.custom_id ? c : c;
            // safest: rebuild
            if (c.type === 3) { // select menu
              return StringSelectMenuBuilder.from(c).setDisabled(true);
            }
            if (c.type === 2) { // button
              return ButtonBuilder.from(c).setDisabled(true);
            }
            return c;
          });
          return newRow;
        });

        await interaction.update({
          content: "🛑 Bestellung abgebrochen.",
          components: disabled,
        });
        return;
      }

      // Staff accept/reject buttons in processing channel
      if (action === "order_accept" || action === "order_reject") {
        const orderNo = safeInt(rest);
        if (!orderNo) {
          await interaction.reply({ content: "❗ Ungültige Bestellnummer.", ephemeral: true });
          return;
        }

        if (!interaction.inGuild()) {
          await interaction.reply({ content: "❗ Das geht nur im Server.", ephemeral: true });
          return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!isStaff(member)) {
          await interaction.reply({ content: "❗ Du hast keine Berechtigung, Bestellungen zu bearbeiten.", ephemeral: true });
          return;
        }

        const order = getOrderByNo.get(orderNo);
        if (!order) {
          await interaction.reply({ content: "❗ Bestellung nicht gefunden.", ephemeral: true });
          return;
        }
        if (order.status !== "PENDING") {
          await interaction.reply({ content: `ℹ️ Diese Bestellung ist bereits bearbeitet (Status: ${order.status}).`, ephemeral: true });
          return;
        }

        if (action === "order_accept") {
          updateOrderStatus.run({ orderNo, status: "ACCEPTED" });

          const acceptedText = buildCustomerAcceptedText(orderNo);
          await tryDmUser(order.userId, acceptedText);

          // edit processing message: disable buttons + show status
          const embed = EmbedBuilder.from(interaction.message.embeds[0] ?? new EmbedBuilder())
            .setColor(0x57F287)
            .addFields({ name: "Status", value: `✅ Angenommen von <@${interaction.user.id}>`, inline: false });

          await interaction.update({
            embeds: [embed],
            components: [buildProcessingButtons(orderNo, true)],
          });

          return;
        }

        if (action === "order_reject") {
          // open modal to ask for reason
          const modal = new ModalBuilder()
            .setCustomId(`order_reject_reason:${orderNo}`)
            .setTitle(`Ablehnen – Grund eingeben`);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Grund")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("Bitte kurz erklären, warum die Bestellung abgelehnt wird...");

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await interaction.showModal(modal);
          return;
        }
      }
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      const [kind, ownerOrOrder] = interaction.customId.split(":");

      // Customer quantities modal
      if (kind === "order_qty_modal") {
        const ownerId = ownerOrOrder;
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: "❗ Dieses Modal gehört nicht dir.", ephemeral: true });
          return;
        }
        if (interaction.channel.id !== config.orderChannelId) {
          await interaction.reply({ content: `❗ Bitte bestelle nur in <#${config.orderChannelId}>.`, ephemeral: true });
          return;
        }

        const pending = pendingSelections.get(interaction.user.id);
        const selectedKeys = pending?.selectedKeys ?? [];
        if (!selectedKeys.length) {
          await interaction.reply({ content: "❗ Deine Auswahl ist abgelaufen. Bitte `!bestellen` erneut.", ephemeral: true });
          return;
        }

        // read quantities + validate
        const items = [];
        for (const key of selectedKeys) {
          const p = PRODUCT_MAP.get(key);
          if (!p) continue;

          const raw = interaction.fields.getTextInputValue(`qty_${key}`);
          const qty = safeInt(raw);

          if (!qty || qty < 1) {
            await interaction.reply({ content: `❗ Ungültige Menge für **${p.name}**. Bitte gib eine Zahl >= 1 ein.`, ephemeral: true });
            return;
          }

          if (p.founder && qty !== 1) {
            await interaction.reply({ content: `❗ Für **${p.name}** darf nur **1** bestellt werden.`, ephemeral: true });
            return;
          }

          items.push({ key, name: p.name, qty });
        }

        if (!items.length) {
          await interaction.reply({ content: "❗ Keine gültigen Artikel gefunden.", ephemeral: true });
          return;
        }

        const orderNo = generateOrderNo();

        // Store order (pending)
        insertOrder.run({
          orderNo,
          userId: interaction.user.id,
          guildId: interaction.guildId,
          itemsJson: JSON.stringify(items),
          status: "PENDING",
          createdAt: Date.now(),
          processingMessageId: null,
          processingChannelId: null,
        });

        // Send to processing channel
        const processingChannel = await client.channels.fetch(config.processingChannelId).catch(() => null);
        if (!processingChannel || !processingChannel.isTextBased()) {
          await interaction.reply({
            content: "❗ Bearbeitungs-Channel wurde nicht gefunden oder ist nicht textbasiert. Bitte Admin kontaktieren.",
            ephemeral: true,
          });
          return;
        }

        const embed = buildOrderEmbed({ orderNo, userId: interaction.user.id, items })
          .setColor(0x5865F2)
          .addFields({ name: "Status", value: "🕒 Offen", inline: false });

        const msg = await processingChannel.send({
          embeds: [embed],
          components: [buildProcessingButtons(orderNo, false)],
        });

        updateProcessingMessage.run({
          orderNo,
          processingMessageId: msg.id,
          processingChannelId: processingChannel.id,
        });

        pendingSelections.delete(interaction.user.id);

        await interaction.reply({
          content: `✅ Bestellung abgeschickt! Deine Bestellnummer ist **#${orderNo}**.\nDu erhältst eine Nachricht, sobald ein Mitarbeiter sie bearbeitet.`,
          ephemeral: true,
        });

        return;
      }

      // Staff reject reason modal
      if (kind === "order_reject_reason") {
        const orderNo = safeInt(ownerOrOrder);
        if (!orderNo) {
          await interaction.reply({ content: "❗ Ungültige Bestellnummer.", ephemeral: true });
          return;
        }

        if (!interaction.inGuild()) {
          await interaction.reply({ content: "❗ Das geht nur im Server.", ephemeral: true });
          return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!isStaff(member)) {
          await interaction.reply({ content: "❗ Du hast keine Berechtigung, Bestellungen zu bearbeiten.", ephemeral: true });
          return;
        }

        const order = getOrderByNo.get(orderNo);
        if (!order) {
          await interaction.reply({ content: "❗ Bestellung nicht gefunden.", ephemeral: true });
          return;
        }
        if (order.status !== "PENDING") {
          await interaction.reply({ content: `ℹ️ Diese Bestellung ist bereits bearbeitet (Status: ${order.status}).`, ephemeral: true });
          return;
        }

        const reason = interaction.fields.getTextInputValue("reason")?.trim();
        if (!reason) {
          await interaction.reply({ content: "❗ Bitte gib einen Grund ein.", ephemeral: true });
          return;
        }

        updateOrderStatus.run({ orderNo, status: "REJECTED" });

        const rejectedText = buildCustomerRejectedText(orderNo, reason);
        await tryDmUser(order.userId, rejectedText);

        // We need to edit the original processing message.
        // We can fetch it via stored message ID:
        const channel = await client.channels.fetch(order.processingChannelId).catch(() => null);
        if (channel && channel.isTextBased() && order.processingMessageId) {
          const message = await channel.messages.fetch(order.processingMessageId).catch(() => null);
          if (message) {
            const baseEmbed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();
            const embed = baseEmbed
              .setColor(0xED4245)
              .addFields(
                { name: "Status", value: `❌ Abgelehnt von <@${interaction.user.id}>`, inline: false },
                { name: "Grund", value: reason.length > 1024 ? reason.slice(0, 1021) + "..." : reason, inline: false }
              );

            await message.edit({
              embeds: [embed],
              components: [buildProcessingButtons(orderNo, true)],
            });
          }
        }

        await interaction.reply({ content: "✅ Bestellung wurde abgelehnt und der Kunde informiert.", ephemeral: true });
        return;
      }
    }
  } catch (err) {
    console.error(err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: "❗ Ein Fehler ist aufgetreten.", ephemeral: true });
      }
    } catch {}
  }
});

client.once("ready", () => {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
});

client.login(config.token);