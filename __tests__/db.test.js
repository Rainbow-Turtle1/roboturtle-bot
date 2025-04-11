jest.setTimeout(30000);
require("dotenv").config();
const mongoose = require("mongoose");
const Image = require("../models/image");

describe("MongoDB Image Model", () => {
	const testUrl = "https://test-db.com/image.jpg";

	beforeAll(async () => {
		await mongoose.connect(process.env.MONGO_URI);
	});

	afterAll(async () => {
		await mongoose.connection.close();
	});

	it("should connect to MongoDB", async () => {
		expect(mongoose.connection.readyState).toBe(1);
	});

	it("should write an image to the database", async () => {
		const img = await Image.create({ url: testUrl });
		expect(img).toHaveProperty("_id");
		expect(img.url).toBe(testUrl);
	});

	it("should read an image from the database", async () => {
		const found = await Image.findOne({ url: testUrl });
		expect(found).not.toBeNull();
		expect(found.url).toBe(testUrl);
	});

	it("should delete an image from the database", async () => {
		await Image.deleteOne({ url: testUrl });
		const deleted = await Image.findOne({ url: testUrl });
		expect(deleted).toBeNull();
	});
});
