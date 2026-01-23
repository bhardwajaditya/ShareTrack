const YAHOO_FINANCE_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
import { fetchIndexStocks } from './nseIndexes';

export const fetchStockData = async (symbol, period = '1d', interval = '1d') => {
  try {
    const response = await fetch(`/api/stock-data?symbol=${symbol}&period=${period}&interval=${interval}`);
    if (!response.ok) {
      const error = await response.json();
      console.log(error);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    return [];
  }
};

// New function to fetch data for all stocks in an index
export const fetchIndexStockData = async (indexSymbol, period = '1d', interval = '1d') => {
  try {
    // First, get all stocks in the index
    const stocks = await fetchIndexStocks(indexSymbol);
    
    // Batch fetch data
    // URL length limit might be an issue, so let's chunk it (e.g., 50 symbols per request)
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < stocks.length; i += chunkSize) {
      chunks.push(stocks.slice(i, i + chunkSize));
    }

    const results = await Promise.all(chunks.map(async (chunk) => {
      const symbols = chunk.map(s => s.symbol).join(',');
      try {
        const response = await fetch(`/api/stock-data?symbols=${symbols}&period=${period}&interval=${interval}`);
        if (!response.ok) return {}; // Return empty object for failed chunk
        return await response.json();
      } catch (e) {
        console.error("Batch fetch error:", e);
        return {};
      }
    }));

    // Combine results (results is array of objects: { symbol: [data] })
    // We need to map back to the original stocks array structure
    const combinedData = Object.assign({}, ...results);

    return stocks.map(stock => {
      const data = combinedData[stock.symbol];
      if (!data || data.length === 0) {
        return {
          symbol: stock.symbol,
          name: stock.name,
          error: 'No data found'
        };
      }
      // Calculate change
      const last = data[data.length - 1];
      const prev = data.length > 1 ? data[data.length - 2] : last;
      const change = last.close - prev.close;
      const pChange = (change / prev.close) * 100;

      return {
        symbol: stock.symbol,
        name: stock.name,
        lastPrice: last.close,
        change: parseFloat(pChange.toFixed(2)),
        volume: last.volume,
        data: data // Keep full data if needed
      };
    }).filter(s => !s.error);

  } catch (error) {
    console.error(`Error fetching index stock data for ${indexSymbol}:`, error);
    throw error;
  }
};

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

export const processYahooData = (data) => {
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

export const fetchCurrentPrice = async (symbol) => {
  try {
    const data = await fetchStockData(symbol, '1d', '1m');
    if (!data || data.length === 0) {
      throw new Error('No price data available');
    }
    return data[data.length - 1].close;
  } catch (error) {
    console.error(`Error fetching current price for ${symbol}:`, error);
    throw error;
  }
};

export const fetchHistoricalData = async (symbol, period = '1y') => {
  try {
    return await fetchStockData(symbol, period);
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    throw error;
  }
};

import { sma, ema, rsi, atr, macd, bollingerbands, stochastic } from 'technicalindicators';

// ============================================================
// TREND-PULLBACK WEIGHTED STRATEGY SYSTEM
// 3-Phase approach with weighted scoring (100 points total)
// Phase 1 (Filter): 40% - PVB + Trend
// Phase 2 (Setup): 15% - Stochastic + Bollinger  
// Phase 3 (Trigger): 20% - MACD
// Volume Validation: 25%
// ============================================================

const analyzeWeightedStrategy = (data) => {
  // Default insufficient data response
  const insufficientResult = {
    phase1: { passed: false, score: 0, reason: 'Insufficient data', priceAboveEma: false, volumeAboveAvg: false },
    phase2: { passed: false, score: 0, reason: 'Insufficient data', nearLowerBB: false, stochBelow40: false },
    phase3: { passed: false, score: 0, reason: 'Insufficient data', histogramUp: false, signalCross: false },
    volume: { passed: false, score: 0, reason: 'Insufficient data', volumeSpike: false, brokeResistance: false },
    totalScore: 0,
    signal: 'NEUTRAL',
    confidence: 'LOW',
    isBullish: false
  };

  if (data.length < 50) return insufficientResult;

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // ============================================================
  // PHASE 1: FILTER (40 points) - Must pass to not cap score
  // Price > 50 EMA (20 pts) + Volume > Average (20 pts)
  // ============================================================
  const ema50Values = ema({ period: 50, values: closes });
  const lastEma50 = ema50Values[ema50Values.length - 1];
  const priceAboveEma50 = lastClose > lastEma50;

  const avgVolume20 = sma({ period: 20, values: volumes });
  const lastAvgVolume20 = avgVolume20[avgVolume20.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  const volumeAboveAvg = lastVolume > lastAvgVolume20;

  let phase1Score = 0;
  let phase1Reasons = [];
  
  if (priceAboveEma50) {
    phase1Score += 20;
    phase1Reasons.push(`Price ₹${lastClose.toFixed(0)} > 50 EMA ₹${lastEma50.toFixed(0)}`);
  } else {
    phase1Reasons.push(`Price below 50 EMA (₹${lastEma50.toFixed(0)})`);
  }
  
  if (volumeAboveAvg) {
    phase1Score += 20;
    phase1Reasons.push(`Volume ${(lastVolume/lastAvgVolume20).toFixed(1)}x avg`);
  } else {
    phase1Reasons.push(`Low volume (${(lastVolume/lastAvgVolume20).toFixed(1)}x)`);
  }

  const phase1Passed = priceAboveEma50 && volumeAboveAvg;

  const phase1 = {
    passed: phase1Passed,
    score: phase1Score,
    reason: phase1Reasons.join(', '),
    priceAboveEma: priceAboveEma50,
    volumeAboveAvg: volumeAboveAvg,
    ema50: lastEma50?.toFixed(2),
    volumeRatio: (lastVolume/lastAvgVolume20).toFixed(2)
  };

  // ============================================================
  // PHASE 2: SETUP (15 points) - Oscillators for entry optimization
  // Near Lower BB (8 pts) + Stochastic < 40 (7 pts)
  // Note: Using 40 threshold instead of 20 for bull markets
  // ============================================================
  const bbResult = bollingerbands({ period: 20, values: closes, stdDev: 2 });
  const lastBB = bbResult[bbResult.length - 1] || {};
  const percentB = lastBB.lower ? (lastClose - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
  const nearLowerBB = percentB < 0.2; // Within 20% of lower band (near lower band)

  const stochResult = stochastic({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3
  });
  const lastStoch = stochResult[stochResult.length - 1] || { k: 50, d: 50 };
  const stochBelow40 = lastStoch.k < 40; // Raised threshold for bull market

  let phase2Score = 0;
  let phase2Reasons = [];

  if (nearLowerBB) {
    phase2Score += 8;
    phase2Reasons.push(`Near Lower BB (%B: ${(percentB * 100).toFixed(0)}%)`);
  }
  
  if (stochBelow40) {
    phase2Score += 7;
    phase2Reasons.push(`Stoch pullback (%K: ${lastStoch.k?.toFixed(0)})`);
  }

  const phase2Passed = nearLowerBB || stochBelow40;
  
  const phase2 = {
    passed: phase2Passed,
    score: phase2Score,
    reason: phase2Reasons.length > 0 ? phase2Reasons.join(', ') : 'No pullback setup',
    nearLowerBB,
    stochBelow40,
    percentB: (percentB * 100).toFixed(1),
    stochK: lastStoch.k?.toFixed(1),
    stochD: lastStoch.d?.toFixed(1)
  };

  // ============================================================
  // PHASE 3: TRIGGER (20 points) - MACD momentum confirmation
  // Histogram ticking up (10 pts) + Signal Cross (10 pts)
  // ============================================================
  const macdResult = macd({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });

  const lastMACD = macdResult[macdResult.length - 1] || {};
  const prevMACD = macdResult[macdResult.length - 2] || {};
  
  const histogramUp = lastMACD.histogram !== undefined && prevMACD.histogram !== undefined 
    && lastMACD.histogram > prevMACD.histogram;
  const signalCross = prevMACD.MACD !== undefined && lastMACD.MACD !== undefined
    && prevMACD.MACD <= prevMACD.signal && lastMACD.MACD > lastMACD.signal;

  let phase3Score = 0;
  let phase3Reasons = [];

  if (histogramUp) {
    phase3Score += 10;
    phase3Reasons.push(`MACD histogram rising (${lastMACD.histogram?.toFixed(2)})`);
  }
  
  if (signalCross) {
    phase3Score += 10;
    phase3Reasons.push('MACD bullish crossover');
  }

  const phase3Passed = histogramUp || signalCross;
  
  const phase3 = {
    passed: phase3Passed,
    score: phase3Score,
    reason: phase3Reasons.length > 0 ? phase3Reasons.join(', ') : 'No momentum trigger',
    histogramUp,
    signalCross,
    histogram: lastMACD.histogram?.toFixed(2),
    macd: lastMACD.MACD?.toFixed(2),
    signal: lastMACD.signal?.toFixed(2)
  };

  // ============================================================
  // VOLUME VALIDATION (25 points) - Confirms move legitimacy
  // Volume spike > 1.3x (15 pts) + Broke resistance (10 pts)
  // ============================================================
  const avgVolume10 = sma({ period: 10, values: volumes });
  const lastAvgVolume10 = avgVolume10[avgVolume10.length - 1];
  const volumeSpike = lastVolume > lastAvgVolume10 * 1.3;

  // Find 20-day resistance
  const lookbackHighs = highs.slice(-21, -1);
  const resistanceLevel = Math.max(...lookbackHighs);
  const brokeResistance = lastClose > resistanceLevel;

  let volumeScore = 0;
  let volumeReasons = [];

  if (volumeSpike) {
    volumeScore += 15;
    volumeReasons.push(`Volume spike ${(lastVolume/lastAvgVolume10).toFixed(1)}x`);
  }
  
  if (brokeResistance) {
    volumeScore += 10;
    volumeReasons.push(`Broke resistance ₹${resistanceLevel.toFixed(0)}`);
  }

  const volumePassed = volumeSpike || brokeResistance;
  
  const volumeResult = {
    passed: volumePassed,
    score: volumeScore,
    reason: volumeReasons.length > 0 ? volumeReasons.join(', ') : 'No volume confirmation',
    volumeSpike,
    brokeResistance,
    volumeRatio: (lastVolume/lastAvgVolume10).toFixed(2),
    resistance: resistanceLevel.toFixed(2)
  };

  // ============================================================
  // CALCULATE TOTAL SCORE & SIGNAL
  // If Phase 1 fails, score is capped at 15 max (counter-trend protection)
  // ============================================================
  let totalScore = phase1Score + phase2Score + phase3Score + volumeScore;
  
  // CRITICAL: If Phase 1 (filter) fails, cap the score at 15 max
  if (!phase1Passed) {
    totalScore = Math.min(totalScore, 15);
  }

  // Determine signal and confidence based on score
  let signal = 'NEUTRAL';
  let confidence = 'LOW';
  let isBullish = true;

  // Check for SELL conditions (bearish signals)
  const macdBearishCross = prevMACD.MACD !== undefined && lastMACD.MACD !== undefined
    && prevMACD.MACD >= prevMACD.signal && lastMACD.MACD < lastMACD.signal;
  const priceBelowEma = lastClose < lastEma50;
  const stochOverbought = lastStoch.k > 80 && lastStoch.d > 80;
  
  // Count bearish signals
  let bearishScore = 0;
  if (priceBelowEma) bearishScore += 40;
  if (macdBearishCross) bearishScore += 20;
  if (stochOverbought && lastStoch.k < lastStoch.d) bearishScore += 15;
  if (lastMACD.histogram < 0 && lastMACD.histogram < prevMACD.histogram) bearishScore += 15;

  if (bearishScore >= 60) {
    isBullish = false;
    totalScore = bearishScore;
    if (bearishScore >= 80) {
      signal = 'STRONG SELL';
      confidence = 'HIGH';
    } else if (bearishScore >= 60) {
      signal = 'SELL';
      confidence = 'MEDIUM';
    }
  } else {
    // Bullish signals
    if (totalScore >= 80) {
      signal = 'STRONG BUY';
      confidence = 'HIGH';
    } else if (totalScore >= 60) {
      signal = 'BUY';
      confidence = 'MEDIUM';
    } else if (totalScore >= 40) {
      signal = 'NEUTRAL';
      confidence = 'LOW';
    } else if (totalScore >= 20) {
      signal = 'SELL';
      confidence = 'MEDIUM';
    } else {
      signal = 'STRONG SELL';
      confidence = 'HIGH';
    }
  }

  return {
    phase1,
    phase2,
    phase3,
    volume: volumeResult,
    totalScore,
    signal,
    confidence,
    isBullish
  };
};

// ============================================================
// STRATEGY 2: CONNORS RSI-2 (Larry Connors - Mean Reversion)
// Buy deep oversold dips in uptrending stocks
// ============================================================
const analyzeConnorsRSI = (data) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    aboveSma200: false,
    rsi2: null,
    aboveSma5: false
  };

  if (data.length < 200) return insufficientResult;

  const closes = data.map(d => d.close);
  const lastClose = closes[closes.length - 1];

  // 200 SMA - Long-term trend filter
  const sma200Values = sma({ period: 200, values: closes });
  const lastSma200 = sma200Values[sma200Values.length - 1];
  const aboveSma200 = lastClose > lastSma200;

  // RSI with period 2 (very short-term oversold detection)
  const rsi2Values = rsi({ period: 2, values: closes });
  const lastRsi2 = rsi2Values[rsi2Values.length - 1];
  const prevRsi2 = rsi2Values[rsi2Values.length - 2];

  // 5 SMA - Exit timing
  const sma5Values = sma({ period: 5, values: closes });
  const lastSma5 = sma5Values[sma5Values.length - 1];
  const aboveSma5 = lastClose > lastSma5;

  // Calculate score and signals
  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  // Must be in uptrend (above 200 SMA)
  if (aboveSma200) {
    score += 30;
    reasons.push('Above 200 SMA (uptrend)');

    // BUY: RSI(2) < 10 (deeply oversold)
    if (lastRsi2 < 5) {
      score += 40;
      reasons.push(`RSI(2) = ${lastRsi2.toFixed(1)} (extreme oversold)`);
      signal = 'STRONG BUY';
    } else if (lastRsi2 < 10) {
      score += 30;
      reasons.push(`RSI(2) = ${lastRsi2.toFixed(1)} (oversold)`);
      signal = 'BUY';
    } else if (lastRsi2 < 20) {
      score += 15;
      reasons.push(`RSI(2) = ${lastRsi2.toFixed(1)} (pullback)`);
    }

    // EXIT: Price closes above 5 SMA (take profit)
    if (aboveSma5 && prevRsi2 < 20 && lastRsi2 >= 20) {
      score += 20;
      reasons.push('Crossed above 5 SMA (exit signal)');
      signal = 'SELL';
    }
  } else {
    reasons.push('Below 200 SMA (no trade)');
    signal = 'NEUTRAL';
  }

  // Avoid buying if already overbought
  if (lastRsi2 > 90) {
    signal = 'SELL';
    reasons = ['RSI(2) overbought > 90'];
    score = 20;
  }

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'No setup',
    aboveSma200,
    rsi2: lastRsi2?.toFixed(1),
    aboveSma5,
    sma200: lastSma200?.toFixed(2)
  };
};

// ============================================================
// STRATEGY 3: TURTLE SOUP / DONCHIAN BREAKOUT (Richard Dennis)
// Buy breakout above 20-day high, exit at 10-day low
// ============================================================
const analyzeTurtleSoup = (data) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    breakout: false,
    newHigh20: false,
    above10Low: true
  };

  if (data.length < 50) return insufficientResult;

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // Donchian Channel - 20 period for entry
  const last20Highs = highs.slice(-21, -1); // Exclude today
  const donchian20High = Math.max(...last20Highs);
  
  // Donchian Channel - 10 period for exit
  const last10Lows = lows.slice(-11, -1);
  const donchian10Low = Math.min(...last10Lows);

  // ATR for stop loss calculation
  const atrValues = atr({ period: 14, high: highs, low: lows, close: closes });
  const lastAtr = atrValues[atrValues.length - 1];

  // Entry: Price breaks above 20-day high
  const brokeOut = lastClose > donchian20High;
  const freshBreakout = lastClose > donchian20High && prevClose <= donchian20High;

  // Exit: Price touches 10-day low
  const touchedExit = lastClose <= donchian10Low;

  // Trend strength: How far above the 20-day low
  const last20Lows = lows.slice(-21, -1);
  const donchian20Low = Math.min(...last20Lows);
  const range = donchian20High - donchian20Low;
  const positionInRange = range > 0 ? (lastClose - donchian20Low) / range : 0.5;

  // Calculate score
  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  if (freshBreakout) {
    score += 50;
    reasons.push(`Breakout above 20-day high ₹${donchian20High.toFixed(0)}`);
    signal = 'STRONG BUY';
  } else if (brokeOut) {
    score += 30;
    reasons.push(`Above 20-day high`);
    signal = 'BUY';
  }

  // Add points for strong position
  if (positionInRange > 0.8) {
    score += 20;
    reasons.push('Near top of range');
  } else if (positionInRange > 0.5) {
    score += 10;
    reasons.push('Upper half of range');
  }

  // Pyramiding opportunity: If trending strongly
  if (brokeOut && lastAtr > 0) {
    const atrRatio = (lastClose - donchian20High) / lastAtr;
    if (atrRatio >= 1) {
      score += 20;
      reasons.push(`+${atrRatio.toFixed(1)} ATR (pyramid)` );
    }
  }

  // EXIT signal
  if (touchedExit) {
    signal = 'SELL';
    reasons = [`Hit 10-day low ₹${donchian10Low.toFixed(0)} (exit)`];
    score = 15;
  }

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'No breakout',
    breakout: brokeOut,
    newHigh20: freshBreakout,
    above10Low: !touchedExit,
    donchian20High: donchian20High?.toFixed(2),
    donchian10Low: donchian10Low?.toFixed(2),
    atr: lastAtr?.toFixed(2)
  };
};

// ============================================================
// STRATEGY 4: OPENING RANGE BREAKOUT (Toby Crabel)
// For daily data: Uses first few days of month/week as "range"
// Adapted for EOD: Use recent consolidation range
// ============================================================
const analyzeOpeningRange = (data) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    breakout: false,
    aboveVwap: false,
    volumeConfirm: false
  };

  if (data.length < 20) return insufficientResult;

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // Define "Opening Range" using last 5 days consolidation
  const rangeData = data.slice(-6, -1); // Last 5 days excluding today
  const rangeHigh = Math.max(...rangeData.map(d => d.high));
  const rangeLow = Math.min(...rangeData.map(d => d.low));
  const rangeWidth = rangeHigh - rangeLow;

  // Calculate VWAP approximation (typical price * volume weighted)
  const recentData = data.slice(-10);
  let vwapNumerator = 0;
  let vwapDenominator = 0;
  recentData.forEach(d => {
    const typicalPrice = (d.high + d.low + d.close) / 3;
    vwapNumerator += typicalPrice * d.volume;
    vwapDenominator += d.volume;
  });
  const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : lastClose;
  const aboveVwap = lastClose > vwap;

  // Volume confirmation
  const avgVolume5 = sma({ period: 5, values: volumes });
  const lastAvgVolume = avgVolume5[avgVolume5.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  const volumeSpike = lastVolume > lastAvgVolume * 1.3;

  // Breakout detection
  const brokeHigh = lastClose > rangeHigh && prevClose <= rangeHigh;
  const aboveRange = lastClose > rangeHigh;
  const brokeLow = lastClose < rangeLow && prevClose >= rangeLow;
  const belowRange = lastClose < rangeLow;

  // Calculate score
  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  // Bullish breakout
  if (brokeHigh) {
    score += 35;
    reasons.push(`Broke range high ₹${rangeHigh.toFixed(0)}`);
    
    if (aboveVwap) {
      score += 20;
      reasons.push('Above VWAP');
    }
    
    if (volumeSpike) {
      score += 25;
      reasons.push(`Volume ${(lastVolume/lastAvgVolume).toFixed(1)}x`);
    }

    signal = score >= 60 ? 'BUY' : 'NEUTRAL';
    if (score >= 80) signal = 'STRONG BUY';
  } else if (aboveRange && aboveVwap) {
    score += 30;
    reasons.push('Holding above range');
    if (volumeSpike) score += 15;
    signal = 'BUY';
  }

  // Bearish breakdown
  if (brokeLow || belowRange) {
    signal = 'SELL';
    reasons = [`Below range low ₹${rangeLow.toFixed(0)}`];
    score = 20;
  }

  // Target calculation
  const target = rangeHigh + (rangeWidth * 2);

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'In range',
    breakout: brokeHigh || aboveRange,
    aboveVwap,
    volumeConfirm: volumeSpike,
    rangeHigh: rangeHigh?.toFixed(2),
    rangeLow: rangeLow?.toFixed(2),
    vwap: vwap?.toFixed(2),
    target: target?.toFixed(2)
  };
};

// ============================================================
// MAIN ANALYSIS FUNCTION - Using All 4 Strategies
// ============================================================
export const fetchIndexAnalysis = async (indexSymbol) => {
  try {
    // 1. Fetch stocks in the index
    const stocks = await fetchIndexStocks(indexSymbol);
    
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < stocks.length; i += chunkSize) {
      chunks.push(stocks.slice(i, i + chunkSize));
    }

    const results = await Promise.all(chunks.map(async (chunk) => {
      const symbols = chunk.map(s => s.symbol).join(',');
      try {
        // Fetch 1 year data for proper analysis
        const response = await fetch(`/api/stock-data?symbols=${symbols}&period=1y&interval=1d`);
        if (!response.ok) return {};
        return await response.json();
      } catch (e) {
        console.error("Batch fetch error:", e);
        return {};
      }
    }));

    const combinedData = Object.assign({}, ...results);

    // 3. Calculate all 4 strategies for each stock
    return stocks.map(stock => {
      const data = combinedData[stock.symbol];
      const defaultStrategy = { signal: 'NEUTRAL', score: 0, reason: 'Insufficient data' };
      
      if (!data || data.length < 50) {
        return {
          ...stock,
          lastPrice: data?.[data.length - 1]?.close || null,
          trendPullback: defaultStrategy,
          connorsRSI: defaultStrategy,
          turtleSoup: defaultStrategy,
          openingRange: defaultStrategy,
          overallSignal: 'NEUTRAL',
          overallScore: 0,
          buyCount: 0
        };
      }

      const closes = data.map(d => d.close);
      const lastClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      const change = ((lastClose - prevClose) / prevClose * 100).toFixed(2);

      // Run all 4 strategies
      const trendPullbackResult = analyzeWeightedStrategy(data);
      const connorsRSIResult = analyzeConnorsRSI(data);
      const turtleSoupResult = analyzeTurtleSoup(data);
      const openingRangeResult = analyzeOpeningRange(data);

      // Count BUY signals
      const signals = [
        trendPullbackResult.signal,
        connorsRSIResult.signal,
        turtleSoupResult.signal,
        openingRangeResult.signal
      ];
      const buyCount = signals.filter(s => s === 'BUY' || s === 'STRONG BUY').length;
      const sellCount = signals.filter(s => s === 'SELL' || s === 'STRONG SELL').length;

      // Overall score
      const overallScore = Math.round(
        (trendPullbackResult.totalScore + 
         connorsRSIResult.score + 
         turtleSoupResult.score + 
         openingRangeResult.score) / 4
      );

      // Overall signal
      let overallSignal = 'NEUTRAL';
      if (buyCount >= 3) overallSignal = 'STRONG BUY';
      else if (buyCount >= 2) overallSignal = 'BUY';
      else if (sellCount >= 3) overallSignal = 'STRONG SELL';
      else if (sellCount >= 2) overallSignal = 'SELL';

      return {
        ...stock,
        lastPrice: lastClose,
        change: parseFloat(change),
        volume: data[data.length - 1].volume,
        // Strategy 1: Trend-Pullback
        trendPullback: {
          signal: trendPullbackResult.signal,
          score: trendPullbackResult.totalScore,
          confidence: trendPullbackResult.confidence,
          reason: trendPullbackResult.phase1?.reason
        },
        // Strategy 2: Connors RSI-2
        connorsRSI: {
          signal: connorsRSIResult.signal,
          score: connorsRSIResult.score,
          rsi2: connorsRSIResult.rsi2,
          reason: connorsRSIResult.reason
        },
        // Strategy 3: Turtle Soup
        turtleSoup: {
          signal: turtleSoupResult.signal,
          score: turtleSoupResult.score,
          breakout: turtleSoupResult.breakout,
          reason: turtleSoupResult.reason
        },
        // Strategy 4: Opening Range
        openingRange: {
          signal: openingRangeResult.signal,
          score: openingRangeResult.score,
          breakout: openingRangeResult.breakout,
          reason: openingRangeResult.reason
        },
        overallSignal,
        overallScore,
        buyCount
      };
    });

  } catch (error) {
    console.error(`Error fetching index analysis for ${indexSymbol}:`, error);
    throw error;
  }
}; 