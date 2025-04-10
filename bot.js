require("dotenv").config();
const cron = require("node-cron");
const { Client, GatewayIntentBits } = require("discord.js");
const mongoose = require("mongoose");
const Image = require("./models/Image.js");

const APPROVAL_CHANNEL_ID = "1324409075508707358";
const APPROVER_ROLE_ID = "933764897135792168";

// Connect to MongoDB
mongoose
	.connect(process.env.MONGO_URI)
	.then(() => {
		console.log("✅ Connected to MongoDB");
	})
	.catch((err) => {
		console.error("❌ Failed to connect to MongoDB:", err);
	});

// Create Discord client
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
	],
});

// When bot is ready
client.once("ready", () => {
	console.log(`${client.user.tag} is online`);
});

// Handle new messages
client.on("messageCreate", async (message) => {
	// Ignore bot messages
	if (message.author.bot) return;

	const isMentioned = message.mentions.has(client.user);
	const containsSandwich = message.content.toLowerCase().includes("sandwich");
	const gotokitchen = message.content
		.toLowerCase()
		.includes("go back to the kitchen");

	// Sandwich reaction
	if (isMentioned && containsSandwich) {
		await message.reply(":bread:\n:cheese:\n:leafy_green:\n:bread:");
		setTimeout(() => {
			message.channel.send(":palm_up_hand: :sandwich:");
		}, 2000);
		return;
	}

	// Angry kitchen reaction
	if (isMentioned && gotokitchen) {
		await message.reply(":angry:");
		try {
			await message.react("🍅");
		} catch (err) {
			console.error("Failed to tomato react:", err);
		}
		return;
	}

	// Confused fallback
	if (isMentioned) {
		try {
			await message.react("❓");
		} catch (err) {
			console.error("❌ Failed to handle unknown mention:", err);
		}
		return;
	}

	// Only process image messages from the designated channel
	if (message.channel.id !== process.env.CHANNEL_ID) return;

	const images = message.attachments.filter((att) =>
		att.contentType?.startsWith("image")
	);

	if (images.size > 0) {
		const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID);
		if (!approvalChannel || !approvalChannel.isTextBased()) {
			console.error("❌ Could not fetch approval channel");
			return;
		}

		for (const [, image] of images) {
			try {
				// 1. Send image to approval channel
				const approvalMsg = await approvalChannel.send({
					content: `🖼️ Awaiting approval for image:\n${image.url}`,
				});

				// 2. Add reaction
				await approvalMsg.react("✅");

				const filter = (reaction, user) =>
					reaction.emoji.name === "✅" && !user.bot;

				const collected = await approvalMsg
					.awaitReactions({
						filter,
						max: 1,
						time: 1000 * 60 * 60 * 12,
						errors: ["time"],
					})
					.catch(() => null);

				if (collected && collected.size > 0) {
					const reaction = collected.first();
					await reaction.users.fetch(); // Ensure user cache is fresh
					const user = reaction.users.cache.find((u) => !u.bot);

					await Image.create({ url: image.url });
					console.log(
						`✅ Image approved by ${user?.tag}. Saved to DB: ${image.url}`
					);
					await approvalMsg.reply(
						`✅ Approved by ${user?.username}. Image saved!`
					);
				} else {
					await approvalMsg.reply("⏱️ Approval time expired. Image not saved.");
					console.log("⏱️ Approval timed out");
				}
			} catch (err) {
				console.error("❌ Error during image approval flow:", err);
			}
		}
	}
});

// Daily good morning message (10:00 UTC)
cron.schedule(
	"0 10 * * *",
	async () => {
		const channelId = "883628937329147916";
		const channel = await client.channels.fetch(channelId);

		if (!channel) {
			console.error("❌ Could not find the good morning channel");
			return;
		}

		const messages = [
			"Good morning! how is everyone doing today?",
			"Top o' the mornin' to ya!",
			"Hark! Yon sun hath riseth again. 🇬🇧",
			"Arrr matey, wake ye bones! 🏴‍☠️",
			"🫧🫧🫧🫧",
			"hyvää huomenta chat 🇫🇮",
			"おはようチャット (Ohayō chatto) 🇯🇵",
			"God morgon! 🇸🇪",
			"Guten Morgen! 🇩🇪",
			"Доброго ранку! 🇺🇦",
			"Godmorgen! 🇩🇰",
			"Maidin mhaith! 🇮🇪",
			"https://tenor.com/view/jinwoo-sung-wakey-wakey-solo-leveling-anime-gif-7358622451586418114",
			"ITS A NEW DAY TO RISE AND GRIND GAMERS!",
			":yappa: mornin",
			"How's it going chat?",
			"Seize the day!",
		];

		const random = messages[Math.floor(Math.random() * messages.length)];

		try {
			await channel.send(random);
			console.log(`✅ Sent morning message: ${random}`);
		} catch (err) {
			console.error("❌ Failed to send morning message:", err);
		}
	},
	{
		timezone: "Etc/UTC",
	}
);

// Login bot
client.login(process.env.DISCORD_TOKEN);
