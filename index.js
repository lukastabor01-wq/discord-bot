client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!münze" || message.content === "!muenze") {
    const ergebnis = Math.random() < 0.5 ? "🪙 Kopf" : "🪙 Zahl";
    message.reply(`Die Münze wird geworfen…\nErgebnis: **${ergebnis}**`);
  }
});