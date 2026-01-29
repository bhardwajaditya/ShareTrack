const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment from ${envPath}`);
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
  } else {
    console.log('.env.local not found, checking .env');
    require('dotenv').config();
  }
} catch (e) {
  console.error('Error loading environment variables:', e);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'sharetrack';

if (!uri) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

// Mask password in logs
const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
console.log(`\nTesting MongoDB connection to: ${maskedUri}`);
console.log(`Target Database: ${dbName}`);

async function testConnection() {
  const client = new MongoClient(uri);

  try {
    console.log('Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully to server');

    const db = client.db(dbName);
    console.log(`✅ Selected database: ${dbName}`);

    // Try a simple operation
    const result = await db.command({ ping: 1 });
    console.log('✅ Ping result:', result);
    
    // Check collections
    const collections = await db.listCollections().toArray();
    console.log('\nAvailable collections:');
    collections.forEach(col => console.log(` - ${col.name}`));

    console.log('\n🎉 CONNECTION SUCCESSFUL!');
  } catch (error) {
    console.error('\n❌ CONNECTION FAILED');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error codeName:', error.codeName);
    
    if (error.code === 8000) {
      console.log('\n💡 DIAGNOSIS: Authentication Failed (Code 8000)');
      console.log('Common possibilities:');
      console.log('1. Invalid username or password in connection string');
      console.log('2. IP Address not whitelisted in MongoDB Atlas');
      console.log('   -> Go to Atlas Console > Network Access > Add IP Address > "Add Current IP Address"');
      console.log('3. Database user does not have permission for this database');
    }
  } finally {
    await client.close();
  }
}

testConnection();
