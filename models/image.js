const mongooes = require("mongoose");

const imageSchema = new mongooes.Schema({
	url: String,
	timestamp: { type: Date, default: Date.now },
});

const mongoose = require("mongoose");
