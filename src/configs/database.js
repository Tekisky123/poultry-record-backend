import mongoose from 'mongoose';
import {config} from 'dotenv';

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  config({ path: `${process.cwd()}/src/.env` });
}

const connectDB = async () =>
  await mongoose.connect(`${process.env.DATABASE_URI}/poultryRecordDB`, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

export default connectDB;
