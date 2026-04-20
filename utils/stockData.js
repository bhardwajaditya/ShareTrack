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

import { sma, ema, rsi, atr, macd, bollingerbands, stochastic, adx, mfi } from 'technicalindicators';

// ============================================================
// TREND-PULLBACK WEIGHTED STRATEGY SYSTEM
// 3-Phase approach with weighted scoring (100 points total)
// Phase 1 (Filter): 40% - PVB + Trend
// Phase 2 (Setup): 15% - Stochastic + Bollinger  
// Phase 3 (Trigger): 20% - MACD
// Volume Validation: 25%
// ============================================================

export const analyzeWeightedStrategy = (data, index = null) => {
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

  // Support backtest mode: if index provided, slice data to that point
  const workingData = index !== null ? data.slice(0, index + 1) : data;
  if (workingData.length < 50) return insufficientResult; 

  const closes = workingData.map(d => d.close);
  const highs = workingData.map(d => d.high);
  const lows = workingData.map(d => d.low);
  const volumes = workingData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // ============================================================
  // PHASE 1: FILTER (40 points) - Must pass to not cap score
  // Price > 50 EMA (20 pts) + Volume > Average (20 pts)
  // ============================================================
  const ema50Values = ema({ period: 50, values: closes });
  const lastEma50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : lastClose;
  const priceAboveEma50 = lastClose > lastEma50;

  const avgVolume20 = sma({ period: 20, values: volumes });
  const lastAvgVolume20 = avgVolume20.length > 0 ? avgVolume20[avgVolume20.length - 1] : volumes[volumes.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  const volumeAboveAvg = lastVolume > lastAvgVolume20;

  let phase1Score = 0;
  let phase1Reasons = [];
  
  if (priceAboveEma50) {
    phase1Score += 20;
    phase1Reasons.push(`Price ₹${lastClose.toFixed(0)} > 50 EMA ₹${lastEma50?.toFixed(0) || 0}`);
  } else {
    phase1Reasons.push(`Price below 50 EMA (₹${lastEma50?.toFixed(0) || 0})`);
  }
  
  if (volumeAboveAvg) {
    phase1Score += 20;
    phase1Reasons.push(`Volume ${lastAvgVolume20 > 0 ? (lastVolume/lastAvgVolume20).toFixed(1) : '1.0'}x avg`);
  } else {
    phase1Reasons.push(`Low volume (${lastAvgVolume20 > 0 ? (lastVolume/lastAvgVolume20).toFixed(1) : '0.0'}x)`);
  }

  const phase1Passed = priceAboveEma50 && volumeAboveAvg;

  const phase1 = {
    passed: phase1Passed,
    score: phase1Score,
    reason: phase1Reasons.join(', '),
    priceAboveEma: priceAboveEma50,
    volumeAboveAvg: volumeAboveAvg,
    ema50: lastEma50?.toFixed(2),
    volumeRatio: lastAvgVolume20 > 0 ? (lastVolume/lastAvgVolume20).toFixed(2) : '1.00'
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
// STRATEGY 2: MFI MOMENTUM TREND
// Buy pullbacks in uptrends using volume-weighted momentum
// MFI combines price AND volume for superior signal quality
// ============================================================
export const analyzeConnorsRSI = (data, index = null) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    aboveEma50: false,
    emaAligned: false,
    mfi: null,
    adx: null,
    volumeRatio: null
  };

  const workingData = index !== null ? data.slice(0, index + 1) : data;
  if (workingData.length < 50) return insufficientResult;

  const closes = workingData.map(d => d.close);
  const highs = workingData.map(d => d.high);
  const lows = workingData.map(d => d.low);
  const volumes = workingData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];

  // PHASE 1: Trend Filter (40 pts max)
  const ema50Values = ema({ period: 50, values: closes });
  const ema20Values = ema({ period: 20, values: closes });
  const lastEma50 = ema50Values[ema50Values.length - 1];
  const lastEma20 = ema20Values[ema20Values.length - 1];

  const priceAboveEma50 = lastClose > lastEma50;
  const emaAligned = lastEma20 > lastEma50;

  let phase1Score = 0;
  let reasons = [];

  if (priceAboveEma50) {
    phase1Score += 25;
    reasons.push('Above 50 EMA (uptrend)');
  }
  if (emaAligned) {
    phase1Score += 15;
    reasons.push('20 EMA > 50 EMA (aligned)');
  }

  // PHASE 2: MFI Setup (30 pts max)
  const mfiValues = mfi({
    high: highs,
    low: lows,
    close: closes,
    volume: volumes,
    period: 14
  });
  const lastMFI = mfiValues[mfiValues.length - 1];
  const prevMFI = mfiValues[mfiValues.length - 2];

  const mfiPullback = lastMFI < 40;
  const mfiOversold = lastMFI < 30;
  const mfiRising = lastMFI > prevMFI;
  const mfiOverbought = lastMFI > 80;

  let phase2Score = 0;
  if (mfiPullback) {
    phase2Score += 20;
    reasons.push(`MFI = ${lastMFI.toFixed(0)} (pullback zone)`);
  }
  if (mfiRising && mfiPullback) {
    phase2Score += 10;
    reasons.push('MFI turning up');
  }

  // PHASE 3: Confirmation (30 pts max)
  const adxResult = adx({ period: 14, high: highs, low: lows, close: closes });
  const lastADX = adxResult[adxResult.length - 1]?.adx || 0;
  const trending = lastADX > 20;

  const avgVolume10 = sma({ period: 10, values: volumes });
  const lastAvgVolume = avgVolume10[avgVolume10.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  const volumeRatio = lastAvgVolume > 0 ? lastVolume / lastAvgVolume : 0;
  const volumeSpike = volumeRatio > 1.3;

  let phase3Score = 0;
  if (trending) {
    phase3Score += 15;
    reasons.push(`ADX = ${lastADX.toFixed(0)} (trending)`);
  }
  if (volumeSpike) {
    phase3Score += 15;
    reasons.push(`Volume ${volumeRatio.toFixed(1)}x avg`);
  }

  // Calculate total score
  let totalScore = phase1Score + phase2Score + phase3Score;

  // CRITICAL: Cap score if trend filter fails
  if (!priceAboveEma50) {
    totalScore = Math.min(totalScore, 20);
    reasons = ['Below 50 EMA (no trade)'];
  }

  // Signal determination
  let signal = 'NEUTRAL';

  if (priceAboveEma50) {
    if (totalScore >= 80 && mfiOversold) {
      signal = 'STRONG BUY';
    } else if (totalScore >= 60) {
      signal = 'BUY';
    }
  }

  // Exit conditions
  if (mfiOverbought) {
    signal = 'SELL';
    reasons = [`MFI = ${lastMFI.toFixed(0)} (overbought - take profit)`];
    totalScore = 25;
  }

  if (lastClose < lastEma20 && !mfiRising && lastMFI > 50) {
    signal = 'STRONG SELL';
    reasons = ['Below 20 EMA + MFI falling (exit)'];
    totalScore = 15;
  }

  return {
    signal,
    score: totalScore,
    reason: reasons.join(', ') || 'No setup',
    aboveEma50: priceAboveEma50,
    emaAligned,
    mfi: lastMFI?.toFixed(1),
    adx: lastADX?.toFixed(1),
    volumeRatio: volumeRatio?.toFixed(2)
  };
};

// ============================================================
// STRATEGY 3: MOMENTUM BREAKOUT (Replaces Turtle Soup)
// Buy momentum breakouts with trend and volume confirmation
// Higher win rate than classic Turtle for Indian equities
// ============================================================
export const analyzeMomentumBreakout = (data, index = null) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    aboveEma20: false,
    aboveEma50: false,
    rsi14InRange: false,
    volumeConfirm: false,
    strongTrend: false
  };

  // Support backtest mode: if index provided, slice data to that point
  const workingData = index !== null ? data.slice(0, index + 1) : data;
  if (workingData.length < 50) return insufficientResult;

  const closes = workingData.map(d => d.close);
  const highs = workingData.map(d => d.high);
  const lows = workingData.map(d => d.low);
  const volumes = workingData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const lastVolume = volumes[volumes.length - 1];

  // Trend filters - 20 EMA and 50 EMA
  const ema20Values = ema({ period: 20, values: closes });
  const lastEma20 = ema20Values[ema20Values.length - 1];
  const aboveEma20 = lastClose > lastEma20;

  const ema50Values = ema({ period: 50, values: closes });
  const lastEma50 = ema50Values[ema50Values.length - 1];
  const aboveEma50 = lastClose > lastEma50;

  // RSI(14) in momentum zone (50-70 = bullish momentum, not overbought)
  const rsi14Values = rsi({ period: 14, values: closes });
  const lastRsi14 = rsi14Values[rsi14Values.length - 1];
  const rsi14InRange = lastRsi14 >= 50 && lastRsi14 <= 70;
  const rsiOverbought = lastRsi14 > 80;

  // ADX for trend strength
  const adxResult = adx({ period: 14, high: highs, low: lows, close: closes });
  const lastADX = adxResult[adxResult.length - 1]?.adx || 0;
  const strongTrend = lastADX > 25;

  // Volume confirmation (1.5x average)
  const avgVolume10 = sma({ period: 10, values: volumes });
  const lastAvgVolume = avgVolume10[avgVolume10.length - 1];
  const volumeConfirm = lastVolume > lastAvgVolume * 1.5;

  // 10-day high breakout
  const last10Highs = highs.slice(-11, -1);
  const high10Day = Math.max(...last10Highs);
  const breakout10Day = lastClose > high10Day && prevClose <= high10Day;
  const aboveHigh10Day = lastClose > high10Day;

  // ATR for trailing stop
  const atrValues = atr({ period: 14, high: highs, low: lows, close: closes });
  const lastAtr = atrValues[atrValues.length - 1];

  // Calculate score
  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  // Primary trend filters
  if (aboveEma20 && aboveEma50) {
    score += 20;
    reasons.push('Above 20/50 EMA');
  } else if (aboveEma20) {
    score += 10;
    reasons.push('Above 20 EMA');
  }

  // RSI momentum zone
  if (rsi14InRange) {
    score += 15;
    reasons.push(`RSI(14) ${lastRsi14.toFixed(0)} (momentum)`);
  } else if (lastRsi14 >= 40 && lastRsi14 < 50) {
    score += 5;
    reasons.push(`RSI(14) ${lastRsi14.toFixed(0)} (recovering)`);
  }

  // ADX trend strength
  if (strongTrend) {
    score += 20;
    reasons.push(`ADX ${lastADX.toFixed(0)} (strong trend)`);
  } else if (lastADX > 20) {
    score += 10;
    reasons.push(`ADX ${lastADX.toFixed(0)} (trending)`);
  }

  // Breakout detection
  if (breakout10Day) {
    score += 25;
    reasons.push(`Broke 10-day high \u20b9${high10Day.toFixed(0)}`);
  } else if (aboveHigh10Day) {
    score += 10;
    reasons.push('Holding above 10-day high');
  }

  // Volume confirmation
  if (volumeConfirm && (breakout10Day || aboveHigh10Day)) {
    score += 20;
    reasons.push(`Volume ${(lastVolume/lastAvgVolume).toFixed(1)}x`);
  }

  // Determine signal
  if (score >= 70 && (breakout10Day || (aboveHigh10Day && volumeConfirm))) {
    signal = 'STRONG BUY';
  } else if (score >= 50 && aboveEma20) {
    signal = 'BUY';
  }

  // EXIT CONDITIONS
  // 1. Price below 10 EMA
  const ema10Values = ema({ period: 10, values: closes });
  const lastEma10 = ema10Values[ema10Values.length - 1];
  const belowEma10 = lastClose < lastEma10 && prevClose >= lastEma10;

  // 2. RSI overbought
  if (rsiOverbought) {
    signal = 'SELL';
    reasons = [`RSI(14) ${lastRsi14.toFixed(0)} (overbought)`];
    score = 20;
  }

  // 3. Breakdown signal
  if (belowEma10 && !aboveEma50) {
    signal = 'SELL';
    reasons = ['Closed below 10 EMA, losing trend'];
    score = 15;
  }

  // Strong sell on major breakdown
  if (lastClose < lastEma50 && prevClose >= lastEma50) {
    signal = 'STRONG SELL';
    reasons = ['Broke below 50 EMA (trend reversal)'];
    score = 10;
  }

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'No momentum setup',
    aboveEma20,
    aboveEma50,
    rsi14: lastRsi14?.toFixed(1),
    rsi14InRange,
    adx: lastADX?.toFixed(1),
    strongTrend,
    volumeConfirm,
    breakout: breakout10Day || aboveHigh10Day,
    high10Day: high10Day?.toFixed(2),
    atr: lastAtr?.toFixed(2),
    ema10: lastEma10?.toFixed(2)
  };
};

// Legacy alias for backward compatibility
export const analyzeTurtleSoup = analyzeMomentumBreakout;

// ============================================================
// STRATEGY 4: OPENING RANGE BREAKOUT (IMPROVED)
// Uses 3-day consolidation range with stop-loss logic
// Better false breakout filtering for Indian equities
// ============================================================
export const analyzeOpeningRange = (data, index = null) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    breakout: false,
    aboveVwap: false,
    volumeConfirm: false,
    stopLoss: null
  };

  // Support backtest mode: if index provided, slice data to that point
  const workingData = index !== null ? data.slice(0, index + 1) : data;
  if (workingData.length < 20) return insufficientResult;

  const closes = workingData.map(d => d.close);
  const highs = workingData.map(d => d.high);
  const lows = workingData.map(d => d.low);
  const volumes = workingData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const lastVolume = volumes[volumes.length - 1];

  // Define "Opening Range" using last 3 days consolidation (tighter than 5 days)
  const rangeData = workingData.slice(-4, -1); // Last 3 days excluding today
  const rangeHigh = Math.max(...rangeData.map(d => d.high));
  const rangeLow = Math.min(...rangeData.map(d => d.low));
  const rangeWidth = rangeHigh - rangeLow;
  const rangeMid = (rangeHigh + rangeLow) / 2;

  // Minimum range width filter (avoid too-tight ranges that cause whipsaws)
  const avgPrice = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const minRangeWidth = avgPrice * 0.02; // Minimum 2% of price
  const validRange = rangeWidth >= minRangeWidth;

  // Calculate VWAP approximation (typical price * volume weighted)
  const recentData = workingData.slice(-10);
  let vwapNumerator = 0;
  let vwapDenominator = 0;
  recentData.forEach(d => {
    const typicalPrice = (d.high + d.low + d.close) / 3;
    vwapNumerator += typicalPrice * d.volume;
    vwapDenominator += d.volume;
  });
  const vwap = vwapDenominator > 0 ? vwapNumerator / vwapDenominator : lastClose;
  const aboveVwap = lastClose > vwap;

  // Volume confirmation (1.5x for stronger confirmation)
  const avgVolume5 = sma({ period: 5, values: volumes });
  const lastAvgVolume = avgVolume5[avgVolume5.length - 1];
  const volumeSpike = lastVolume > lastAvgVolume * 1.5; // Increased from 1.3x

  // Breakout detection
  const brokeHigh = lastClose > rangeHigh && prevClose <= rangeHigh;
  const aboveRange = lastClose > rangeHigh;
  const brokeLow = lastClose < rangeLow && prevClose >= rangeLow;
  const belowRange = lastClose < rangeLow;

  // Stop-loss at range midpoint
  const stopLoss = rangeMid;

  // Calculate score
  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  // Check for valid range width
  if (!validRange) {
    return {
      signal: 'NEUTRAL',
      score: 0,
      reason: `Range too tight (${((rangeWidth/avgPrice)*100).toFixed(1)}%)`,
      breakout: false,
      aboveVwap,
      volumeConfirm: volumeSpike,
      rangeHigh: rangeHigh?.toFixed(2),
      rangeLow: rangeLow?.toFixed(2),
      stopLoss: null,
      vwap: vwap?.toFixed(2),
      target: null
    };
  }

  // Bullish breakout
  if (brokeHigh) {
    score += 30;
    reasons.push(`Broke 3-day high \u20b9${rangeHigh.toFixed(0)}`);
    
    if (aboveVwap) {
      score += 25;
      reasons.push('Above VWAP');
    }
    
    if (volumeSpike) {
      score += 30;
      reasons.push(`Volume ${(lastVolume/lastAvgVolume).toFixed(1)}x`);
    }

    if (score >= 70) {
      signal = 'STRONG BUY';
    } else if (score >= 50) {
      signal = 'BUY';
    }
  } else if (aboveRange && aboveVwap) {
    score += 25;
    reasons.push('Holding above range');
    if (volumeSpike) {
      score += 20;
      reasons.push(`Volume confirmation`);
    }
    if (score >= 40) signal = 'BUY';
  }

  // Stop-loss trigger (at range midpoint)
  if (aboveRange && lastClose < stopLoss && prevClose >= stopLoss) {
    signal = 'SELL';
    reasons = [`Hit stop-loss at \u20b9${stopLoss.toFixed(0)} (range midpoint)`];
    score = 15;
  }

  // Bearish breakdown
  if (brokeLow) {
    signal = 'STRONG SELL';
    reasons = [`Broke 3-day low \u20b9${rangeLow.toFixed(0)}`];
    score = 10;
  } else if (belowRange) {
    signal = 'SELL';
    reasons = [`Below range low \u20b9${rangeLow.toFixed(0)}`];
    score = 15;
  }

  // Target calculation (1.5x range width instead of 2x for more realistic exits)
  const target = rangeHigh + (rangeWidth * 1.5);

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'In range (waiting for breakout)',
    breakout: brokeHigh || aboveRange,
    aboveVwap,
    volumeConfirm: volumeSpike,
    rangeHigh: rangeHigh?.toFixed(2),
    rangeLow: rangeLow?.toFixed(2),
    rangeMid: rangeMid?.toFixed(2),
    stopLoss: stopLoss?.toFixed(2),
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
          momentumBreakout: defaultStrategy,
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

      // Run strategies
      const trendPullbackResult = analyzeWeightedStrategy(data);
      const connorsRSIResult = analyzeConnorsRSI(data);
      const momentumBreakoutResult = analyzeMomentumBreakout(data);
      const openingRangeResult = analyzeOpeningRange(data);
      const sidewaysRangeResult = analyzeRangeReversion(data);

      // Count BUY signals - Consensus ONLY from Trend/Momentum strategies
      const signals = [
        trendPullbackResult.signal,
        connorsRSIResult.signal,
        momentumBreakoutResult.signal,
        openingRangeResult.signal
      ];
      const buyCount = signals.filter(s => s === 'BUY' || s === 'STRONG BUY').length;
      const sellCount = signals.filter(s => s === 'SELL' || s === 'STRONG SELL').length;

      // Overall score (Consensus of 4 strategies)
      const overallScore = Math.round(
        (trendPullbackResult.totalScore + 
         connorsRSIResult.score + 
         momentumBreakoutResult.score + 
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
        // Strategy 2: MFI Momentum Trend
        connorsRSI: {
          signal: connorsRSIResult.signal,
          score: connorsRSIResult.score,
          mfi: connorsRSIResult.mfi,
          reason: connorsRSIResult.reason
        },
        // Strategy 3: Momentum Breakout
        momentumBreakout: {
          signal: momentumBreakoutResult.signal,
          score: momentumBreakoutResult.score,
          breakout: momentumBreakoutResult.breakout,
          reason: momentumBreakoutResult.reason
        },
        // Strategy 4: Opening Range
        openingRange: {
          signal: openingRangeResult.signal,
          score: openingRangeResult.score,
          breakout: openingRangeResult.breakout,
          reason: openingRangeResult.reason
        },
        // Strategy 5: Sideways Range (Separate)
        sidewaysRange: {
          signal: sidewaysRangeResult.signal,
          score: sidewaysRangeResult.score,
          isSideways: sidewaysRangeResult.isSideways,
          reason: sidewaysRangeResult.reason,
          // Extra details for UI
          adx: sidewaysRangeResult.adx,
          nearSupport: sidewaysRangeResult.nearSupport,
          rsi: sidewaysRangeResult.rsi
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

// ============================================================
// STRATEGY 5: RANGE REVERSION (SIDEWAYS MARKET)
// Trades the bottom of the range in sideways markets
// Key indicators: Low ADX (Sideways), Lower BB & RSI (Oversold)
// ============================================================
export const analyzeRangeReversion = (data, index = null) => {
  const insufficientResult = {
    signal: 'NEUTRAL',
    score: 0,
    reason: 'Insufficient data',
    adx: null,
    isSideways: false,
    nearSupport: false,
    rsi: null
  };

  const workingData = index !== null ? data.slice(0, index + 1) : data;
  if (workingData.length < 50) return insufficientResult;

  const closes = workingData.map(d => d.close);
  const highs = workingData.map(d => d.high);
  const lows = workingData.map(d => d.low);
  const lastClose = closes[closes.length - 1];

  // 1. Identify Sideways Market (ADX < 25)
  const adxResult = adx({ period: 14, high: highs, low: lows, close: closes });
  const lastADX = adxResult[adxResult.length - 1]?.adx || 0;
  // Using 25 as threshold for non-trending / sideways
  const isSideways = lastADX < 25;

  // 2. Identify Bottom of Range (Lower Bollinger Band)
  const bbResult = bollingerbands({ period: 20, values: closes, stdDev: 2 });
  const lastBB = bbResult[bbResult.length - 1] || {};
  // Near Lower Band (within 1% or below)
  const nearLowerBB = lastClose <= (lastBB.lower * 1.01); 

  // 3. Oversold Condition (RSI < 45) - Relaxed slightly for range trading
  const rsiValues = rsi({ period: 14, values: closes });
  const lastRSI = rsiValues[rsiValues.length - 1];
  const isOversold = lastRSI < 45;

  // 4. Reversal Trigger (Green Candle OR RSI ticking up)
  const prevRSI = rsiValues[rsiValues.length - 2];
  const isGreenCandle = lastClose > workingData[workingData.length - 1].open;
  const rsiTickUp = lastRSI > prevRSI;
  const reversal = isGreenCandle || rsiTickUp;

  let score = 0;
  let reasons = [];
  let signal = 'NEUTRAL';

  if (isSideways) {
    score += 20;
    reasons.push(`ADX ${lastADX.toFixed(0)} (sideways/weak trend)`);
  }

  if (nearLowerBB) {
    score += 30;
    reasons.push('At Lower BB Support');
  }

  if (isOversold) {
    score += 20;
    reasons.push(`RSI ${lastRSI.toFixed(0)} (oversold)`);
  }

  if (reversal && (nearLowerBB || isOversold)) {
    score += 30;
    reasons.push('Reversal trigger');
  }

  // Signal Generation
  // Strong signal: Sideways + Support + Reversal
  if (isSideways && nearLowerBB && reversal) {
    if (score >= 80) signal = 'STRONG BUY';
    else if (score >= 60) signal = 'BUY';
  } 
  // Backup signal: Just Mean Reversion (even if trend is ambiguous)
  else if (nearLowerBB && isOversold && reversal) {
    signal = 'BUY';
    score = Math.max(score, 60);
    reasons.push('(Mean Reversion)');
  }

  // Exit/Sell Condition: Upper BB or RSI Overbought
  const nearUpperBB = lastBB.upper && lastClose >= (lastBB.upper * 0.99);
  if (nearUpperBB || lastRSI > 70) {
    signal = 'SELL';
    reasons = ['Near Upper Range / Overbought'];
    score = 20; // Low score for BUY means SELL potentially
  }

  return {
    signal,
    score,
    reason: reasons.join(', ') || 'No setup',
    adx: lastADX?.toFixed(1),
    isSideways,
    nearSupport: nearLowerBB,
    rsi: lastRSI?.toFixed(1)
  };
}; 