import mongoose from 'mongoose';
import Trip from './models/Trip.js';

console.log('Trip Schema Paths:');
console.log(Object.keys(mongoose.model('Trip').schema.paths));
process.exit(0);
