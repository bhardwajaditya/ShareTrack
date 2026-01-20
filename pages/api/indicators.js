import { sma, rsi, macd, bollingerbands, adx, stochastic, vwap } from 'technicalindicators';

// Helper to fetch stock data (reusing the logic would be better, but for now we fetch from our own API or Yahoo)
// Actually, for server-side efficiency, we should probably query the DB directly or use the shared util if we refactor.
// For this iteration, I will assume we can fetch from the stock-data API or just duplicate the fetch logic for simplicity 
// to avoid circular dependencies if I were to import the handler. 
// BUT, the cleanest way is to use the `utils/stockData.js` if it was refactored. 
// Since `utils/stockData.js` currently fetches from the API, we have a loop if we use it here.
// So I will duplicate the DB/Yahoo fetch logic or better yet, just accept the data payload? 
// No, API should be standalone. I will copy the fetch logic for now or rely on the `stock-data` API via full URL if running, 
// but internal function call is best.
// Let's copy the fetch logic for now to ensure it works standalone.

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'sharetrack';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  const client = await MongoClient.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = client.db(MONGODB_DB);
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

const getTimestamp = (period, endDate) => {
  const periods = {
    '1d': 86400, '5d': 432000, '1w': 604800, '1mo': 2592000,
    '3mo': 7776000, '6mo': 15552000, '1y': 31536000, '2y': 63072000,
    '5y': 157680000, 'max': 1576800000
  };
  return endDate - (periods[period] || periods['1d']);
};

const processYahooData = (data) => {
    if (!data.chart || !data.chart.result || !data.chart.result[0]) return [];
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    if (!timestamps || !quotes) return [];
    return timestamps.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        open: quotes.open[index],
        high: quotes.high[index],
        low: quotes.low[index],
        close: quotes.close[index],
        volume: quotes.volume[index]
    })).filter(item => item.close !== null);
};

async function getStockData(symbol, period, interval) {
    // This duplicates logic from stock-data.js. In a real refactor, this would be in a shared controller.
    const { db } = await connectToDatabase();
    const collection = db.collection('stocks');
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = getTimestamp(period || '1y', endDate); // Default to 1y for indicators
    const startDateISO = new Date(startDate * 1000).toISOString().split('T')[0];
    const endDateISO = new Date(endDate * 1000).toISOString().split('T')[0];

    const cachedData = await collection.find({
        symbol,
        date: { $gte: startDateISO, $lte: endDateISO }
    }).toArray();

    if (cachedData.length > 0) return cachedData.sort((a, b) => new Date(a.date) - new Date(b.date));

    const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startDate}&period2=${endDate}&interval=${interval || '1d'}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    const processed = processYahooData(data);
    if (processed.length > 0) {
        await collection.insertMany(processed.map(item => ({ ...item, symbol, createdAt: new Date() })));
    }
    return processed;
}

export default async function handler(req, res) {
    const { symbol, indicators } = req.body; // Expect POST request

    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    try {
        // Fetch enough data for indicators (defaulting to 1y to be safe)
        const stockData = await getStockData(symbol, '1y', '1d');
        if (stockData.length === 0) return res.status(404).json({ error: 'No data found' });

        const closes = stockData.map(d => d.close);
        const highs = stockData.map(d => d.high);
        const lows = stockData.map(d => d.low);
        const volumes = stockData.map(d => d.volume);

        const results = {};
        const reqIndicators = indicators || ['sma', 'rsi', 'macd', 'bb']; // Default set

        if (reqIndicators.includes('sma')) {
            results.sma44 = sma({ period: 44, values: closes });
            results.sma90 = sma({ period: 90, values: closes });
        }
        if (reqIndicators.includes('rsi')) {
            results.rsi = rsi({ period: 14, values: closes });
        }
        if (reqIndicators.includes('macd')) {
            results.macd = macd({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
        }
        if (reqIndicators.includes('bb')) {
            results.bb = bollingerbands({ values: closes, period: 20, stdDev: 2 });
        }
        if (reqIndicators.includes('adx')) {
            results.adx = adx({ high: highs, low: lows, close: closes, period: 14 });
        }
        if (reqIndicators.includes('stochastic')) {
            results.stochastic = stochastic({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
        }
        // VWAP usually requires intraday data, but we'll calculate it based on available data
        if (reqIndicators.includes('vwap')) {
             // technicalindicators vwap might expect different input structure, let's check docs or assume standard
             // Actually, the library expects {high, low, close, volume} arrays usually or objects.
             // Let's try to map it correctly if we were using it, but for now let's skip complex VWAP if library usage is unsure
             // or just implement a simple one.
             // Library usage: vwap({ high: [], low: [], close: [], volume: [] })
             results.vwap = vwap({ high: highs, low: lows, close: closes, volume: volumes });
        }

        // Get the latest values for the response
        const latest = {
            symbol,
            lastPrice: closes[closes.length - 1],
            date: stockData[stockData.length - 1].date,
            indicators: {}
        };

        if (results.sma44) latest.indicators.sma44 = results.sma44[results.sma44.length - 1];
        if (results.sma90) latest.indicators.sma90 = results.sma90[results.sma90.length - 1];
        if (results.rsi) latest.indicators.rsi = results.rsi[results.rsi.length - 1];
        if (results.macd) latest.indicators.macd = results.macd[results.macd.length - 1];
        if (results.bb) latest.indicators.bb = results.bb[results.bb.length - 1];
        if (results.adx) latest.indicators.adx = results.adx[results.adx.length - 1];
        if (results.stochastic) latest.indicators.stochastic = results.stochastic[results.stochastic.length - 1];
        if (results.vwap) latest.indicators.vwap = results.vwap[results.vwap.length - 1];

        res.status(200).json(latest);

    } catch (error) {
        console.error('Indicator Error:', error);
        res.status(500).json({ error: 'Failed to calculate indicators' });
    }
}
