import { getPortfolioCollection, getReportsCollection } from '../../utils/mongodb';
import { 
  analyzeWeightedStrategy,
  analyzeConnorsRSI,
  analyzeTurtleSoup,
  analyzeOpeningRange
} from '../../utils/stockData';

const YAHOO_FINANCE_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// Fetch historical data for a symbol (1 year for proper analysis)
async function fetchHistoricalData(symbol, period = '1y') {
  const yahooSymbol = `${symbol}.NS`;
  const url = `${YAHOO_FINANCE_BASE_URL}${yahooSymbol}?interval=1d&range=${period}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    
    if (data.chart?.error || !data.chart?.result?.[0]) {
      return null;
    }
    
    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    return timestamps.map((time, i) => ({
      date: new Date(time * 1000).toISOString().split('T')[0],
      open: quotes.open[i],
      high: quotes.high[i],
      low: quotes.low[i],
      close: quotes.close[i],
      volume: quotes.volume[i]
    })).filter(d => d.close !== null);
  } catch (err) {
    console.error(`Error fetching data for ${symbol}:`, err);
    return null;
  }
}

// Analyze a single stock with all 4 strategies (synced with analysis.js)
function analyzeStock(data) {
  if (!data || data.length < 50) {
    return null;
  }

  // Run all 4 strategies (same as pages/analysis.js)
  const trendPullback = analyzeWeightedStrategy(data);
  const connorsRSI = analyzeConnorsRSI(data);
  const turtleSoup = analyzeTurtleSoup(data);
  const openingRange = analyzeOpeningRange(data);

  // Count signals from all 4 strategies
  const signals = [
    trendPullback?.signal,
    connorsRSI?.signal,
    turtleSoup?.signal,
    openingRange?.signal
  ];

  const buyCount = signals.filter(s => s === 'BUY' || s === 'STRONG BUY').length;
  const sellCount = signals.filter(s => s === 'SELL' || s === 'STRONG SELL').length;

  // Calculate overall score (average of all 4 strategies)
  const overallScore = Math.round(
    ((trendPullback?.totalScore || 0) + 
     (connorsRSI?.score || 0) + 
     (turtleSoup?.score || 0) + 
     (openingRange?.score || 0)) / 4
  );

  // Determine overall signal based on consensus
  let overallSignal = 'HOLD';
  if (buyCount >= 3) overallSignal = 'STRONG BUY';
  else if (buyCount >= 2) overallSignal = 'BUY';
  else if (sellCount >= 3) overallSignal = 'STRONG SELL';
  else if (sellCount >= 2) overallSignal = 'SELL';

  return {
    trendPullback: {
      signal: trendPullback?.signal || 'NEUTRAL',
      score: trendPullback?.totalScore || 0,
      confidence: trendPullback?.confidence || 'LOW',
      reason: trendPullback?.phase1?.reason || 'No data'
    },
    connorsRSI: {
      signal: connorsRSI?.signal || 'NEUTRAL',
      score: connorsRSI?.score || 0,
      mfi: connorsRSI?.mfi || null,
      reason: connorsRSI?.reason || 'No data'
    },
    turtleSoup: {
      signal: turtleSoup?.signal || 'NEUTRAL',
      score: turtleSoup?.score || 0,
      breakout: turtleSoup?.breakout || false,
      reason: turtleSoup?.reason || 'No data'
    },
    openingRange: {
      signal: openingRange?.signal || 'NEUTRAL',
      score: openingRange?.score || 0,
      breakout: openingRange?.breakout || false,
      reason: openingRange?.reason || 'No data'
    },
    buyCount,
    sellCount,
    overallScore,
    overallSignal
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const portfolioCollection = await getPortfolioCollection();
    const reportsCollection = await getReportsCollection();

    // Get all portfolio holdings
    const holdings = await portfolioCollection.find({}).toArray();

    if (holdings.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No holdings in portfolio to analyze',
        report: null
      });
    }

    // Analyze each holding
    const analysisResults = [];
    const actionRequired = [];

    for (const holding of holdings) {
      const data = await fetchHistoricalData(holding.symbol);
      
      if (!data) {
        analysisResults.push({
          symbol: holding.symbol,
          quantity: holding.quantity,
          avgBuyPrice: holding.avgBuyPrice,
          error: 'Failed to fetch data',
          analysis: null
        });
        continue;
      }

      const currentPrice = data[data.length - 1]?.close;
      const analysis = analyzeStock(data);

      const result = {
        symbol: holding.symbol,
        quantity: holding.quantity,
        avgBuyPrice: holding.avgBuyPrice,
        currentPrice,
        investedValue: holding.quantity * holding.avgBuyPrice,
        currentValue: currentPrice ? holding.quantity * currentPrice : null,
        pnl: currentPrice ? (currentPrice - holding.avgBuyPrice) * holding.quantity : null,
        pnlPercent: currentPrice ? ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100 : null,
        analysis
      };

      analysisResults.push(result);

      // Check if action is required
      if (analysis && (analysis.overallSignal === 'STRONG SELL' || analysis.overallSignal === 'SELL')) {
        actionRequired.push({
          symbol: holding.symbol,
          signal: analysis.overallSignal,
          sellCount: analysis.sellCount,
          pnlPercent: result.pnlPercent,
          recommendation: analysis.overallSignal === 'STRONG SELL' 
            ? 'Consider selling - Multiple indicators suggest downward trend'
            : 'Review position - Some indicators suggest selling'
        });
      }

      // Also flag if there's a significant loss
      if (result.pnlPercent && result.pnlPercent < -10) {
        const existingAction = actionRequired.find(a => a.symbol === holding.symbol);
        if (!existingAction) {
          actionRequired.push({
            symbol: holding.symbol,
            signal: 'LOSS ALERT',
            pnlPercent: result.pnlPercent,
            recommendation: `Position down ${result.pnlPercent.toFixed(2)}% - Review for potential stop-loss`
          });
        }
      }
    }

    // Create report
    const report = {
      generatedAt: new Date(),
      marketDate: new Date().toISOString().split('T')[0],
      totalHoldings: holdings.length,
      analyzedCount: analysisResults.filter(r => r.analysis).length,
      actionRequired,
      summary: {
        totalInvested: analysisResults.reduce((sum, r) => sum + r.investedValue, 0),
        totalCurrentValue: analysisResults.reduce((sum, r) => sum + (r.currentValue || 0), 0),
        totalPnL: analysisResults.reduce((sum, r) => sum + (r.pnl || 0), 0)
      },
      holdings: analysisResults
    };

    // Store report in database
    const insertResult = await reportsCollection.insertOne(report);
    report._id = insertResult.insertedId;

    return res.status(200).json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Portfolio analysis error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
