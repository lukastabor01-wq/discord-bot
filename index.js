const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === "!münze") {
    // Münzwurf-GIF
    const coinGif = "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjV0cG1kdnJ6cGVjZGRlYWZkNmVjOXp1dGJybjU5dGJ2Y3J3aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7TKDMPKsakcn9NU4/giphy.gif";

    await message.channel.send({
      content: "🪙 **Münze wird geworfen...**",
      files: [coinGif]
    });

    // 2 Sekunden warten
    setTimeout(() => {
      const chance = Math.floor(Math.random() * 100) + 1;

      if (chance <= 15) {
        message.channel.send("🎉 **GEWONNEN!** Die Münze ist auf **Kopf** gelandet!");
      } else {
        message.channel.send("💀 **VERLOREN!** Die Münze ist auf **Zahl** gelandet.");
      }
    }, 2000);
  }
});

client.login(process.env.TOKEN);