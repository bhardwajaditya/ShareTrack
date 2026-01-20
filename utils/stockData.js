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
// STRATEGY 1: Price Volume Breakout (PVB)
// ============================================================
const analyzePVB = (data) => {
  if (data.length < 50) return { signal: 'NEUTRAL', reason: 'Insufficient data (need 50+ days)' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  // Calculate 50 EMA
  const ema50 = ema({ period: 50, values: closes });
  const lastEma50 = ema50[ema50.length - 1];
  const lastClose = closes[closes.length - 1];

  // Calculate 20-day average volume
  const avgVolume20 = sma({ period: 20, values: volumes });
  const lastAvgVolume = avgVolume20[avgVolume20.length - 1];
  const lastVolume = volumes[volumes.length - 1];

  // Find resistance: max high of last 20 days (excluding last candle)
  const lookbackHighs = highs.slice(-21, -1);
  const resistanceLevel = Math.max(...lookbackHighs);

  // Check conditions
  const aboveEma50 = lastClose > lastEma50;
  const brokeResistance = lastClose > resistanceLevel;
  const volumeConfirmed = lastVolume >= 1.5 * lastAvgVolume;

  let signal = 'NEUTRAL';
  let reason = '';

  if (aboveEma50 && brokeResistance && volumeConfirmed) {
    signal = 'BUY';
    reason = `Breakout above ${resistanceLevel.toFixed(2)} with ${(lastVolume / lastAvgVolume).toFixed(1)}x volume`;
  } else if (!aboveEma50) {
    signal = 'NEUTRAL';
    reason = 'Price below 50 EMA';
  } else if (brokeResistance && !volumeConfirmed) {
    signal = 'NEUTRAL';
    reason = 'Breakout without volume confirmation';
  } else {
    reason = 'No breakout signal';
  }

  return {
    signal,
    reason,
    ema50: lastEma50?.toFixed(2) || 'N/A',
    resistance: resistanceLevel.toFixed(2),
    volumeRatio: (lastVolume / lastAvgVolume).toFixed(2)
  };
};

// ============================================================
// STRATEGY 2: VSA "No Supply" Pullback
// ============================================================
const analyzeVSA = (data) => {
  if (data.length < 25) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  // Check uptrend: Higher Highs and Higher Lows over last 20 days
  const recentData = data.slice(-20);
  let higherHighs = 0;
  let higherLows = 0;
  for (let i = 1; i < recentData.length; i++) {
    if (recentData[i].high > recentData[i - 1].high) higherHighs++;
    if (recentData[i].low > recentData[i - 1].low) higherLows++;
  }
  const isUptrend = higherHighs > 10 && higherLows > 10;

  // Calculate 20 EMA for support reference
  const ema20 = ema({ period: 20, values: closes });
  const lastEma20 = ema20[ema20.length - 1];
  const lastClose = closes[closes.length - 1];

  // Check for "No Supply" candle (last 3 candles)
  const last3 = data.slice(-3);
  let noSupplyFound = false;
  let noSupplyIndex = -1;

  for (let i = 0; i < last3.length - 1; i++) {
    const candle = last3[i];
    const spread = candle.high - candle.low;
    const avgSpread = (data.slice(-20).reduce((sum, d) => sum + (d.high - d.low), 0)) / 20;
    const isNarrowRange = spread < avgSpread * 0.5;
    const isRedCandle = candle.close < candle.open;
    const isLowVolume = candle.volume < last3[i > 0 ? i - 1 : 0].volume && 
                        (i > 1 ? candle.volume < last3[i - 2].volume : true);

    if (isNarrowRange && isRedCandle && isLowVolume) {
      noSupplyFound = true;
      noSupplyIndex = i;
    }
  }

  // Check if price is near 20 EMA (pullback to support)
  const nearEma20 = Math.abs(lastClose - lastEma20) / lastClose < 0.02; // Within 2%

  let signal = 'NEUTRAL';
  let reason = '';

  if (isUptrend && noSupplyFound && nearEma20) {
    signal = 'BUY';
    reason = 'No Supply candle found in uptrend pullback near 20 EMA';
  } else if (!isUptrend) {
    reason = 'Not in uptrend';
  } else if (!noSupplyFound) {
    reason = 'No "No Supply" candle detected';
  } else {
    reason = 'Conditions not met';
  }

  return {
    signal,
    reason,
    uptrend: isUptrend ? 'Yes' : 'No',
    ema20: lastEma20?.toFixed(2) || 'N/A'
  };
};

// ============================================================
// STRATEGY 3: Donchian Channel Trend Following
// ============================================================
const analyzeDonchian = (data) => {
  if (data.length < 20) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);

  // Calculate Donchian Channel (20 period)
  const period = 20;
  const lookbackHighs = highs.slice(-period - 1, -1); // Last 20 highs excluding today
  const lookbackLows = lows.slice(-period - 1, -1);   // Last 20 lows excluding today

  const upperChannel = Math.max(...lookbackHighs);
  const lowerChannel = Math.min(...lookbackLows);
  const middleChannel = (upperChannel + lowerChannel) / 2;

  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  let signal = 'NEUTRAL';
  let reason = '';

  // Buy: Close above upper channel (new 20-day high)
  if (lastClose > upperChannel) {
    signal = 'BUY';
    reason = `New 20-day high breakout above ${upperChannel.toFixed(2)}`;
  }
  // Sell: Close below middle band (quicker exit) or lower band
  else if (lastClose < lowerChannel) {
    signal = 'SELL';
    reason = `Broke below 20-day low at ${lowerChannel.toFixed(2)}`;
  } else if (lastClose < middleChannel && prevClose >= middleChannel) {
    signal = 'SELL';
    reason = `Crossed below middle band at ${middleChannel.toFixed(2)}`;
  } else {
    reason = 'Trading within channel';
  }

  return {
    signal,
    reason,
    upper: upperChannel.toFixed(2),
    middle: middleChannel.toFixed(2),
    lower: lowerChannel.toFixed(2)
  };
};

// ============================================================
// STRATEGY 4: RSI + Supertrend Hybrid
// ============================================================
const analyzeRSISupertrend = (data) => {
  if (data.length < 20) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);

  // Calculate RSI (14 period)
  const rsiValues = rsi({ period: 14, values: closes });
  const lastRsi = rsiValues[rsiValues.length - 1];
  const prevRsi = rsiValues[rsiValues.length - 2];

  // Calculate ATR for Supertrend (10 period, multiplier 3)
  const atrPeriod = 10;
  const multiplier = 3;
  const atrValues = atr({ period: atrPeriod, high: highs, low: lows, close: closes });

  // Calculate Supertrend
  let supertrend = [];
  let direction = []; // 1 = up (green), -1 = down (red)

  for (let i = 0; i < closes.length; i++) {
    if (i < atrPeriod) {
      supertrend.push(null);
      direction.push(0);
      continue;
    }

    const atrIndex = i - atrPeriod;
    if (atrIndex < 0 || atrIndex >= atrValues.length) {
      supertrend.push(null);
      direction.push(0);
      continue;
    }

    const currentAtr = atrValues[atrIndex];
    const hl2 = (highs[i] + lows[i]) / 2;
    
    const basicUpperBand = hl2 + (multiplier * currentAtr);
    const basicLowerBand = hl2 - (multiplier * currentAtr);

    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;

    if (i > atrPeriod && supertrend[i - 1] !== null) {
      const prevSupertrend = supertrend[i - 1];
      const prevDirection = direction[i - 1];
      
      // Adjust bands based on previous values
      if (prevDirection === 1) { // Was bullish
        finalLowerBand = Math.max(basicLowerBand, prevSupertrend);
        if (closes[i] < finalLowerBand) {
          supertrend.push(finalUpperBand);
          direction.push(-1);
        } else {
          supertrend.push(finalLowerBand);
          direction.push(1);
        }
      } else { // Was bearish
        finalUpperBand = Math.min(basicUpperBand, prevSupertrend);
        if (closes[i] > finalUpperBand) {
          supertrend.push(finalLowerBand);
          direction.push(1);
        } else {
          supertrend.push(finalUpperBand);
          direction.push(-1);
        }
      }
    } else {
      // Initial direction based on close vs mid
      if (closes[i] > hl2) {
        supertrend.push(basicLowerBand);
        direction.push(1);
      } else {
        supertrend.push(basicUpperBand);
        direction.push(-1);
      }
    }
  }

  const lastDirection = direction[direction.length - 1];
  const supertrendGreen = lastDirection === 1;
  const rsiCrossedAbove60 = prevRsi < 60 && lastRsi >= 60;
  const rsiAbove60 = lastRsi >= 60;
  const rsiBelow40 = lastRsi < 40;

  let signal = 'NEUTRAL';
  let reason = '';

  if (supertrendGreen && (rsiCrossedAbove60 || rsiAbove60)) {
    signal = 'BUY';
    reason = `Supertrend Green + RSI at ${lastRsi?.toFixed(1)}`;
  } else if (!supertrendGreen || rsiBelow40) {
    signal = 'SELL';
    reason = supertrendGreen ? `RSI dropped to ${lastRsi?.toFixed(1)}` : 'Supertrend turned Red';
  } else {
    reason = 'No clear signal';
  }

  return {
    signal,
    reason,
    rsi: lastRsi?.toFixed(2) || 'N/A',
    supertrend: supertrendGreen ? 'Bullish' : 'Bearish'
  };
};

// ============================================================
// STRATEGY 5: Moving Average Crossover (Golden Cross / Death Cross)
// ============================================================
const analyzeMACrossover = (data) => {
  if (data.length < 200) return { signal: 'NEUTRAL', reason: 'Need 200+ days of data' };

  const closes = data.map(d => d.close);
  const ema50Values = ema({ period: 50, values: closes });
  const ema200Values = ema({ period: 200, values: closes });

  const lastEma50 = ema50Values[ema50Values.length - 1];
  const prevEma50 = ema50Values[ema50Values.length - 2];
  const lastEma200 = ema200Values[ema200Values.length - 1];
  const prevEma200 = ema200Values[ema200Values.length - 2];

  let signal = 'NEUTRAL';
  let reason = '';

  if (prevEma50 <= prevEma200 && lastEma50 > lastEma200) {
    signal = 'BUY';
    reason = 'Golden Cross (50 EMA crossed above 200 EMA)';
  } else if (prevEma50 >= prevEma200 && lastEma50 < lastEma200) {
    signal = 'SELL';
    reason = 'Death Cross (50 EMA crossed below 200 EMA)';
  } else if (lastEma50 > lastEma200) {
    reason = 'Bullish trend (50 EMA > 200 EMA)';
  } else {
    reason = 'Bearish trend (50 EMA < 200 EMA)';
  }

  return { signal, reason, ema50: lastEma50?.toFixed(2), ema200: lastEma200?.toFixed(2) };
};

// ============================================================
// STRATEGY 6: MACD Crossover
// ============================================================
const analyzeMACDCrossover = (data) => {
  if (data.length < 35) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const macdResult = macd({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });

  if (macdResult.length < 2) return { signal: 'NEUTRAL', reason: 'MACD not ready' };

  const last = macdResult[macdResult.length - 1];
  const prev = macdResult[macdResult.length - 2];

  if (!last || !prev || last.MACD === undefined) {
    return { signal: 'NEUTRAL', reason: 'MACD calculation pending' };
  }

  let signal = 'NEUTRAL';
  let reason = '';

  if (prev.MACD <= prev.signal && last.MACD > last.signal) {
    signal = 'BUY';
    reason = `MACD Bullish Crossover (Hist: ${last.histogram?.toFixed(2)})`;
  } else if (prev.MACD >= prev.signal && last.MACD < last.signal) {
    signal = 'SELL';
    reason = `MACD Bearish Crossover (Hist: ${last.histogram?.toFixed(2)})`;
  } else {
    reason = `MACD: ${last.MACD?.toFixed(2)}, Signal: ${last.signal?.toFixed(2)}`;
  }

  return { signal, reason, histogram: last.histogram?.toFixed(2) };
};

// ============================================================
// STRATEGY 7: Bollinger Bands Mean Reversion
// ============================================================
const analyzeBollingerBands = (data) => {
  if (data.length < 20) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const bbResult = bollingerbands({ period: 20, values: closes, stdDev: 2 });

  if (bbResult.length < 2) return { signal: 'NEUTRAL', reason: 'BB not ready' };

  const last = bbResult[bbResult.length - 1];
  const prev = bbResult[bbResult.length - 2];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  if (!last || !last.lower) return { signal: 'NEUTRAL', reason: 'BB calculation pending' };

  const percentB = (lastClose - last.lower) / (last.upper - last.lower);
  let signal = 'NEUTRAL';
  let reason = '';

  if (lastClose <= last.lower && prevClose > prev.lower) {
    signal = 'BUY';
    reason = 'Price touched Lower Band';
  } else if (prevClose <= prev.lower && lastClose > last.lower) {
    signal = 'BUY';
    reason = 'Bounce from Lower Band';
  } else if (lastClose >= last.upper && prevClose < prev.upper) {
    signal = 'SELL';
    reason = 'Price touched Upper Band';
  } else if (prevClose >= prev.upper && lastClose < last.upper) {
    signal = 'SELL';
    reason = 'Rejection from Upper Band';
  } else {
    reason = `%B: ${(percentB * 100).toFixed(1)}%`;
  }

  return { signal, reason, percentB: (percentB * 100).toFixed(1) };
};

// ============================================================
// STRATEGY 8: Stochastic Oscillator
// ============================================================
const analyzeStochastic = (data) => {
  if (data.length < 14) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);

  const stochResult = stochastic({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3
  });

  if (stochResult.length < 2) return { signal: 'NEUTRAL', reason: 'Stochastic not ready' };

  const last = stochResult[stochResult.length - 1];
  const prev = stochResult[stochResult.length - 2];

  if (!last || last.k === undefined) return { signal: 'NEUTRAL', reason: 'Stochastic pending' };

  let signal = 'NEUTRAL';
  let reason = '';

  if (last.k < 20 && last.d < 20 && prev.k <= prev.d && last.k > last.d) {
    signal = 'BUY';
    reason = `Oversold + Bullish Cross (%K: ${last.k.toFixed(1)})`;
  } else if (prev.k < 20 && last.k >= 20 && last.k > last.d) {
    signal = 'BUY';
    reason = `Exiting Oversold (%K: ${last.k.toFixed(1)})`;
  } else if (last.k > 80 && last.d > 80 && prev.k >= prev.d && last.k < last.d) {
    signal = 'SELL';
    reason = `Overbought + Bearish Cross (%K: ${last.k.toFixed(1)})`;
  } else if (prev.k > 80 && last.k <= 80 && last.k < last.d) {
    signal = 'SELL';
    reason = `Exiting Overbought (%K: ${last.k.toFixed(1)})`;
  } else {
    reason = `%K: ${last.k.toFixed(1)}, %D: ${last.d.toFixed(1)}`;
  }

  return { signal, reason, k: last.k.toFixed(1), d: last.d.toFixed(1) };
};

// ============================================================
// MAIN ANALYSIS FUNCTION
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
        // Fetch 1 year data for proper analysis (MA Crossover needs 200+ days)
        const response = await fetch(`/api/stock-data?symbols=${symbols}&period=1y&interval=1d`);
        if (!response.ok) return {};
        return await response.json();
      } catch (e) {
        console.error("Batch fetch error:", e);
        return {};
      }
    }));

    const combinedData = Object.assign({}, ...results);

    // 3. Calculate all 8 strategies for each stock
    return stocks.map(stock => {
      const data = combinedData[stock.symbol];
      if (!data || data.length < 50) {
        return {
          ...stock,
          lastPrice: data?.[data.length - 1]?.close || null,
          pvb: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          vsa: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          donchian: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          rsiSupertrend: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          maCrossover: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          macdCrossover: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          bollingerBands: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          stochastic: { signal: 'NEUTRAL', reason: 'Insufficient data' },
          overallSignal: 'NEUTRAL',
          buyCount: 0,
          sellCount: 0
        };
      }

      const closes = data.map(d => d.close);
      const lastClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      const change = ((lastClose - prevClose) / prevClose * 100).toFixed(2);

      // Run all 8 strategies
      const pvb = analyzePVB(data);
      const vsa = analyzeVSA(data);
      const donchian = analyzeDonchian(data);
      const rsiSupertrend = analyzeRSISupertrend(data);
      const maCrossover = analyzeMACrossover(data);
      const macdCrossover = analyzeMACDCrossover(data);
      const bollingerBands = analyzeBollingerBands(data);
      const stochasticResult = analyzeStochastic(data);

      // Count signals from all 8 strategies
      const signals = [
        pvb.signal, vsa.signal, donchian.signal, rsiSupertrend.signal,
        maCrossover.signal, macdCrossover.signal, bollingerBands.signal, stochasticResult.signal
      ];
      const buyCount = signals.filter(s => s === 'BUY').length;
      const sellCount = signals.filter(s => s === 'SELL').length;

      // Determine overall signal (adjusted thresholds for 8 strategies)
      let overallSignal = 'NEUTRAL';
      if (buyCount >= 5) overallSignal = 'STRONG BUY';
      else if (buyCount >= 3) overallSignal = 'BUY';
      else if (sellCount >= 5) overallSignal = 'STRONG SELL';
      else if (sellCount >= 3) overallSignal = 'SELL';

      return {
        ...stock,
        lastPrice: lastClose,
        change: parseFloat(change),
        volume: data[data.length - 1].volume,
        pvb,
        vsa,
        donchian,
        rsiSupertrend,
        maCrossover,
        macdCrossover,
        bollingerBands,
        stochastic: stochasticResult,
        overallSignal,
        buyCount,
        sellCount
      };
    });

  } catch (error) {
    console.error(`Error fetching index analysis for ${indexSymbol}:`, error);
    throw error;
  }
}; 