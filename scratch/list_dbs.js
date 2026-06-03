import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: './src/.env' });

const mongoURI = process.env.DATABASE_URI;

async function run() {
  const client = new MongoClient(mongoURI);
  try {
    await client.connect();
    console.log("Connected to MongoDB cluster.");
    
    // List all databases
    const adminDb = client.db().admin();
    const dbsList = await adminDb.listDatabases();
    console.log("Databases on cluster:");
    for (const db of dbsList.databases) {
      console.log(`- ${db.name} (size: ${db.sizeOnDisk} bytes)`);
      const dbInstance = client.db(db.name);
      const collections = await dbInstance.listCollections().toArray();
      console.log(`  Collections: ${collections.map(c => c.name).join(', ')}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
