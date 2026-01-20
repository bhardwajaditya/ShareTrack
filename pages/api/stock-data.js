import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'sharetrack';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Use a simpler connection configuration
  const client = await MongoClient.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Known exchange suffixes that Yahoo Finance uses
const KNOWN_EXCHANGE_SUFFIXES = [
  '.NS',  // NSE India
  '.BO',  // BSE India
  '.L',   // London
  '.TO',  // Toronto
  '.AX',  // Australia
  '.HK',  // Hong Kong
  '.SI',  // Singapore
  '.F',   // Frankfurt
  '.DE',  // Germany
  '.PA',  // Paris
];

// Normalize symbol for Yahoo Finance
// If no exchange suffix is present, default to .NS (NSE India)
const normalizeSymbol = (symbol) => {
  const upperSymbol = symbol.toUpperCase();
  
  // Check if symbol already has a known exchange suffix
  const hasExchangeSuffix = KNOWN_EXCHANGE_SUFFIXES.some(suffix => 
    upperSymbol.endsWith(suffix.toUpperCase())
  );
  
  // Also check for index symbols (start with ^) - these don't need suffix
  if (hasExchangeSuffix || upperSymbol.startsWith('^')) {
    return symbol;
  }
  
  // Default to NSE India suffix
  return `${symbol}.NS`;
};

export default async function handler(req, res) {
  const { symbol, symbols, period, interval } = req.query;

  // Support both single 'symbol' and batch 'symbols'
  const targetSymbols = symbols ? symbols.split(',') : (symbol ? [symbol] : []);

  if (targetSymbols.length === 0) {
    return res.status(400).json({ error: 'Symbol or symbols required' });
  }

  try {
    // Calculate date range
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = getTimestamp(period || '1d', endDate);

    // Fetch data from Yahoo Finance in parallel
    const fetchedResults = await Promise.all(
      targetSymbols.map(async (sym) => {
        const yahooSymbol = normalizeSymbol(sym);
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=${interval || '1d'}`;
          console.log(`Fetching: ${url}`);
          
          const response = await fetch(url);

          if (!response.ok) {
            console.warn(`Yahoo Finance returned ${response.status} for ${yahooSymbol} (original: ${sym})`);
            return null;
          }

          const data = await response.json();
          
          // Check if Yahoo returned an error in the response body
          if (data.chart?.error) {
            console.warn(`Yahoo Finance error for ${yahooSymbol}: ${data.chart.error.description}`);
            return null;
          }
          
          const processed = processYahooData(data);
          
          // Add original symbol (without suffix) to each record for consistency
          return processed.map(item => ({
            ...item,
            symbol: sym
          }));
        } catch (error) {
          console.error(`Failed to fetch ${yahooSymbol} (original: ${sym}):`, error.message);
          return null;
        }
      })
    );

    // Combine and return results
    // If single symbol was requested, return array of data (backward compatibility)
    // If multiple symbols, return map of symbol -> data
    if (!symbols && symbol) {
      const freshData = fetchedResults.flat().filter(Boolean).filter(d => d.symbol === symbol);
      // Sort by date
      const sorted = freshData.sort((a, b) => new Date(a.date) - new Date(b.date));
      return res.status(200).json(sorted);
    } else {
      const responseMap = {};
      targetSymbols.forEach(sym => {
        const fresh = fetchedResults.flat().filter(Boolean).filter(d => d.symbol === sym);
        const sorted = fresh.sort((a, b) => new Date(a.date) - new Date(b.date));
        responseMap[sym] = sorted;
      });
      return res.status(200).json(responseMap);
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
}

const getTimestamp = (period, endDate) => {
  const periods = {
    '1d': 86400,
    '5d': 432000,
    '1w': 604800,
    '1mo': 2592000,
    '3mo': 7776000,
    '6mo': 15552000,
    '1y': 31536000,
    '2y': 63072000,
    '5y': 157680000,
    'max': 1576800000
  };
  return endDate - (periods[period] || periods['1d']);
};

const processYahooData = (data) => {
  if (!data.chart || !data.chart.result || !data.chart.result[0]) {
    throw new Error('Invalid data format received from Yahoo Finance');
  }

  const result = data.chart.result[0];
  const timestamps = result.timestamp;
  const quotes = result.indicators.quote[0];
  
  if (!timestamps || !quotes) {
    throw new Error('Missing timestamp or quote data');
  }

  return timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().split('T')[0],
    open: quotes.open[index],
    high: quotes.high[index],
    low: quotes.low[index],
    close: quotes.close[index],
    volume: quotes.volume[index]
  })).filter(item => item.close !== null);
}; 