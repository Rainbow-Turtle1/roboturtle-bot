# RoboTurtle Bot – Discord Image Archiver

## Solution Overview

RoboTurtle is a Discord bot intended to work to boost community engagement for the streamer Rainbow_turtle1. The bot has a number of fun features that were added at the request of members of the discord server. Its primary purpose is to collect, archive, and expose shared image content from a pet photos discord channel via a secure API. It forms the backend and service layer of a full-stack image display platform, integrating with a web frontend to showcase the collected media.

The application was built to be a scalable, secure, and robust architecture by connecting a Discord bot, a Node.js Express server, and a MongoDB database with test coverage, deployment pipelines.

## Project Aim & Objectives

### Main Goal

To build a backend service that takes in image content from Discord, requests a manual check from discord moderators, to ensure images are appropriate, stores approved images securely in a remote database, and then provides access via an integrated API to allow secure access of images from a web hosted frontend.

Frontend repo: https://github.com/Rainbow-Turtle1/PetConveyerbeltSite

### Key Objectives

- Automate ingestion of images from Discord channels.
- Authenticate images with discord moderators.
- Store authenticated images metadata in MongoDB.
- Expose a secure, performant API for frontend consumption.
- Incorporate robust error handling and validation.
- Include automated tests and GitHub Actions CI pipeline to ensure that updates will have minor impacts to performance.

## Enterprise Considerations

### Performance

- Optimized image payload handling using arraybuffer to limit memory spikes.
- Does not transfer full files but uses URLs to allow dynamic changing of images without impacting load times and complexity.
- Cursor-based image retrieval with capped responses (max 30 images per call).

### Scalability

- Stateless service using Express.js and MongoDB Atlas, ready to scale horizontally.
- Separation between image input, storage, and API delivery.
- Built with the ability to add API rate-limiting with minimal changes.
- Cloud based hosting services used to allow for increased capacity if needed in future.

### Robustness

- Automated retry/resume when reconnecting to Discord after starting.
- Fallback and validation when handling malformed messages or uploads.
- Tests via Jest and GitHub Actions CI to ensure reliability and robustness.

### Security

- All environment variables are managed using .env files and secrets.
- Discord bot token, MongoDB credentials, and testing credentials are all hidden from source for increased protection.
- Restricting access to MongoDB to only approved IP addresses to safeguard database.

## Cloud Deployment

This repo is deployed to two instances of Render to allow automatic deployment of new features and updates.

- The bot is deployed as a background worker, to allow the bot to be available 24/7 with limited downtime between deployments.
- The api is deployed as a web service to allow it to listen across open ports for requests.
- CI/CD pipeline addition via GitHub Actions ensures test runs on push/PRs.

## Installation & Usage Instructions

### Prerequisites

- Node.js v20+
- MongoDB Atlas database  
  - Need IP to be added to the Network access list.  
  - User with read and write permissions.  
  - URI to connect as that user.
- Discord Bot Token
- Access to Moderator Channels in discord server

> These instructions assume that you are using a bash terminal

### Setup Steps

**Clone the repo**

```bash
git clone https://github.com/Rainbow-Turtle1/roboturtle.git
cd roboturtle
```
**Install dependencies
**
```bash
npm install
```
**Configure environment
**
Create a .env file in the root directory:
```
DISCORD_TOKEN=your_discord_bot_token
MONGO_URI=your_mongodb_connection_string
TEST_URI=your_test_db_connection_string
CHANNEL_ID=your_discord_channel–<the one you wish to be monitored>
PORT=5000
```

**Run Locally**
```npm start```

**Run tests**
```npm test```
_Unfortunately due to the nature of the discord bot it can only be tested manually.
In addition to this in order to allow testing of the database access the user must have their IP whitelisted and if using github actions to test then the user must enable access from any IP on the database temporarily._


## Feature Overview

### Discord Bot Listener

**Purpose:**  
Listens for image messages in a designated Discord channel and forwards them for storage after a manual moderator check.

**Code Location:**  
`bot.js` – Main bot logic.

- Utilizes Discord.js v14 to handle incoming messages, filter image attachments, and interact with channels.

---

### Image API

**Purpose:**  
Provides a REST API for retrieving stored images for the frontend application.

**Code Location:**  
- `server.js` – Contains the Express app and route logic.  
- `models/image.js` – Defines the Mongoose schema for storing image metadata.

**Endpoints:**
- `GET /api/images`: Returns up to 30 of the most recent approved images.
- `GET /api/images?cursor=<id>`: Enables paginated access to older images.

---

### MongoDB Integration

**Purpose:**  
Stores the validated image URLs and timestamp.

**Code Location:**  
`models/image.js` – Defines schema:

```js
{
  url: String,
  date: Date
}
```
## Database Collections

- `discord_images.images`: Collection for production data.
- `test.images`: Separated collection for testing.

---

## Continuous Integration with GitHub Actions

**Purpose:**  
Ensures updates to code do not break key functionality before merge/push to main.

**Code Location:**  
`.github/workflows/test.yml` – CI pipeline triggered on push to main/master.

**Configuration Highlights:**
- Secure usage of GitHub Secrets to inject environment variables.
- Runs Jest tests.

---

## Testing

**Purpose:**  
Validates that the key behaviors of the bot and API are functional.

**Code Location:**
- `__tests__/db.test.js` – Tests database write and delete operations.
- `__tests__/api.test.js` – Tests image API responses and pagination logic.

---

## Known Issues & Future Enhancements

- **Image URL Expiry:** Some Discord-hosted image URLs may expire over time. This could be mitigated by downloading and serving images from cloud storage in a future version.
- **Manual Moderation Flow:** Currently approvals are not automated. This means it relies on human discord moderators to screen content. An AI image recognition model could be used to approve images in future.
- **Rate Limiting:** API rate limiting not yet implemented. This would be important if endpoints were experiencing high-traffic usage.
- **Duplicate Detection:** No hashing or comparison is currently done to prevent duplicate image entries. I intended to add this however fell short on time.

---

## References

- [Discordjs.guide](https://discordjs.guide/)  
  Used to interact with the Discord API and create the bot’s functionality.

- [Express.js](https://expressjs.com)  
  Used to create the REST API and handle HTTP requests in the service layer.

- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)  
  Hosted cloud database solution used for storing image metadata securely.

- [Mongoose](https://mongoosejs.com)  
  ODM used to interact with MongoDB using schema-based models.

- [Axios](https://axios-http.com)  
  Used for making HTTP requests to fetch image data during proxying.

- [Jest](https://jestjs.io)  
  Used for unit and integration testing of the service layer and database logic.

- [Render](https://render.com)  
  Cloud platform used to host both the API and the bot worker.

- [GitHub Actions](https://github.com/features/actions)  
  CI/CD tool used to automatically test and deploy the application on code changes.

- [dotenv](https://www.npmjs.com/package/dotenv)  
  Manages environment variables for secure configuration.

- [Node.js](https://nodejs.org)  
  JavaScript runtime used for developing both the bot and API server.
