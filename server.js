require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const Image = require("./models/Image");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(express.json());

if (!MONGO_URI) {
	console.error("MONGO_URI is not defined. Please set it in the .env file.");
	process.exit(1);
}
mongoose.set("debug", true);

mongoose.connect(process.env.MONGO_URI);

// mongoose.connect(MONGO_URI)
//   .then(() => console.log('Connected to Mongo DB'))
//   .catch(err => {
//     console.error('API DB connection error:', err);
//     process.exit(1);
//   });

app.get("/", (req, res) => {
	res.send("Hello, World!");
});

app.get("/api/images", async (req, res) => {
	try {
		const images = await Image.find().sort({ timestamp: -1 }).limit(30); // latest 30
		res.json(images);
	} catch (err) {
		console.error("❌ Failed to fetch images:", err);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

app.listen(PORT, () => {
	console.log(`🚀 API server running at http://localhost:${PORT}`);
});
