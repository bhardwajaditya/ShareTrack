import { sma, ema, rsi, atr, macd, bollingerbands, stochastic } from 'technicalindicators';

// ============================================================
// BACKTEST ENGINE - TREND-PULLBACK WEIGHTED STRATEGY
// 3-Phase approach with weighted scoring (100 points total)
// Phase 1 (Filter): 40% - PVB + Trend
// Phase 2 (Setup): 15% - Stochastic + Bollinger  
// Phase 3 (Trigger): 20% - MACD
// Volume Validation: 25%
// ============================================================

// Weighted Strategy Runner for Backtesting
const runWeightedStrategy = (data, index) => {
  if (index < 50) return { signal: 'NEUTRAL', score: 0, reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const lows = slicedData.map(d => d.low);
  const volumes = slicedData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // ============================================================
  // PHASE 1: FILTER (40 points) - Must pass to not cap score
  // ============================================================
  const ema50Values = ema({ period: 50, values: closes });
  const lastEma50 = ema50Values[ema50Values.length - 1];
  const priceAboveEma50 = lastClose > lastEma50;

  const avgVolume20 = sma({ period: 20, values: volumes });
  const lastAvgVolume20 = avgVolume20[avgVolume20.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  const volumeAboveAvg = lastVolume > lastAvgVolume20;

  let phase1Score = 0;
  if (priceAboveEma50) phase1Score += 20;
  if (volumeAboveAvg) phase1Score += 20;
  const phase1Passed = priceAboveEma50 && volumeAboveAvg;

  // ============================================================
  // PHASE 2: SETUP (15 points) - Oscillators
  // ============================================================
  const bbResult = bollingerbands({ period: 20, values: closes, stdDev: 2 });
  const lastBB = bbResult[bbResult.length - 1] || {};
  const percentB = lastBB.lower ? (lastClose - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
  const nearLowerBB = percentB < 0.2;

  const stochResult = stochastic({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3
  });
  const lastStoch = stochResult[stochResult.length - 1] || { k: 50, d: 50 };
  const stochBelow40 = lastStoch.k < 40;

  let phase2Score = 0;
  if (nearLowerBB) phase2Score += 8;
  if (stochBelow40) phase2Score += 7;

  // ============================================================
  // PHASE 3: TRIGGER (20 points) - MACD
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
  if (histogramUp) phase3Score += 10;
  if (signalCross) phase3Score += 10;

  // ============================================================
  // VOLUME VALIDATION (25 points)
  // ============================================================
  const avgVolume10 = sma({ period: 10, values: volumes });
  const lastAvgVolume10 = avgVolume10[avgVolume10.length - 1];
  const volumeSpike = lastVolume > lastAvgVolume10 * 1.3;

  const lookbackHighs = highs.slice(-21, -1);
  const resistanceLevel = Math.max(...lookbackHighs);
  const brokeResistance = lastClose > resistanceLevel;

  let volumeScore = 0;
  if (volumeSpike) volumeScore += 15;
  if (brokeResistance) volumeScore += 10;

  // ============================================================
  // CALCULATE TOTAL SCORE & SIGNAL
  // ============================================================
  let totalScore = phase1Score + phase2Score + phase3Score + volumeScore;
  
  // If Phase 1 fails, cap score at 15 max
  if (!phase1Passed) {
    totalScore = Math.min(totalScore, 15);
  }

  // Check bearish signals
  const macdBearishCross = prevMACD.MACD !== undefined && lastMACD.MACD !== undefined
    && prevMACD.MACD >= prevMACD.signal && lastMACD.MACD < lastMACD.signal;
  const priceBelowEma = lastClose < lastEma50;
  const stochOverbought = lastStoch.k > 80 && lastStoch.d > 80;
  
  let bearishScore = 0;
  if (priceBelowEma) bearishScore += 40;
  if (macdBearishCross) bearishScore += 20;
  if (stochOverbought && lastStoch.k < lastStoch.d) bearishScore += 15;
  if (lastMACD.histogram < 0 && lastMACD.histogram < prevMACD.histogram) bearishScore += 15;

  let signal = 'NEUTRAL';
  let reason = '';

  if (bearishScore >= 60) {
    totalScore = bearishScore;
    if (bearishScore >= 80) {
      signal = 'SELL';
      reason = 'Strong bearish signals';
    } else {
      signal = 'SELL';
      reason = 'Bearish momentum';
    }
  } else {
    if (totalScore >= 80) {
      signal = 'BUY';
      reason = `Strong setup (Score: ${totalScore})`;
    } else if (totalScore >= 60) {
      signal = 'BUY';
      reason = `Good setup (Score: ${totalScore})`;
    } else if (totalScore >= 40) {
      signal = 'NEUTRAL';
      reason = `Weak setup (Score: ${totalScore})`;
    } else if (totalScore >= 20) {
      signal = 'SELL';
      reason = `Poor setup (Score: ${totalScore})`;
    } else {
      signal = 'SELL';
      reason = `Very weak (Score: ${totalScore})`;
    }
  }

  return { signal, score: totalScore, reason };
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
    falsePositives: 0,
    falseNegatives: 0,
    dailySignals: []
  };

  let position = null;
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  const allSignals = [];

  // Run strategy on each day
  for (let i = 50; i < historicalData.length; i++) {
    const today = historicalData[i];
    const signal = runStrategy(historicalData, i);
    
    allSignals.push({
      date: today.date,
      signal: signal.signal,
      price: today.close,
      reason: signal.reason,
      score: signal.score
    });

    results.dailySignals.push({
      date: today.date,
      signal: signal.signal,
      price: today.close,
      reason: signal.reason,
      score: signal.score
    });

    // Trading logic
    if (signal.signal === 'BUY' && !position) {
      const shares = Math.floor(capital / today.close);
      if (shares > 0) {
        position = {
          entryPrice: today.close,
          entryDate: today.date,
          shares: shares,
          entryScore: signal.score
        };
        capital -= shares * today.close;
      }
    } else if (signal.signal === 'SELL' && position) {
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
        isWin: pnl > 0,
        entryScore: position.entryScore,
        exitScore: signal.score
      });

      if (pnl > 0) {
        results.winningTrades++;
      } else {
        results.losingTrades++;
        results.falsePositives++;
      }

      capital += exitValue;
      position = null;

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

  // Calculate false negatives
  for (let i = 51; i < historicalData.length; i++) {
    const today = historicalData[i];
    const nextDay = historicalData[Math.min(i + 1, historicalData.length - 1)];
    const signalToday = allSignals.find(s => s.date === today.date);
    
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

// ============================================================
// STRATEGY 2: CONNORS RSI-2 RUNNER
// ============================================================
const runConnorsRSI = (data, index) => {
  if (index < 200) return { signal: 'NEUTRAL', score: 0, reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const lastClose = closes[closes.length - 1];

  // 200 SMA
  const sma200Values = sma({ period: 200, values: closes });
  const lastSma200 = sma200Values[sma200Values.length - 1];
  const aboveSma200 = lastClose > lastSma200;

  // RSI(2)
  const rsi2Values = rsi({ period: 2, values: closes });
  const lastRsi2 = rsi2Values[rsi2Values.length - 1];
  const prevRsi2 = rsi2Values[rsi2Values.length - 2];

  // 5 SMA
  const sma5Values = sma({ period: 5, values: closes });
  const lastSma5 = sma5Values[sma5Values.length - 1];
  const aboveSma5 = lastClose > lastSma5;

  let score = 0;
  let signal = 'NEUTRAL';
  let reason = '';

  if (aboveSma200) {
    score += 30;
    if (lastRsi2 < 5) {
      score += 40;
      signal = 'BUY';
      reason = `RSI(2)=${lastRsi2.toFixed(1)} extreme`;
    } else if (lastRsi2 < 10) {
      score += 30;
      signal = 'BUY';
      reason = `RSI(2)=${lastRsi2.toFixed(1)} oversold`;
    }
    // Exit signal
    if (aboveSma5 && prevRsi2 < 20 && lastRsi2 >= 20) {
      signal = 'SELL';
      reason = 'Exit: Above 5 SMA';
    }
  }

  if (lastRsi2 > 90) {
    signal = 'SELL';
    reason = 'Overbought';
    score = 20;
  }

  return { signal, score, reason };
};

// ============================================================
// STRATEGY 3: TURTLE SOUP RUNNER
// ============================================================
const runTurtleSoup = (data, index) => {
  if (index < 50) return { signal: 'NEUTRAL', score: 0, reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const highs = slicedData.map(d => d.high);
  const lows = slicedData.map(d => d.low);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // Donchian 20 high
  const last20Highs = highs.slice(-21, -1);
  const donchian20High = Math.max(...last20Highs);
  
  // Donchian 10 low
  const last10Lows = lows.slice(-11, -1);
  const donchian10Low = Math.min(...last10Lows);

  const brokeOut = lastClose > donchian20High;
  const freshBreakout = lastClose > donchian20High && prevClose <= donchian20High;
  const touchedExit = lastClose <= donchian10Low;

  let score = 0;
  let signal = 'NEUTRAL';
  let reason = '';

  if (freshBreakout) {
    score += 70;
    signal = 'BUY';
    reason = 'Fresh 20-day breakout';
  } else if (brokeOut) {
    score += 40;
    signal = 'BUY';
    reason = 'Above 20-day high';
  }

  if (touchedExit) {
    signal = 'SELL';
    reason = 'Hit 10-day low';
    score = 15;
  }

  return { signal, score, reason };
};

// ============================================================
// STRATEGY 4: OPENING RANGE RUNNER
// ============================================================
const runOpeningRange = (data, index) => {
  if (index < 20) return { signal: 'NEUTRAL', score: 0, reason: 'Insufficient data' };

  const slicedData = data.slice(0, index + 1);
  const closes = slicedData.map(d => d.close);
  const volumes = slicedData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  // 5-day range
  const rangeData = slicedData.slice(-6, -1);
  const rangeHigh = Math.max(...rangeData.map(d => d.high));
  const rangeLow = Math.min(...rangeData.map(d => d.low));

  // VWAP approx
  const recentData = slicedData.slice(-10);
  let vwapNum = 0, vwapDen = 0;
  recentData.forEach(d => {
    const tp = (d.high + d.low + d.close) / 3;
    vwapNum += tp * d.volume;
    vwapDen += d.volume;
  });
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : lastClose;
  const aboveVwap = lastClose > vwap;

  // Volume
  const avgVolume5 = sma({ period: 5, values: volumes });
  const lastAvgVol = avgVolume5[avgVolume5.length - 1];
  const lastVol = volumes[volumes.length - 1];
  const volSpike = lastVol > lastAvgVol * 1.3;

  const brokeHigh = lastClose > rangeHigh && prevClose <= rangeHigh;
  const aboveRange = lastClose > rangeHigh;
  const belowRange = lastClose < rangeLow;

  let score = 0;
  let signal = 'NEUTRAL';
  let reason = '';

  if (brokeHigh) {
    score += 35;
    if (aboveVwap) score += 20;
    if (volSpike) score += 25;
    signal = score >= 60 ? 'BUY' : 'NEUTRAL';
    reason = 'Range breakout';
  } else if (aboveRange && aboveVwap) {
    score += 45;
    signal = 'BUY';
    reason = 'Holding above range';
  }

  if (belowRange) {
    signal = 'SELL';
    reason = 'Below range';
    score = 20;
  }

  return { signal, score, reason };
};

// ============================================================
// RUN ALL 4 STRATEGIES
// ============================================================
export const runAllBacktests = (historicalData, initialCapital = 100000) => {
  const strategies = [
    { name: 'Trend-Pullback', fn: runWeightedStrategy },
    { name: 'Connors RSI-2', fn: runConnorsRSI },
    { name: 'Turtle Soup', fn: runTurtleSoup },
    { name: 'Opening Range', fn: runOpeningRange }
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
