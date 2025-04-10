const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
	url: String,
	timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Image", imageSchema);
