import { getStockHistoricalDataCollection } from '../../utils/mongodb';

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

// Calculate start timestamp based on period
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

// Process Yahoo Finance API response into normalized format
const processYahooData = (data, symbol) => {
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
    symbol: symbol,
    date: new Date(timestamp * 1000).toISOString().split('T')[0],
    open: quotes.open[index],
    high: quotes.high[index],
    low: quotes.low[index],
    close: quotes.close[index],
    volume: quotes.volume[index]
  })).filter(item => item.close !== null);
};

// Fetch data from Yahoo Finance API for a specific date range
const fetchFromYahoo = async (symbol, startTimestamp, endTimestamp) => {
  const yahooSymbol = normalizeSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
  console.log(`Fetching from Yahoo: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    console.warn(`Yahoo Finance returned ${response.status} for ${yahooSymbol}`);
    return [];
  }

  const data = await response.json();
  
  if (data.chart?.error) {
    console.warn(`Yahoo Finance error for ${yahooSymbol}: ${data.chart.error.description}`);
    return [];
  }

  return processYahooData(data, symbol);
};

// Get cached data from MongoDB for a symbol within date range
const getCachedData = async (collection, symbol, startDate, endDate) => {
  const records = await collection.find({
    symbol: symbol,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 }).toArray();
  
  console.log(`Found ${records.length} cached records for ${symbol} between ${startDate} and ${endDate}`);
  return records;
};

// Save data to MongoDB (upsert to handle duplicates)
const saveToCache = async (collection, records) => {
  if (records.length === 0) return;
  
  const bulkOps = records.map(record => ({
    updateOne: {
      filter: { symbol: record.symbol, date: record.date },
      update: { $set: record },
      upsert: true
    }
  }));
  
  const result = await collection.bulkWrite(bulkOps, { ordered: false });
  console.log(`Cached ${result.upsertedCount} new records, updated ${result.modifiedCount} existing records`);
};

// Check if market is still open (before 3:30 PM IST) buffer 3:45 PM IST for closing price fetch
const isMarketOpen = () => {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
  
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  
  // Market closes at 3:30 PM IST (15:30) buffer 3:45 PM IST for closing price fetch
  const marketCloseHour = 15;
  const marketCloseMinute = 45;
  
  if (hours < marketCloseHour) return true;
  if (hours === marketCloseHour && minutes < marketCloseMinute) return true;
  return false;
};

// Fetch stock data for a single symbol with caching
const fetchStockDataWithCache = async (collection, symbol, requestedStartDate, requestedEndDate) => {
  const today = new Date().toISOString().split('T')[0];
  const marketOpen = isMarketOpen();
  
  // Determine the date range to fetch from cache
  // If market is open, exclude today from cache lookup - we'll fetch it fresh
  const cacheEndDate = (marketOpen && requestedEndDate >= today) ? 
    new Date(new Date(today).getTime() - 86400000).toISOString().split('T')[0] : // Yesterday
    requestedEndDate;
  
  // Get cached data for the requested range (excluding today if market is open)
  const cachedData = cacheEndDate >= requestedStartDate ? 
    await getCachedData(collection, symbol, requestedStartDate, cacheEndDate) :
    [];
  
  // If we have no cached data, fetch the entire range
  if (cachedData.length === 0) {
    console.log(`No cached data for ${symbol}, fetching entire range`);
    const startTimestamp = Math.floor(new Date(requestedStartDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(requestedEndDate).getTime() / 1000) + 86400; // Add one day to include end date
    
    const freshData = await fetchFromYahoo(symbol, startTimestamp, endTimestamp);
    await saveToCache(collection, freshData);
    return freshData;
  }
  
  // We have some cached data - check for gaps
  const cachedDates = new Set(cachedData.map(r => r.date));
  const earliestCached = cachedData[0].date;
  const latestCached = cachedData[cachedData.length - 1].date;
  
  let allData = [...cachedData];
  
  // Check if we need data before the earliest cached date
  if (requestedStartDate < earliestCached) {
    console.log(`Fetching missing data before ${earliestCached} for ${symbol}`);
    const startTimestamp = Math.floor(new Date(requestedStartDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(earliestCached).getTime() / 1000) - 86400; // Day before earliest cached
    
    if (startTimestamp < endTimestamp) {
      const olderData = await fetchFromYahoo(symbol, startTimestamp, endTimestamp);
      await saveToCache(collection, olderData);
      allData = [...olderData, ...allData];
    }
  }
  
  // Check if we need data after the latest cached date
  // 'today' is already defined at the start of this function
  const effectiveEndDate = requestedEndDate > today ? today : requestedEndDate;
  
  if (latestCached < effectiveEndDate) {
    console.log(`Fetching missing data after ${latestCached} for ${symbol}`);
    const startTimestamp = Math.floor(new Date(latestCached).getTime() / 1000) + 86400; // Day after latest cached
    const endTimestamp = Math.floor(new Date(effectiveEndDate).getTime() / 1000) + 86400;
    
    if (startTimestamp < endTimestamp) {
      const newerData = await fetchFromYahoo(symbol, startTimestamp, endTimestamp);
      await saveToCache(collection, newerData);
      allData = [...allData, ...newerData];
    }
  }
  
  // Sort by date and remove duplicates
  const uniqueData = Array.from(
    new Map(allData.map(item => [item.date, item])).values()
  ).sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Filter to only requested range (in case cache had extra data)
  return uniqueData.filter(d => d.date >= requestedStartDate && d.date <= requestedEndDate);
};

export default async function handler(req, res) {
  const { symbol, symbols, period, interval } = req.query;

  // Support both single 'symbol' and batch 'symbols'
  const targetSymbols = symbols ? symbols.split(',') : (symbol ? [symbol] : []);

  if (targetSymbols.length === 0) {
    return res.status(400).json({ error: 'Symbol or symbols required' });
  }

  // Only cache daily interval data
  const shouldCache = !interval || interval === '1d';

  try {
    // Calculate date range
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = getTimestamp(period || '1d', endTimestamp);
    
    const requestedStartDate = new Date(startTimestamp * 1000).toISOString().split('T')[0];
    const requestedEndDate = new Date(endTimestamp * 1000).toISOString().split('T')[0];

    let collection = null;
    if (shouldCache) {
      try {
        collection = await getStockHistoricalDataCollection();
      } catch (dbError) {
        console.warn('MongoDB not available, falling back to API-only mode:', dbError.message);
      }
    }

    // Fetch data for each symbol
    const fetchedResults = await Promise.all(
      targetSymbols.map(async (sym) => {
        try {
          if (collection && shouldCache) {
            // Use cached data with gap filling
            return await fetchStockDataWithCache(collection, sym, requestedStartDate, requestedEndDate);
          } else {
            // Fallback: fetch directly from Yahoo Finance (for non-daily intervals or if DB unavailable)
            const data = await fetchFromYahoo(sym, startTimestamp, endTimestamp);
            return data;
          }
        } catch (error) {
          console.error(`Failed to fetch ${sym}:`, error.message);
          return null;
        }
      })
    );

    // Return results
    if (!symbols && symbol) {
      // Single symbol request - return array of data (backward compatibility)
      const data = fetchedResults[0] || [];
      return res.status(200).json(data);
    } else {
      // Multiple symbols - return map of symbol -> data
      const responseMap = {};
      targetSymbols.forEach((sym, index) => {
        responseMap[sym] = fetchedResults[index] || [];
      });
      return res.status(200).json(responseMap);
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
}