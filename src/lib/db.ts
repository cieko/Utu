import { MongoClient, type Db } from 'mongodb';

export interface DatabaseConnection {
  client: MongoClient;
  db: Db;
}

export async function connectToDatabase(connectionString: string): Promise<DatabaseConnection> {
  const client = new MongoClient(connectionString);
  await client.connect();

  const dbName = resolveDatabaseName(client, connectionString);
  const db = client.db(dbName);

  return { client, db };
}

function resolveDatabaseName(client: MongoClient, connectionString: string): string {
  if (client.options.dbName && client.options.dbName.trim().length > 0) {
    return client.options.dbName;
  }

  const parsed = tryParseConnectionString(connectionString);
  if (parsed?.length) {
    return parsed;
  }

  return 'utu';
}

function tryParseConnectionString(connectionString: string): string | undefined {
  try {
    const url = new URL(connectionString);
    const pathname = url.pathname?.replace(/^\//, '').trim();
    if (pathname && pathname.length > 0) {
      return pathname;
    }
  } catch {
    // ignore malformed URL formats such as SRV strings without explicit path
  }
  return undefined;
}
