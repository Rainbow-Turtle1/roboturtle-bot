require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const Image = require("./models/image.js");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const cors = require("cors");

app.use(cors());
app.use(express.json());

// Check for MONGO_URI
if (!MONGO_URI) {
	console.error("❌ MONGO_URI is not defined. Please set it in the .env file.");
	process.exit(1);
}

// Connect to DB
mongoose.set("debug", true);
mongoose
	.connect(MONGO_URI)
	.then(() => console.log("✅ API connected to MongoDB"))
	.catch((err) => {
		console.error("❌ API DB connection error:", err);
		process.exit(1);
	});

//  route
app.get("/", (req, res) => {
	res.send("📡 Roboturtle API is online.");
});

// Endpoint - latest 30 images
app.get("/api/images", async (req, res) => {
	try {
		const images = await Image.find().sort({ timestamp: -1 }).limit(30);
		res.json(images);
	} catch (err) {
		console.error("❌ Failed to fetch images:", err);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

//server
app.listen(PORT, () => {
	console.log(`🚀 API server running at http://localhost:${PORT}`);
});
