import { MongoClient } from 'mongodb';

// Duplicated DB connection logic (should be refactored to shared util)
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'sharetrack';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  const client = await MongoClient.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = client.db(MONGODB_DB);
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

export default async function handler(req, res) {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    try {
        const { db } = await connectToDatabase();
        const collection = db.collection('stocks');
        
        // Get last 30 days of data for volume analysis
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const data = await collection.find({
            symbol,
            date: { $gte: startDate.toISOString().split('T')[0] }
        }).sort({ date: 1 }).toArray();

        if (data.length < 20) {
            return res.status(200).json({ sentiment: 'Neutral', reason: 'Insufficient data' });
        }

        const volumes = data.map(d => d.volume);
        const closes = data.map(d => d.close);
        
        // Calculate Average Volume (20 days)
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const lastVolume = volumes[volumes.length - 1];
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const priceChange = ((lastClose - prevClose) / prevClose) * 100;

        let sentiment = 'Neutral';
        let confidence = 0;
        let reason = '';

        // Logic: High Volume + Price Up = Bullish
        // High Volume + Price Down = Bearish
        const volumeRatio = lastVolume / avgVolume;

        if (volumeRatio > 1.5) {
            if (priceChange > 1) {
                sentiment = 'Bullish';
                confidence = Math.min((volumeRatio * 0.2) + (priceChange * 0.1), 0.9); // Cap at 0.9
                reason = `High volume (${volumeRatio.toFixed(1)}x avg) with price increase`;
            } else if (priceChange < -1) {
                sentiment = 'Bearish';
                confidence = Math.min((volumeRatio * 0.2) + (Math.abs(priceChange) * 0.1), 0.9);
                reason = `High volume (${volumeRatio.toFixed(1)}x avg) with price drop`;
            } else {
                reason = `High volume (${volumeRatio.toFixed(1)}x avg) but flat price`;
            }
        } else {
            reason = 'Volume within normal range';
        }

        res.status(200).json({
            symbol,
            sentiment,
            confidence: parseFloat(confidence.toFixed(2)),
            volumeRatio: parseFloat(volumeRatio.toFixed(2)),
            priceChange: parseFloat(priceChange.toFixed(2)),
            reason
        });

    } catch (error) {
        console.error('Sentiment Error:', error);
        res.status(500).json({ error: 'Failed to analyze sentiment' });
    }
}
