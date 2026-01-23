import { NseIndia } from "stock-nse-india";

export default async function handler(req, res) {
  try {
    const nseIndia = new NseIndia();
    
    // Fetch all equity stock symbols from NSE
    const data = await nseIndia.getEquityStockIndices('NIFTY 500');
    
    if (!data || !data.data) {
      throw new Error('Failed to fetch symbols from NSE');
    }
    
    // Extract symbols with company names for autocomplete
    const symbols = data.data
      .filter(stock => stock.symbol && stock.symbol !== 'NIFTY 500')
      .map(stock => ({
        symbol: stock.symbol,
        companyName: stock.meta?.companyName || stock.symbol,
        industry: stock.meta?.industry || ''
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    res.status(200).json({ success: true, data: symbols });
  } catch (error) {
    console.error('Error fetching NSE symbols:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch NSE symbols' });
  }
}
