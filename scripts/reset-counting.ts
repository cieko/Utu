import "dotenv/config";
import type { DeleteResult } from "mongodb";
import { connectToDatabase } from "../src/lib/db";

async function resetCountingDocuments(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required to reset counting data.");
  }

  const { client, db } = await connectToDatabase(databaseUrl);

  try {
    const channels = db.collection("counting_channels");
    const leaderboard = db.collection("counting_leaderboard");

    const [channelResult, leaderboardResult]: DeleteResult[] = await Promise.all([
      channels.deleteMany({}),
      leaderboard.deleteMany({}),
    ]);

    const removedChannels = channelResult.deletedCount ?? 0;
    const removedEntries = leaderboardResult.deletedCount ?? 0;

    console.log(`Removed ${removedChannels} document(s) from counting_channels.`);
    console.log(`Removed ${removedEntries} document(s) from counting_leaderboard.`);
  } finally {
    await client.close();
  }
}

void resetCountingDocuments().catch((error) => {
  console.error("Failed to reset counting documents:", error);
  process.exitCode = 1;
});
