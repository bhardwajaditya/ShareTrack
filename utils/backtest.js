import { sma, ema, rsi, atr, macd, bollingerbands, stochastic } from 'technicalindicators';

// ============================================================
// BACKTEST ENGINE - 8 TRADING STRATEGIES
// ============================================================

// Strategy 1: Price Volume Breakout (PVB) - Same logic as stockData.js
const runPVB = (data, index) => {
  if (index < 50) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const volumes = slicedData.map(d => d.volume);

  const ema50 = ema({ period: 50, values: closes });
  const lastEma50 = ema50[ema50.length - 1];
  const lastClose = closes[closes.length - 1];

  const avgVolume20 = sma({ period: 20, values: volumes });
  const lastAvgVolume = avgVolume20[avgVolume20.length - 1];
  const lastVolume = volumes[volumes.length - 1];

  const lookbackHighs = highs.slice(-21, -1);
  const resistanceLevel = Math.max(...lookbackHighs);

  const aboveEma50 = lastClose > lastEma50;
  const brokeResistance = lastClose > resistanceLevel;
  const volumeConfirmed = lastVolume >= 1.5 * lastAvgVolume;

  if (aboveEma50 && brokeResistance && volumeConfirmed) {
    return { signal: 'BUY', reason: 'Breakout with volume' };
  }
  return { signal: 'NEUTRAL', reason: 'No signal' };
};

// Strategy 2: VSA "No Supply" Pullback
const runVSA = (data, index) => {
  if (index < 25) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);

  const recentData = slicedData.slice(-20);
  let higherHighs = 0;
  let higherLows = 0;
  for (let i = 1; i < recentData.length; i++) {
    if (recentData[i].high > recentData[i - 1].high) higherHighs++;
    if (recentData[i].low > recentData[i - 1].low) higherLows++;
  }
  const isUptrend = higherHighs > 10 && higherLows > 10;

  const ema20 = ema({ period: 20, values: closes });
  const lastEma20 = ema20[ema20.length - 1];
  const lastClose = closes[closes.length - 1];

  // Check for "No Supply" candle
  const last3 = slicedData.slice(-3);
  let noSupplyFound = false;

  for (let i = 0; i < last3.length - 1; i++) {
    const candle = last3[i];
    const spread = candle.high - candle.low;
    const avgSpread = (slicedData.slice(-20).reduce((sum, d) => sum + (d.high - d.low), 0)) / 20;
    const isNarrowRange = spread < avgSpread * 0.5;
    const isRedCandle = candle.close < candle.open;
    const isLowVolume = candle.volume < last3[Math.max(0, i - 1)].volume;

    if (isNarrowRange && isRedCandle && isLowVolume) {
      noSupplyFound = true;
    }
  }

  const nearEma20 = Math.abs(lastClose - lastEma20) / lastClose < 0.02;

  if (isUptrend && noSupplyFound && nearEma20) {
    return { signal: 'BUY', reason: 'No Supply in uptrend' };
  }
  return { signal: 'NEUTRAL', reason: 'No signal' };
};

// Strategy 3: Donchian Channel Trend Following
const runDonchian = (data, index) => {
  if (index < 21) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const lows = slicedData.map(d => d.low);

  const period = 20;
  const lookbackHighs = highs.slice(-period - 1, -1);
  const lookbackLows = lows.slice(-period - 1, -1);

  const upperChannel = Math.max(...lookbackHighs);
  const lowerChannel = Math.min(...lookbackLows);
  const middleChannel = (upperChannel + lowerChannel) / 2;

  const lastClose = closes[closes.length - 1];
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : lastClose;

  if (lastClose > upperChannel) {
    return { signal: 'BUY', reason: 'New 20-day high' };
  } else if (lastClose < lowerChannel) {
    return { signal: 'SELL', reason: 'Broke 20-day low' };
  } else if (lastClose < middleChannel && prevClose >= middleChannel) {
    return { signal: 'SELL', reason: 'Crossed below middle' };
  }
  return { signal: 'NEUTRAL', reason: 'Within channel' };
};

// Strategy 4: RSI + Supertrend Hybrid
const runRSISupertrend = (data, index) => {
  if (index < 20) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const lows = slicedData.map(d => d.low);

  const rsiValues = rsi({ period: 14, values: closes });
  const lastRsi = rsiValues[rsiValues.length - 1];
  const prevRsi = rsiValues.length > 1 ? rsiValues[rsiValues.length - 2] : lastRsi;

  const atrPeriod = 10;
  const multiplier = 3;
  const atrValues = atr({ period: atrPeriod, high: highs, low: lows, close: closes });

  // Simplified Supertrend calculation
  let direction = 1;
  if (atrValues.length > 0) {
    const lastAtr = atrValues[atrValues.length - 1];
    const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
    const upperBand = hl2 + (multiplier * lastAtr);
    const lowerBand = hl2 - (multiplier * lastAtr);
    
    if (closes[closes.length - 1] > upperBand) direction = 1;
    else if (closes[closes.length - 1] < lowerBand) direction = -1;
    else direction = closes[closes.length - 1] > hl2 ? 1 : -1;
  }

  const supertrendGreen = direction === 1;
  const rsiAbove60 = lastRsi >= 60;
  const rsiBelow40 = lastRsi < 40;

  if (supertrendGreen && rsiAbove60) {
    return { signal: 'BUY', reason: `ST Green + RSI ${lastRsi?.toFixed(1)}` };
  } else if (!supertrendGreen || rsiBelow40) {
    return { signal: 'SELL', reason: supertrendGreen ? `RSI ${lastRsi?.toFixed(1)}` : 'ST Red' };
  }
  return { signal: 'NEUTRAL', reason: 'No clear signal' };
};

// ============================================================
// NEW STRATEGIES (5-8) - POPULAR TRADING STRATEGIES
// ============================================================

// Strategy 5: Moving Average Crossover (Golden Cross / Death Cross)
// Uses 50 EMA and 200 EMA - one of the most popular strategies
const runMACrossover = (data, index) => {
  if (index < 200) return { signal: 'NEUTRAL', reason: 'Insufficient data (need 200 days)' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);

  const ema50Values = ema({ period: 50, values: closes });
  const ema200Values = ema({ period: 200, values: closes });

  const lastEma50 = ema50Values[ema50Values.length - 1];
  const prevEma50 = ema50Values[ema50Values.length - 2];
  const lastEma200 = ema200Values[ema200Values.length - 1];
  const prevEma200 = ema200Values[ema200Values.length - 2];

  // Golden Cross: 50 EMA crosses above 200 EMA
  if (prevEma50 <= prevEma200 && lastEma50 > lastEma200) {
    return { signal: 'BUY', reason: 'Golden Cross (50 EMA > 200 EMA)' };
  }
  // Death Cross: 50 EMA crosses below 200 EMA
  else if (prevEma50 >= prevEma200 && lastEma50 < lastEma200) {
    return { signal: 'SELL', reason: 'Death Cross (50 EMA < 200 EMA)' };
  }
  // Trend confirmation: price above both EMAs = bullish
  else if (closes[closes.length - 1] > lastEma50 && lastEma50 > lastEma200) {
    return { signal: 'NEUTRAL', reason: 'Bullish trend (hold)' };
  }
  
  return { signal: 'NEUTRAL', reason: 'No crossover signal' };
};

// Strategy 6: MACD Crossover Strategy
// Classic MACD (12, 26, 9) with signal line crossover
const runMACDCrossover = (data, index) => {
  if (index < 35) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);

  const macdResult = macd({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });

  if (macdResult.length < 2) return { signal: 'NEUTRAL', reason: 'MACD not ready' };

  const lastMACD = macdResult[macdResult.length - 1];
  const prevMACD = macdResult[macdResult.length - 2];

  if (!lastMACD || !prevMACD || lastMACD.MACD === undefined) {
    return { signal: 'NEUTRAL', reason: 'MACD calculation pending' };
  }

  // Bullish crossover: MACD line crosses above signal line
  if (prevMACD.MACD <= prevMACD.signal && lastMACD.MACD > lastMACD.signal) {
    return { signal: 'BUY', reason: `MACD Bullish Crossover (Hist: ${lastMACD.histogram?.toFixed(2)})` };
  }
  // Bearish crossover: MACD line crosses below signal line
  else if (prevMACD.MACD >= prevMACD.signal && lastMACD.MACD < lastMACD.signal) {
    return { signal: 'SELL', reason: `MACD Bearish Crossover (Hist: ${lastMACD.histogram?.toFixed(2)})` };
  }
  // Strong momentum confirmation
  else if (lastMACD.histogram > 0 && lastMACD.histogram > prevMACD.histogram) {
    return { signal: 'NEUTRAL', reason: 'Bullish momentum building' };
  }

  return { signal: 'NEUTRAL', reason: 'No crossover' };
};

// Strategy 7: Bollinger Bands Mean Reversion
// Buy at lower band, sell at upper band - classic mean reversion
const runBollingerBands = (data, index) => {
  if (index < 20) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);

  const bbResult = bollingerbands({
    period: 20,
    values: closes,
    stdDev: 2
  });

  if (bbResult.length < 2) return { signal: 'NEUTRAL', reason: 'BB not ready' };

  const lastBB = bbResult[bbResult.length - 1];
  const prevBB = bbResult[bbResult.length - 2];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  if (!lastBB || !lastBB.lower || !lastBB.upper) {
    return { signal: 'NEUTRAL', reason: 'BB calculation pending' };
  }

  // Calculate %B (position within bands)
  const percentB = (lastClose - lastBB.lower) / (lastBB.upper - lastBB.lower);
  
  // Buy signal: Price touches or goes below lower band
  if (lastClose <= lastBB.lower && prevClose > prevBB.lower) {
    return { signal: 'BUY', reason: `Price at Lower BB (₹${lastBB.lower.toFixed(2)})` };
  }
  // Buy signal: Price bounces from lower band
  else if (prevClose <= prevBB.lower && lastClose > lastBB.lower) {
    return { signal: 'BUY', reason: 'Bounce from Lower BB' };
  }
  // Sell signal: Price touches or goes above upper band
  else if (lastClose >= lastBB.upper && prevClose < prevBB.upper) {
    return { signal: 'SELL', reason: `Price at Upper BB (₹${lastBB.upper.toFixed(2)})` };
  }
  // Sell signal: Price rejected from upper band
  else if (prevClose >= prevBB.upper && lastClose < lastBB.upper) {
    return { signal: 'SELL', reason: 'Rejection from Upper BB' };
  }

  return { signal: 'NEUTRAL', reason: `%B: ${(percentB * 100).toFixed(1)}%` };
};

// Strategy 8: Stochastic Oscillator
// Classic momentum oscillator with %K and %D lines
const runStochastic = (data, index) => {
  if (index < 14) return { signal: 'NEUTRAL', reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const lows = slicedData.map(d => d.low);

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

  if (!last || last.k === undefined || last.d === undefined) {
    return { signal: 'NEUTRAL', reason: 'Stochastic calculation pending' };
  }

  const lastK = last.k;
  const lastD = last.d;
  const prevK = prev.k;
  const prevD = prev.d;

  // Oversold zone (< 20) with bullish crossover
  if (lastK < 20 && lastD < 20 && prevK <= prevD && lastK > lastD) {
    return { signal: 'BUY', reason: `Oversold + Bullish Cross (%K: ${lastK.toFixed(1)})` };
  }
  // Coming out of oversold
  else if (prevK < 20 && lastK >= 20 && lastK > lastD) {
    return { signal: 'BUY', reason: `Exiting Oversold (%K: ${lastK.toFixed(1)})` };
  }
  // Overbought zone (> 80) with bearish crossover
  else if (lastK > 80 && lastD > 80 && prevK >= prevD && lastK < lastD) {
    return { signal: 'SELL', reason: `Overbought + Bearish Cross (%K: ${lastK.toFixed(1)})` };
  }
  // Coming out of overbought
  else if (prevK > 80 && lastK <= 80 && lastK < lastD) {
    return { signal: 'SELL', reason: `Exiting Overbought (%K: ${lastK.toFixed(1)})` };
  }

  return { signal: 'NEUTRAL', reason: `%K: ${lastK.toFixed(1)}, %D: ${lastD.toFixed(1)}` };
};

// ============================================================
// BACKTEST RUNNER
// ============================================================
export const backtestStrategy = (strategyName, runStrategy, historicalData, initialCapital = 100000) => {
  const results = {
    strategyName,
    trades: [],
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalPnL: 0,
    percentageReturn: 0,
    maxDrawdown: 0,
    falsePositives: 0, // Buy signal followed by loss
    falseNegatives: 0, // Missed opportunity (didn't buy before gain)
    dailySignals: []
  };

  let position = null; // { entryPrice, entryDate, shares }
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;

  // Track signals for false negative detection
  const allSignals = [];

  // Run strategy on each day
  for (let i = 50; i < historicalData.length; i++) {
    const today = historicalData[i];
    const signal = runStrategy(historicalData, i);
    
    allSignals.push({
      date: today.date,
      signal: signal.signal,
      price: today.close,
      reason: signal.reason
    });

    results.dailySignals.push({
      date: today.date,
      signal: signal.signal,
      price: today.close,
      reason: signal.reason
    });

    // Trading logic
    if (signal.signal === 'BUY' && !position) {
      // Enter position
      const shares = Math.floor(capital / today.close);
      if (shares > 0) {
        position = {
          entryPrice: today.close,
          entryDate: today.date,
          shares: shares
        };
        capital -= shares * today.close;
      }
    } else if (signal.signal === 'SELL' && position) {
      // Exit position
      const exitValue = position.shares * today.close;
      const pnl = exitValue - (position.shares * position.entryPrice);
      const pnlPercent = ((today.close - position.entryPrice) / position.entryPrice) * 100;

      results.trades.push({
        entryDate: position.entryDate,
        exitDate: today.date,
        entryPrice: position.entryPrice,
        exitPrice: today.close,
        shares: position.shares,
        pnl: pnl,
        pnlPercent: pnlPercent,
        isWin: pnl > 0
      });

      if (pnl > 0) {
        results.winningTrades++;
      } else {
        results.losingTrades++;
        results.falsePositives++; // Buy was followed by a loss
      }

      capital += exitValue;
      position = null;

      // Track max drawdown
      if (capital > peakCapital) {
        peakCapital = capital;
      }
      const drawdown = ((peakCapital - capital) / peakCapital) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  // Close any open position at the end
  if (position) {
    const lastPrice = historicalData[historicalData.length - 1].close;
    const exitValue = position.shares * lastPrice;
    const pnl = exitValue - (position.shares * position.entryPrice);
    
    results.trades.push({
      entryDate: position.entryDate,
      exitDate: historicalData[historicalData.length - 1].date,
      entryPrice: position.entryPrice,
      exitPrice: lastPrice,
      shares: position.shares,
      pnl: pnl,
      pnlPercent: ((lastPrice - position.entryPrice) / position.entryPrice) * 100,
      isWin: pnl > 0,
      isOpen: true
    });

    if (pnl > 0) results.winningTrades++;
    else {
      results.losingTrades++;
      results.falsePositives++;
    }

    capital += exitValue;
  }

  // Calculate false negatives (missed opportunities)
  // Look for days where price went up significantly but no BUY signal was given
  for (let i = 51; i < historicalData.length; i++) {
    const today = historicalData[i];
    const nextDay = historicalData[Math.min(i + 1, historicalData.length - 1)];
    const signalToday = allSignals.find(s => s.date === today.date);
    
    // If price increased by more than 2% next day but we didn't have a BUY signal
    const priceChange = ((nextDay.close - today.close) / today.close) * 100;
    if (priceChange > 2 && signalToday && signalToday.signal !== 'BUY') {
      results.falseNegatives++;
    }
  }

  results.totalTrades = results.trades.length;
  results.totalPnL = capital - initialCapital;
  results.percentageReturn = ((capital - initialCapital) / initialCapital) * 100;
  results.maxDrawdown = maxDrawdown;
  results.finalCapital = capital;
  results.winRate = results.totalTrades > 0 ? (results.winningTrades / results.totalTrades) * 100 : 0;

  return results;
};

// Run all 8 strategies
export const runAllBacktests = (historicalData, initialCapital = 100000) => {
  const strategies = [
    { name: 'PVB (Price Volume Breakout)', fn: runPVB },
    { name: 'VSA (No Supply Pullback)', fn: runVSA },
    { name: 'Donchian Channel', fn: runDonchian },
    { name: 'RSI + Supertrend', fn: runRSISupertrend },
    { name: 'MA Crossover (Golden/Death)', fn: runMACrossover },
    { name: 'MACD Crossover', fn: runMACDCrossover },
    { name: 'Bollinger Bands', fn: runBollingerBands },
    { name: 'Stochastic Oscillator', fn: runStochastic }
  ];

  const results = strategies.map(strategy => 
    backtestStrategy(strategy.name, strategy.fn, historicalData, initialCapital)
  );

  // Calculate buy & hold benchmark
  const firstPrice = historicalData[50]?.close || historicalData[0].close;
  const lastPrice = historicalData[historicalData.length - 1].close;
  const buyHoldReturn = ((lastPrice - firstPrice) / firstPrice) * 100;
  const buyHoldPnL = initialCapital * (buyHoldReturn / 100);

  return {
    strategies: results,
    benchmark: {
      name: 'Buy & Hold',
      percentageReturn: buyHoldReturn,
      totalPnL: buyHoldPnL,
      firstPrice,
      lastPrice
    },
    summary: {
      bestStrategy: results.reduce((best, current) => 
        current.percentageReturn > best.percentageReturn ? current : best
      ),
      worstStrategy: results.reduce((worst, current) => 
        current.percentageReturn < worst.percentageReturn ? current : worst
      ),
      mostFalsePositives: results.reduce((most, current) => 
        current.falsePositives > most.falsePositives ? current : most
      ),
      mostFalseNegatives: results.reduce((most, current) => 
        current.falseNegatives > most.falseNegatives ? current : most
      )
    }
  };
};
