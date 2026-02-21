const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_TOKEN;

// 🔧 IDs ANPASSEN
const ORDER_CHANNEL_ID = "1473039686355390525";
const STAFF_CHANNEL_ID = "1474089272054120580";
const STAFF_ROLE_ID = "1473195959247831170";

// 🍷 Weine
const WEINE = [
  "44s No I Blanc Elegance",
  "44s No II Rose Prive",
  "44s No III Rouge Signature",
  "44s No IV Reserve Noire",
  "44s Founder Edition"
];

client.once("ready", () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
});

// 🛒 !bestellen
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content !== "!bestellen") return;
  if (message.channel.id !== ORDER_CHANNEL_ID) return;

  const modal = new ModalBuilder()
    .setCustomId("order_modal")
    .setTitle("🍷 Wein bestellen");

  const wineInput = new TextInputBuilder()
    .setCustomId("wine")
    .setLabel("Welcher Wein?")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("z.B. 44s No I Blanc Elegance")
    .setRequired(true);

  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Menge")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("z.B. 3")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(wineInput),
    new ActionRowBuilder().addComponents(amountInput)
  );

  await message.channel.send({
    content: "📋 **Bestellformular öffnen:**",
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("open_order")
          .setLabel("Bestellen")
          .setStyle(ButtonStyle.Primary)
      )
    ]
  });

  client.once(Events.InteractionCreate, async (i) => {
    if (!i.isButton()) return;
    if (i.customId === "open_order") {
      await i.showModal(modal);
    }
  });
});

// 📩 Modal abgeschickt
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "order_modal") return;

  const wine = interaction.fields.getTextInputValue("wine");
  const amount = interaction.fields.getTextInputValue("amount");
  const orderId = Math.floor(Math.random() * 1_000_000_000);

  const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${interaction.user.id}_${orderId}`)
      .setLabel("✅ Annehmen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deny_${interaction.user.id}_${orderId}`)
      .setLabel("❌ Ablehnen")
      .setStyle(ButtonStyle.Danger)
  );

  await staffChannel.send({
    content:
      `🧾 **Neue Bestellung**\n\n` +
      `👤 Kunde: ${interaction.user.tag}\n` +
      `🍷 Wein: **${wine}**\n` +
      `📦 Menge: **${amount}**\n` +
      `🔢 Bestellnummer: **${orderId}**`,
    components: [buttons]
  });

  await interaction.reply({
    content: "✅ Deine Bestellung wurde übermittelt.",
    ephemeral: true
  });
});

// ✅ / ❌ Buttons
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const member = interaction.member;
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({
      content: "❌ Keine Berechtigung.",
      ephemeral: true
    });
  }

  const [action, userId, orderId] = interaction.customId.split("_");
  const user = await client.users.fetch(userId);

  if (action === "accept") {
    await user.send(
      `✅ **Bestellung angenommen**\n\n` +
      `🔢 Bestellnummer: **${orderId}**\n` +
      `Ein Mitarbeiter meldet sich bei dir.`
    );
    await interaction.update({ content: "✅ Bestellung angenommen.", components: [] });
  }

  if (action === "deny") {
    await user.send(
      `❌ **Bestellung abgelehnt**\n\n` +
      `🔢 Bestellnummer: **${orderId}**\n` +
      `Grund: Bestellung konnte aktuell nicht bearbeitet werden.`
    );
    await interaction.update({ content: "❌ Bestellung abgelehnt.", components: [] });
  }
});

client.login(TOKEN);