# UTU - Discord OwO Utility Bot

UTU is a TypeScript-powered Discord bot that brings uwu-energy to your server with playful slash commands and scalable utilities. The project ships with a counting-channel automation that keeps your owo streaks alive.

## Features
- `/owo` command to owoify any message with a sprinkle of randomness
- `/ping` command for quick health checks and latency reporting
- Counting channel automation that validates posts, relays them via channel-specific webhooks, rotates leaderboards, and automatically grows goals by 5% once each target is met (respecting manual overrides)

## Prerequisites
- Node.js 18.17 or newer
- A Discord application with a bot user (create one via the [Discord Developer Portal](https://discord.com/developers/applications))
- Access to a MongoDB instance (local or hosted)

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in the required values:
     - `DISCORD_TOKEN`: Bot token from the Developer Portal
     - `DISCORD_CLIENT_ID`: Application client ID
     - `DISCORD_GUILD_ID` *(optional)*: Development guild ID for faster slash-command iterations
     - `LOG_LEVEL`: Logging verbosity (`error`, `warn`, `info`, `debug`)
     - `DATABASE_URL`: MongoDB connection string (e.g. `mongodb://localhost:27017/utu`)
     - `COUNTING_CHANNELS`: Semicolon-separated list using `channelId|webhookUrl|optionalStartingGoal`
       - Example: `COUNTING_CHANNELS=123|https://discord.com/api/webhooks/...|500;456|https://discord.com/api/webhooks/...`
     - Legacy fallback: `COUNTING_CHANNEL_ID` and `COUNTING_WEBHOOK_URL` are still supported if `COUNTING_CHANNELS` is not set
     - `ENABLE_HEALTH_SERVER` *(optional)*: Start the lightweight HTTP health endpoint (recommended for Replit).
     - `HEALTH_SERVER_PORT` and `HEALTH_SERVER_HOST` *(optional)*: Override the port and host the health endpoint should use.

## Counting Channel Utility
- Users must post in configured counting channels using the format `owo <number>` (case-insensitive)
- The bot enforces sequential numbers, deletes invalid attempts, and privately DMs a friendly reminder that can be dismissed once read
- Valid entries are reposted through the channel's configured webhook so every counting channel can keep its own branding
- Channel name and topic update to reflect the newest count, progress toward the goal, and a leaderboard (10 users per page, rotating each update)
- Goals grow automatically: once a target is reached, the next goal becomes the previous goal plus 5%
- Manual goal overrides persist: set a new target (via future commands or direct DB updates) and the auto-growth resumes using that baseline after completion
- Counting progress and leaderboard data persist in MongoDB collections created on startup

## Deploying Slash Commands
Run the deployment script whenever you add or modify commands:
```bash
npm run deploy:commands
```
- With `DISCORD_GUILD_ID` set, commands update instantly on that guild.
- Without `DISCORD_GUILD_ID`, commands register globally and can take up to an hour to propagate.

## Running the Bot
- **Production build**
  ```bash
  npm run build
  npm run start:prod
  ```
  `npm run start` remains available if you prefer a one-step build-and-run command.
- **Development mode** (compiles on the fly)
  ```bash
  npm run start:dev
  ```

The bot will connect to Discord, ensure database tables exist, and monitor each configured counting channel.

## Hosting on Replit
The repo ships with `.replit` and `replit.nix` so you can import it directly into a Replit workspace.

1. Create a new Replit by linking this repository.
2. Add the required secrets via the *Secrets* tab (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, optional `DISCORD_GUILD_ID`, `DATABASE_URL`, and your counting-channel variables).
3. Keep `ENABLE_HEALTH_SERVER` set to `true` so Replit's HTTP pings keep the bot session alive while the workspace is open.
4. Use the shell to run `npm run deploy:commands` whenever you change slash commands.

> Replit free-tier workspaces sleep shortly after the tab closes. Upgrade or move to another host if you need the bot online 24/7.

## Docker Image
Build a production image with the bundled `Dockerfile` and run it with your `.env` credentials:

```bash
docker build -t utu-bot .
docker run --env-file .env --rm utu-bot
```

The container runs as the non-root `node` user and expects the same environment variables described above.

## Continuous Integration
GitHub Actions (`.github/workflows/ci.yml`) installs dependencies and runs `npm run build` on every push and pull request targeting `main`, helping catch TypeScript compile errors before deployment.

## Project Structure
```
src/
  commands/
    index.ts              # Command registry
    owo.ts                # /owo command
    ping.ts               # /ping command
  config/
    env.ts                # Environment variable helpers & channel parsing
  features/
    counting/
      goal.ts             # Goal progression helpers
      index.ts            # Counting feature orchestration
      store.ts            # Persistent counting state manager (Mongo-backed)
      topic.ts            # Channel topic/name formatting
      utils.ts            # User-facing formatting helpers
      webhook.ts          # Webhook relay helper
  lib/
    db.ts                 # MongoDB connection factory
  utils/
    owoify.ts             # Text transformation logic
  index.ts               # Bot bootstrap and feature wiring
scripts/
  deploy-commands.ts      # Slash-command deployment script
.env / .env.example       # Environment configuration
package.json
package-lock.json
tsconfig.json
README.md
```

## Next Steps
- Add admin commands to adjust goals or report leaderboard standings without manual DB updates
- Extend the counting experience with streak rewards or moderation hooks
- Integrate structured logging and monitoring for production deployments

Happy uwu-ing!
