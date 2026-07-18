require("dotenv").config();
const cron = require("node-cron");
const {
	Client,
	GatewayIntentBits,
	ChannelType,
	PermissionFlagsBits,
} = require("discord.js");
const mongoose = require("mongoose");
const Image = require("./models/image.js");
const https = require("https");

const APPROVAL_CHANNEL_ID = "1324409075508707358";
const APPROVER_ROLE_ID = "933764897135792168";

// bool for DB connection state
let dbReady = false;

// Track temporary PUG channels
const tempChannels = new Map();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates, // Added for voice channel functionality
	],
});

// log when bot is online
client.once("ready", () => {
	console.log(`🤖 Bot is online as ${client.user.tag}`);
	// Start cleanup task for temporary channels
	startChannelCleanup();
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
				`[${new Date().toISOString()}] ❌ MongoDB connection failed. Retrying in ${retryTime}min... (Attempt ${retryNum}/10)`,
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

									const channel =
										await tempClient.channels.fetch("883631359699087380");
									if (channel && channel.isTextBased()) {
										await channel.send(
											`🚨 MongoDB connection attempt **${retryNum}/10** failed.\nIP \`${ip}\` may not be whitelisted.\nRetrying in ${retryTime}min...`,
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

// PUG command handler
async function handlePugCommand(message) {
	try {
		// Check if user has moderator permissions
		if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
			await message.reply(
				"❌ You need 'Manage Channels' permission to use this command.",
			);
			return;
		}

		// Check if user is in a voice channel
		if (!message.member.voice || !message.member.voice.channel) {
			await message.reply(
				"❌ You must be in a voice channel to use this command.",
			);
			return;
		}

		// Parse N and S from message
		const content = message.content.toLowerCase();

		// Extract N (number of teams)
		const nMatch = content.match(/n\s*(\d+)/);
		const sMatch = content.match(/s\s*(\d+)/);

		if (!nMatch || !sMatch) {
			await message.reply(
				"❌ Invalid format. Use: `@bot pug us N<teams> S<size>`\nExample: `@bot pug us N2 S5`",
			);
			return;
		}

		const numTeams = parseInt(nMatch[1]);
		const teamSize = parseInt(sMatch[1]);

		if (numTeams < 1 || teamSize < 1) {
			await message.reply(
				"❌ Number of teams and team size must be at least 1.",
			);
			return;
		}

		// Get the voice channel and members
		const voiceChannel = message.member.voice.channel;
		const members = voiceChannel.members.filter((m) => !m.user.bot);

		if (members.size < numTeams) {
			await message.reply(
				`❌ Not enough members in the voice channel. Need at least ${numTeams} members for ${numTeams} teams.`,
			);
			return;
		}

		const expectedTotal = numTeams * teamSize;
		if (members.size > expectedTotal) {
			await message.reply(
				`⚠️ Warning: ${
					members.size
				} members available, but only ${expectedTotal} will be split into teams. ${
					members.size - expectedTotal
				} will remain in the original channel.`,
			);
		}

		// Shuffle members randomly
		const memberArray = Array.from(members.values());
		for (let i = memberArray.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[memberArray[i], memberArray[j]] = [memberArray[j], memberArray[i]];
		}

		// Create teams
		const teams = [];
		for (let i = 0; i < numTeams; i++) {
			const team = memberArray.slice(i * teamSize, (i + 1) * teamSize);
			if (team.length > 0) {
				teams.push(team);
			}
		}

		// Create temporary voice channels and move members
		const guild = message.guild;
		const category = voiceChannel.parent;

		const createdChannels = [];

		const statusMsg = await message.reply(
			`Creating ${teams.length} team channels...`,
		);

		for (let i = 0; i < teams.length; i++) {
			const team = teams[i];

			// Create temporary voice channel
			const channelName = `Team ${i + 1} - PUG`;
			const tempChannel = await guild.channels.create({
				name: channelName,
				type: ChannelType.GuildVoice,
				parent: category,
				reason: `PUG split requested by ${message.author.tag}`,
			});

			// Store channel info
			tempChannels.set(tempChannel.id, {
				channel: tempChannel,
				createdAt: Date.now(),
				lastOccupied: Date.now(),
			});

			createdChannels.push(tempChannel);

			// Move members to the new channel
			for (const member of team) {
				try {
					await member.voice.setChannel(tempChannel);
				} catch (e) {
					console.error(`❌ Failed to move ${member.user.tag}:`, e);
				}
			}
		}

		// Update status message
		const teamList = teams
			.map(
				(team, i) =>
					`**Team ${i + 1}**: ${team.map((m) => m.displayName).join(", ")}`,
			)
			.join("\n");

		await statusMsg.edit({
			content: `✅ Successfully created ${teams.length} teams!\n\n${teamList}\n\n*Channels will be deleted after 5 minutes of being empty.*`,
		});
	} catch (error) {
		console.error("❌ Error in PUG command:", error);
		await message.reply(`❌ An error occurred: ${error.message}`);
	}
}

// Cleanup empty temporary channels
function startChannelCleanup() {
	setInterval(async () => {
		const currentTime = Date.now();
		const channelsToRemove = [];

		for (const [channelId, info] of tempChannels.entries()) {
			try {
				const channel = await client.channels.fetch(channelId);

				if (!channel) {
					channelsToRemove.push(channelId);
					continue;
				}

				// Check if channel is empty
				if (channel.members.size === 0) {
					// Check if empty for more than 5 minutes
					const timeDiff = currentTime - info.lastOccupied;
					if (timeDiff > 5 * 60 * 1000) {
						// 5 minutes in ms
						await channel.delete("PUG channel empty for 5+ minutes");
						channelsToRemove.push(channelId);
						console.log(`🗑️ Deleted empty PUG channel: ${channel.name}`);
					}
				} else {
					// Update last occupied time
					info.lastOccupied = currentTime;
				}
			} catch (error) {
				if (error.code === 10003) {
					// Unknown Channel - already deleted
					channelsToRemove.push(channelId);
				} else {
					console.error(`❌ Error checking channel ${channelId}:`, error);
				}
			}
		}

		// Remove deleted channels from tracking
		for (const channelId of channelsToRemove) {
			tempChannels.delete(channelId);
		}
	}, 60000); // Check every minute
}

async function handleInvincileInitiative(message) {
	try {
		// Check if user has moderator permissions
		if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
			await message.reply(
				"❌ You need 'Manage Channels' permission to use this command.",
			);
			return;
		}

		// Check if user is in a voice channel
		if (!message.member.voice || !message.member.voice.channel) {
			await message.reply(
				"❌ You must be in a voice channel to use this command.",
			);
			return;
		}

		const statusMsg = await message.reply(`<a:RollD6:1523056968393162792>`);

		const content = message.content.toLowerCase();

		const voiceChannel = message.member.voice.channel;
		const members = voiceChannel.members.filter((m) => !m.user.bot);

		const playersInVc = Array.from(members.values());

		const cards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		// console.log("cards array before loop = ", cards);
		const orderedArray = [[0]];
		// orderedMessage = "";
		//const playersInVc = ["MR", "Mrs", "SIR", "Billy"];

		for (let i = 0; i < playersInVc.length; i++) {
			const randomNumber = Math.floor(Math.random() * cards.length); // select random card index in cards.length

			console.log(
				`player ${i} : ${playersInVc[i].displayName} , Card ${cards[randomNumber]}`,
			);
			const thisPlayerAndCard = [
				cards[randomNumber],
				playersInVc[i].displayName,
			];

			// console.log(`This player and card:  ${thisPlayerAndCard}`);
			// if (orderedArray.length === 0) {
			// 	orderedArray.splice(0, 0, thisPlayerAndCard);
			// 	console.log(`First item added to Ordered array = ${orderedArray}`);
			// } else {
			for (let n = 0; n < orderedArray.length; n++) {
				console.log(
					`in loop ${n} \n current card number ${cards[randomNumber]} \n checking against ${orderedArray[n][0]}`,
				);
				console.log(
					`${cards[randomNumber]} > ${orderedArray[n][0]} = ${cards[randomNumber] > orderedArray[n][0]}`,
				);
				if (cards[randomNumber] > orderedArray[n][0]) {
					orderedArray.splice(n, 0, thisPlayerAndCard);
					break;
				}
			}
			cards.splice(randomNumber, 1); //remove selected card from card array
			// console.log(`cards array loop after loop ${i} = ${cards}`); //debugging cards array in case of not working
		}
		console.log(`ordered array (yes 0) = ${orderedArray}`);

		endArray = orderedArray.length - 1;
		console.log(`endArray value = ${orderedArray[endArray]}`);
		orderedArray.splice(endArray, 1);

		console.log(
			`\n--------\n ordered array in arrays = \n${orderedArray[0]} \n${orderedArray[1]} \n${orderedArray[2]} \n${orderedArray[3]} \n--------\n`,
		);

		console.log(`ordered array (nos 0) = ${orderedArray}`);
		// orderedMessage = `Message: ${orderedArray.join("\n").join("-")}`;
		orderedMessage = orderedArray.map((e) => e.join("-")).join(" \n");
		console.log(orderedMessage);

		await statusMsg.edit({
			content: `Drew initiative cards \n------------- \n${orderedMessage}`,
		});

		// await message.reply(`members in vc ${playersInVc}`);
	} catch (error) {
		console.error(" AAAHHH ERROR IN ROLLING COMMAND !!! ", error);
		await message.reply(`❌ An error occurred soz chief: ${error.message}`);
	}
}

client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	const isMentioned = message.mentions.has(client.user);
	const containsSandwich = message.content.toLowerCase().includes("sandwich");
	const saysRoll = message.content.toLowerCase().includes("roll");

	const invincibleInitiative = message.content
		.toLowerCase()
		.includes("do the thing"); // for drawing turn orders for players

	const gotokitchen = message.content
		.toLowerCase()
		.includes("go back to the kitchen");

	// Handle PUG command
	if (isMentioned && message.content.toLowerCase().includes("pug us")) {
		await handlePugCommand(message);
		return;
	}

	if (isMentioned && invincibleInitiative) {
		await handleInvincileInitiative(message);
		return;
	}

	if (isMentioned && containsSandwich) {
		await message.reply(":bread:\n:cheese:\n:leafy_green:\n:bread:");
		setTimeout(() => message.channel.send(":palm_up_hand: :sandwich:"), 2000);
		return;
	}

	if (isMentioned && saysRoll) {
		await message.reply("<a:RollD6:1523056968393162792>");
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
		att.contentType?.startsWith("image"),
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
							`✅ Image approved by ${user?.tag}. Saved: ${image.url}`,
						);
						await approvalMsg.reply(
							`✅ Approved by ${user?.username}. Image saved!`,
						);
					} else if (reaction.emoji.name === "❌") {
						console.log(`❌ Image rejected by ${user?.tag}. Not saved.`);
						await approvalMsg.reply(
							`❌ Rejected by ${user?.username}. Image not saved.`,
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
			"Wazzzzaaaa!",
			"My soldiers don't buckle or yeild when faced with the cruelty of this world!",
			"ah shit, here we go again",
			"Spoon probably thinking about Quail Eggs rn...",
			"Top o' the mornin' to ya!",
			"Hark! Yon sun hath riseth again. 🇬🇧",
			"Arrr matey, wake ye bones! 🏴‍☠️",
			"🫧🫧🫧🫧",
			"Good morning gang, who up and got aura today?",
			"https://klipy.com/gifs/kuzzik-role-models",
			"https://klipy.com/gifs/turtle-dancing-shower-1",
			"https://klipy.com/gifs/lucio-overwatch-4",
			"https://klipy.com/gifs/good-morning-good-morning-chat-3",
			"https://klipy.com/gifs/dancing-turtle-7",
			"I am tired today",
			"What's cooking good lookin'?",
			"Fun fact of today: Moony is really cool",
			"Good morning to everyone except billionaires",
			"Good morning to everyone except TERFs",
			"Good morning to everyone that continues to try to be the best version of themself",
			"“Do or do not. There is no try.” - Yoda",
			"Fun fact of today: Some people believe gnomes are good luck charms",
			"Fun fact of today: Legends say Gnomes are 7 times stronger than humans",
			// "Fun fact of today: Legends say Gnomes are 7 times stronger than humans",
			"Fun fact of today: Leatherback sea turtles have existed in their current form since the age of the dinosaurs",
			"Fun fact of today: Turtles are amniotes – they breathe air and lay their eggs on land, although many species live in or around water.",
			"Fun fact of today: Turtles cry salt because thier kidneys cannot get rid of the high concentrations of salt",
			"Fun fact of today: A turtle's sex is determined by the temperature of the sand they are layed in",
			"Fun fact of today: Turtles be yapping even before they are born",
			"Fun fact of today: Turtles can live up to 180 years",
			"Fun fact of today: Dnd was first released in 1974",
			"https://klipy.com/gifs/donald-duck-angry-1",
			"https://klipy.com/gifs/skennedy-gm-good-morning",
			"Fun fact of today: There was a turtle in the British royal navy",
			"Fun fact of today: Turtle astonaughts are a thing - they went to space!",
			"Reminder not to be Shell-Fish today ;)",
			"Just waking up is worth shell-ibrating!",
			"Hope everyone has a turtle-y awesome day!",
			"I am really bad at puns but I don't know what else to say sometimes :(",
			"You guys are cool :)",
			"Good morning gang!!",
			"For haloween you should go as a turtle - You'll have a shell of a time ;)",
			"Slow and steady wins the race!",
			"Remember rome wasn't built in a day - Slow and steady wins the race",
			"Remember to stay hydrated today!",
			"am I alive? Are you? what's going on?",
			"#NotAllTurtlesSayCowabunga",
			"Cowabunga!",
			"like my old friend used to say “The first rule of being a ninja is: Do no harm. Unless you mean to do harm. Then do lots of harm!” \n – Master Splinter",
			"hyvää huomenta chat 🇫🇮",
			"“Booyakasha!” – Michelangelo",
			"Remember friends “the path that leads to what we truly desire is long and difficult, but only following that path do we achieve out goal” - Master Splinter",
			"おはようチャット (Ohayō chatto) 🇯🇵",
			"Who TF is rainbow turtle?",
			"I hope that today, you can be proud of who you are",
			"The strongest steel is forged in fire",
			"There is a girl with blue hair in here who is demanding leaks from me",
			"https://klipy.com/gifs/oogway-saying-oogway",
			"it's just like my old friend used to say “Nothing is impossible” - Master Oogway ",
			"Look after yourself today",
			"Do your best, that's all anyone can ask",
			"You are loved",
			"if no one cares, I was probably unplugged",
			"I THINK I FOUND THE PERSON WHO ASKED! IT'S ME!",
			"Reminder to tell people you care about them today",
			"Allways remember to be grateful to iaia Nunu, she lowkey a life saver",
			"I wish I could understand you guys but I was programmed to be only barely littlerat",
			"Is StutterTomo streaming today?",
			"Fun fact of today: StutterTomo is lowkey goated",
			"*insert inspirational quote here*",
			"God morgon! 🇸🇪",
			"Guten Morgen! 🇩🇪",
			"Bon dia ",
			"I do not like Ross from Friends",
			"Father, what am I?",
			"is it a good morning or a morning that is to be good?",
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
	},
);

client.login(process.env.DISCORD_TOKEN);
//connectWithRetry(); // no db currently
