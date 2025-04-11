jest.setTimeout(30000);
require("dotenv").config();
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const Image = require("../models/image");
const app = express();

app.use(express.json());
app.get("/api/images", async (req, res) => {
	const images = await Image.find().sort({ timestamp: -1 }).limit(30);
	res.json(images);
});

describe("GET /api/images", () => {
	beforeAll(async () => {
		await mongoose.connect(process.env.TEST_URI);
		await Image.create({ url: "http://example.com/image.jpg" });
	});

	afterAll(async () => {
		await mongoose.connection.close();
	});

	it("should return image array", async () => {
		const res = await request(app).get("/api/images");
		expect(res.statusCode).toBe(200);
		expect(res.body.length).toBeGreaterThan(0);
		expect(res.body[0]).toHaveProperty("url");
	});

	it("should return a maximum of 30 images", async () => {
		await Image.deleteMany();
		const dummyImages = Array.from({ length: 35 }, (_, i) => ({
			url: `https://image${i}.jpg`,
			timestamp: new Date(),
		}));
		await Image.insertMany(dummyImages);

		const res = await request(app).get("/api/images");
		expect(res.body.length).toBeLessThanOrEqual(30);
	});
});
