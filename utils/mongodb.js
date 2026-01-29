import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'sharetrack';

// Allow the app to run without MongoDB for basic functionality
const isMongDBConfigured = !!MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('Please define the MONGODB_URI environment variable inside .env.local');
}

if (!MONGODB_DB) {
  console.warn('Please define the MONGODB_DB environment variable inside .env.local');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cachedClient = null;
let cachedDb = null;
let clientPromise;

if (isMongDBConfigured) {
  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
      const client = new MongoClient(MONGODB_URI);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect();
  }
}

export async function connectToDatabase() {
  if (!isMongDBConfigured) {
    throw new Error('MongoDB is not configured. Please set MONGODB_URI environment variable.');
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = await clientPromise;
    const db = client.db(MONGODB_DB);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    // Add helpful context for common errors
    if (error.code === 8000) {
      console.error('Possible causes for code 8000 (AtlasError):');
      console.error('1. Invalid username or password in MONGODB_URI');
      console.error('2. IP Address not whitelisted in MongoDB Atlas Network Access');
      console.error('3. Database name mismatch');
    }
    throw error;
  }
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
 