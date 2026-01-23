import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'sharetrack';

// Allow the app to run without MongoDB for basic functionality
const isMongDBConfigured = !!MONGODB_URI;

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (!isMongDBConfigured) {
    throw new Error('MongoDB is not configured. Please set MONGODB_URI environment variable.');
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function getStockCollection() {
  const { db } = await connectToDatabase();
  return db.collection('stocks');
}

export async function getPortfolioCollection() {
  const { db } = await connectToDatabase();
  return db.collection('portfolio');
}

export async function getReportsCollection() {
  const { db } = await connectToDatabase();
  return db.collection('reports');
}

export async function getStockHistoricalDataCollection() {
  const { db } = await connectToDatabase();
  const collection = db.collection('stockHistoricalData');
  // Ensure compound index exists for efficient lookups
  await collection.createIndex({ symbol: 1, date: 1 }, { unique: true, background: true });
  return collection;
}

export function isMongoDBConfigured() {
  return isMongDBConfigured;
}
 