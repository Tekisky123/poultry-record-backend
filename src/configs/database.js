import mongoose from 'mongoose';
import {config} from 'dotenv';

// Load environment variables - Vercel will use its own env vars in production
if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URI) {
  try {
    config({ path: `${process.cwd()}/src/.env` });
  } catch (error) {
    console.log('No local .env file found, using environment variables');
  }
}

const connectDB = async () =>
  await mongoose.connect(`${process.env.DATABASE_URI}/poultryRecordDB`, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

export default connectDB;
