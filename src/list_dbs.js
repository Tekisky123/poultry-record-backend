import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

async function run() {
    await mongoose.connect(process.env.DATABASE_URI);
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log("Databases in cluster:", dbs.databases.map(d => d.name));
    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
