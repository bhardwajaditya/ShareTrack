/**
 * Cron-triggerable endpoint for generating portfolio reports
 * 
 * This endpoint is designed to be called by an external cron service
 * (e.g., cron-job.org, GitHub Actions, or server cron) at market open.
 * 
 * Recommended schedule: 9:00 AM IST (before market opens at 9:15)
 * 
 * Usage:
 * - GET/POST to /api/cron/generate-report
 * - Optional: Add secret key for security
 */

import { getPortfolioCollection, getReportsCollection } from '../../../utils/mongodb';

const YAHOO_FINANCE_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// Verify cron secret (optional security)
function verifyCronSecret(req) {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  
  // If no secret is configured, allow all requests
  if (!expectedSecret) return true;
  
  return secret === expectedSecret;
}

// Fetch historical data for a symbol
async function fetchHistoricalData(symbol, period = '1mo') {
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

// Simple strategy analysis (abbreviated version for cron)
function quickAnalyze(data) {
  if (!data || data.length < 20) return null;

  const closes = data.map(d => d.close);
  const lastClose = closes[closes.length - 1];
  
  // Simple moving average check
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 
    ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 
    : sma20;

  // RSI calculation
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi = 100 - (100 / (1 + rs));

  // Determine signal
  let buyScore = 0;
  let sellScore = 0;

  if (lastClose > sma20) buyScore++;
  else sellScore++;

  if (lastClose > sma50) buyScore++;
  else sellScore++;

  if (rsi < 30) buyScore += 2; // Oversold
  else if (rsi > 70) sellScore += 2; // Overbought

  // Volume spike check
  const avgVolume = data.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
  const lastVolume = data[data.length - 1].volume;
  if (lastVolume > avgVolume * 1.5) {
    if (lastClose > data[data.length - 2].close) buyScore++;
    else sellScore++;
  }

  let signal = 'HOLD';
  if (buyScore >= 4) signal = 'STRONG BUY';
  else if (buyScore >= 2) signal = 'BUY';
  else if (sellScore >= 4) signal = 'STRONG SELL';
  else if (sellScore >= 2) signal = 'SELL';

  return {
    signal,
    rsi: rsi.toFixed(2),
    aboveSMA20: lastClose > sma20,
    aboveSMA50: lastClose > sma50,
    buyScore,
    sellScore
  };
}

export default async function handler(req, res) {
  // Verify cron secret
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();

  try {
    const portfolioCollection = await getPortfolioCollection();
    const reportsCollection = await getReportsCollection();

    // Get all portfolio holdings
    const holdings = await portfolioCollection.find({}).toArray();

    if (holdings.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No holdings in portfolio',
        executionTime: `${Date.now() - startTime}ms`
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
          error: 'Failed to fetch data'
        });
        continue;
      }

      const currentPrice = data[data.length - 1]?.close;
      const analysis = quickAnalyze(data);
      const pnlPercent = ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;

      const result = {
        symbol: holding.symbol,
        quantity: holding.quantity,
        avgBuyPrice: holding.avgBuyPrice,
        currentPrice,
        pnlPercent: pnlPercent.toFixed(2),
        signal: analysis?.signal || 'N/A',
        rsi: analysis?.rsi
      };

      analysisResults.push(result);

      // Check if action is required
      if (analysis?.signal === 'STRONG SELL' || analysis?.signal === 'SELL') {
        actionRequired.push({
          symbol: holding.symbol,
          signal: analysis.signal,
          pnlPercent: pnlPercent.toFixed(2),
          recommendation: `${analysis.signal} signal detected`
        });
      }

      // Loss alert
      if (pnlPercent < -10) {
        const exists = actionRequired.find(a => a.symbol === holding.symbol);
        if (!exists) {
          actionRequired.push({
            symbol: holding.symbol,
            signal: 'LOSS ALERT',
            pnlPercent: pnlPercent.toFixed(2),
            recommendation: `Position down ${pnlPercent.toFixed(2)}%`
          });
        }
      }

      // Strong buy opportunity (for adding)
      if (analysis?.signal === 'STRONG BUY' && pnlPercent > 0) {
        actionRequired.push({
          symbol: holding.symbol,
          signal: 'MOMENTUM',
          pnlPercent: pnlPercent.toFixed(2),
          recommendation: 'Strong momentum - consider adding'
        });
      }
    }

    // Create report
    const report = {
      generatedAt: new Date(),
      marketDate: new Date().toISOString().split('T')[0],
      type: 'daily',
      totalHoldings: holdings.length,
      analyzedCount: analysisResults.filter(r => !r.error).length,
      actionRequiredCount: actionRequired.length,
      actionRequired,
      holdings: analysisResults,
      executionTimeMs: Date.now() - startTime
    };

    // Store report
    await reportsCollection.insertOne(report);

    // Log summary
    console.log(`[CRON] Report generated: ${analysisResults.length} holdings analyzed, ${actionRequired.length} actions required`);

    return res.status(200).json({
      success: true,
      message: `Report generated successfully`,
      summary: {
        totalHoldings: report.totalHoldings,
        analyzed: report.analyzedCount,
        actionsRequired: report.actionRequiredCount
      },
      actionRequired,
      executionTime: `${report.executionTimeMs}ms`
    });

  } catch (error) {
    console.error('[CRON] Report generation failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      executionTime: `${Date.now() - startTime}ms`
    });
  }
}
