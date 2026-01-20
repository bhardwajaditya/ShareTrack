import { NSE_INDEXES } from '../../utils/nseIndexes';
import { NseIndia } from  "stock-nse-india";

export default async function handler(req, res) {
  const { index } = req.query;
  const  nseIndia = new  NseIndia();

  if (!index) {
    return res.status(400).json({ error: 'Index symbol is required' });
  }

  const indexDetails = NSE_INDEXES[index];
  if (!indexDetails) {
    return res.status(400).json({ error: 'Invalid index symbol' });
  }

  try {
    // Fetch the index components from NSE
    // const response = await fetch(`https://www.nseindia.com/api/equity-stockIndices?index=${indexDetails.symbol}`);
    const data = await nseIndia.getEquityStockIndices(indexDetails.name);
    
    if (!data || !data.data) {
      throw new Error('Failed to fetch index data from NSE');
    }
    
    // Process and return the stock list
    const stocks = data.data.map(stock => ({
      symbol: stock.symbol,
      name: stock.companyName,
      lastPrice: stock.lastPrice,
      change: stock.pChange,
      volume: stock.totalTradedVolume,
      marketCap: stock.marketCap
    }));

    res.status(200).json(stocks);
  } catch (error) {
    console.error('Error fetching index stocks:', error);
    res.status(500).json({ error: 'Failed to fetch index stocks' });
  }
} 