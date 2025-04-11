require("dotenv").config();
const cron = require("node-cron");
const { Client, GatewayIntentBits } = require("discord.js");
const mongoose = require("mongoose");
const Image = require("./models/image.js");
const https = require("https");

const APPROVAL_CHANNEL_ID = "1324409075508707358";
const APPROVER_ROLE_ID = "933764897135792168";

// bool for DB connection state
let dbReady = false;

// const dns = require("dns");
// dns.resolve4("cluster0.vtgmyui.mongodb.net", (err, addresses) => {
// 	if (err) console.error("cluster0 DNS lookup failed:", err);
// 	else console.log("cluster0 resolved to:", addresses);
// });

// dns.resolve4("ac-2nz0mgn-shard-00-00.vtgmyui.mongodb.net", (err, addresses) => {
// 	if (err) console.error("shard DNS lookup failed:", err);
// 	else console.log("shard hostname resolved to:", addresses);
// });

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
	],
});

// log when bot is online
client.once("ready", () => {
	console.log(`🤖 Bot is online as ${client.user.tag}`);
});

// DB connection with retry - incase of IP address changes that may stop it being allowed to access DB
async function connectWithRetry(retries = 10, delay = 180000) {
	let lastAlertedIP = null;

	while (retries > 0) {
		try {
			await mongoose.connect(process.env.MONGODB_URI);
			console.log("✅ Connected to MongoDB");
			dbReady = true;

			try {
				const tempClient = new Client({
					intents: [GatewayIntentBits.Guilds],
				});
				await tempClient.login(process.env.DISCORD_TOKEN);

				const channel = await tempClient.channels.fetch("883631359699087380");
				if (channel && channel.isTextBased()) {
					await channel.send("✅ Successfully connected to MongoDB.");
					console.log("📣 Success alert sent to Discord.");
				}
				await tempClient.destroy();
			} catch (e) {
				console.error("⚠️ Failed to send success message:", e);
			}

			break;
		} catch (err) {
			retries--;
			const retryNum = 10 - retries;
			const retryTime = delay / 60000;

			console.warn(
				`[${new Date().toISOString()}] ❌ MongoDB connection failed. Retrying in ${retryTime}min... (Attempt ${retryNum}/10)`
			);

			// log current IP and alert log
			await new Promise((resolve, reject) => {
				https
					.get("https://api.ipify.org", (res) => {
						let ip = "";
						res.on("data", (chunk) => (ip += chunk));
						res.on("end", () => {
							(async () => {
								console.log(`🌐 Current Render IP: ${ip}`);

								try {
									const tempClient = new Client({
										intents: [GatewayIntentBits.Guilds],
									});
									await tempClient.login(process.env.DISCORD_TOKEN);

									const channel = await tempClient.channels.fetch(
										"883631359699087380"
									);
									if (channel && channel.isTextBased()) {
										await channel.send(
											`🚨 MongoDB connection attempt **${retryNum}/10** failed.\nIP \`${ip}\` may not be whitelisted.\nRetrying in ${retryTime}min...`
										);
										console.log("📣 Retry alert sent to Discord.");
									}

									await tempClient.destroy();
									lastAlertedIP = ip;
								} catch (e) {
									console.error("❌ Failed to send retry alert:", e);
								}

								resolve();
							})();
						});
					})
					.on("error", reject);
			});

			if (retries === 0) {
				console.error("Could not connect after final retry. Exiting...");
				process.exit(1);
			}

			await new Promise((res) => setTimeout(res, delay));
		}
	}
}

client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	const isMentioned = message.mentions.has(client.user);
	const containsSandwich = message.content.toLowerCase().includes("sandwich");
	const gotokitchen = message.content
		.toLowerCase()
		.includes("go back to the kitchen");

	if (isMentioned && containsSandwich) {
		await message.reply(":bread:\n:cheese:\n:leafy_green:\n:bread:");
		setTimeout(() => message.channel.send(":palm_up_hand: :sandwich:"), 2000);
		return;
	}

	if (isMentioned && gotokitchen) {
		await message.reply(":angry:");
		try {
			await message.react("🍅");
		} catch (err) {
			console.error("❌ Failed to tomato react:", err);
		}
		return;
	}

	if (isMentioned) {
		try {
			await message.react("❓");
		} catch (err) {
			console.error("❌ Failed to react to unknown mention:", err);
		}
		return;
	}

	if (!dbReady) return; // if no DBconnection skip DB-dependent logic to stop errors

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
				const approvalMsg = await approvalChannel.send({
					content: `🖼️ Awaiting approval for image:\n *Approval Criteria:*\n - the photo is of somethign that is considered a pet \n it does not show anything that might be personal information (address information, bank information, real name information etc) \n - image does not contain anything against server rules\n ${image.url}`,
				});

				await approvalMsg.react("✅");
				await approvalMsg.react("❌");

				const filter = (reaction, user) =>
					["✅", "❌"].includes(reaction.emoji.name) && !user.bot;

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
					await reaction.users.fetch();
					const user = reaction.users.cache.find((u) => !u.bot);

					if (reaction.emoji.name === "✅") {
						await Image.create({ url: image.url });
						console.log(
							`✅ Image approved by ${user?.tag}. Saved: ${image.url}`
						);
						await approvalMsg.reply(
							`✅ Approved by ${user?.username}. Image saved!`
						);
					} else if (reaction.emoji.name === "❌") {
						console.log(`❌ Image rejected by ${user?.tag}. Not saved.`);
						await approvalMsg.reply(
							`❌ Rejected by ${user?.username}. Image not saved.`
						);
					}
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

// Daily good morning message at 8 am server time
cron.schedule(
	"0 8 * * *",
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

client.login(process.env.DISCORD_TOKEN);
connectWithRetry(); // background process
