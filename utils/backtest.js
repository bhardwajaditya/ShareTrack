// ============================================================
// BACKTEST ENGINE
// Uses strategies from stockData.js as single source of truth
// ============================================================

import {
  analyzeWeightedStrategy,
  analyzeConnorsRSI,
  analyzeMomentumBreakout,
  analyzeOpeningRange,
  analyzeRangeReversion
} from './stockData';

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
    // Pass index to strategy function for backtest mode
    const rawSignal = runStrategy(historicalData, i);
    
    // Normalize signal format (some strategies return different structures)
    const signal = {
      signal: rawSignal.signal || 'NEUTRAL',
      score: rawSignal.totalScore || rawSignal.score || 0,
      reason: rawSignal.reason || rawSignal.phase1?.reason || ''
    };
    
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
    const TAKE_PROFIT_PCT = 0.15; // 15% take profit
    const STOP_LOSS_PCT   = 0.05; // 5% stop loss

    if ((signal.signal === 'BUY' || signal.signal === 'STRONG BUY') && !position) {
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
    } else if (position) {
      const dayHigh  = today.high  || today.close;
      const dayLow   = today.low   || today.close;
      const tpPrice  = position.entryPrice * (1 + TAKE_PROFIT_PCT);
      const slPrice  = position.entryPrice * (1 - STOP_LOSS_PCT);

      let exitPrice  = null;
      let exitReason = null;

      // Stop-loss checked first (worst-case intraday)
      if (dayLow <= slPrice) {
        exitPrice  = slPrice;
        exitReason = 'stop-loss';
      } else if (dayHigh >= tpPrice) {
        exitPrice  = tpPrice;
        exitReason = 'take-profit';
      } else if (signal.signal === 'SELL' || signal.signal === 'STRONG SELL') {
        exitPrice  = today.close;
        exitReason = 'signal';
      }

      if (exitPrice !== null) {
        const exitValue = position.shares * exitPrice;
        const pnl = exitValue - (position.shares * position.entryPrice);
        const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

        results.trades.push({
          entryDate:  position.entryDate,
          exitDate:   today.date,
          entryPrice: position.entryPrice,
          exitPrice,
          shares:     position.shares,
          pnl,
          pnlPercent,
          isWin:      pnl > 0,
          entryScore: position.entryScore,
          exitScore:  signal.score,
          exitReason
        });

        if (pnl > 0) {
          results.winningTrades++;
        } else {
          results.losingTrades++;
          results.falsePositives++;
        }

        capital += exitValue;
        position = null;

        if (capital > peakCapital) peakCapital = capital;
        const drawdown = ((peakCapital - capital) / peakCapital) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }
  }

  // Close any open position at the end
  if (position) {
    const lastPrice = historicalData[historicalData.length - 1].close;
    const exitValue = position.shares * lastPrice;
    const pnl = exitValue - (position.shares * position.entryPrice);

    results.trades.push({
      entryDate:  position.entryDate,
      exitDate:   historicalData[historicalData.length - 1].date,
      entryPrice: position.entryPrice,
      exitPrice:  lastPrice,
      shares:     position.shares,
      pnl,
      pnlPercent: ((lastPrice - position.entryPrice) / position.entryPrice) * 100,
      isWin:      pnl > 0,
      exitReason: 'end-of-data',
      isOpen:     true
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
    if (priceChange > 2 && signalToday && signalToday.signal !== 'BUY' && signalToday.signal !== 'STRONG BUY') {
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
// RUN ALL 4 STRATEGIES
// Uses strategy functions from stockData.js (single source of truth)
// ============================================================
const analyzeCombinedStrategy = (data, index) => {
  const trendPullback = analyzeWeightedStrategy(data, index);
  const connorsRSI = analyzeConnorsRSI(data, index);
  const momentumBreakout = analyzeMomentumBreakout(data, index);
  const openingRange = analyzeOpeningRange(data, index);

  const signals = [
    trendPullback.signal,
    connorsRSI.signal,
    momentumBreakout.signal,
    openingRange.signal
  ];

  const buyCount = signals.filter(s => s === 'BUY' || s === 'STRONG BUY').length;
  const sellCount = signals.filter(s => s === 'SELL' || s === 'STRONG SELL').length;

  let signal = 'NEUTRAL';
  if (buyCount >= 3) signal = 'STRONG BUY';
  else if (buyCount >= 2) signal = 'BUY';
  else if (sellCount >= 3) signal = 'STRONG SELL';
  else if (sellCount >= 2) signal = 'SELL';

  // Calculate average score
  const totalScore = Math.round(
    ((trendPullback.totalScore || 0) + 
     (connorsRSI.score || 0) + 
     (momentumBreakout.score || 0) + 
     (openingRange.score || 0)) / 4
  );

  return {
    signal,
    score: totalScore,
    reason: `Buys: ${buyCount}, Sells: ${sellCount}`
  };
};

const analyzeTrendMomentumStrategy = (data, index) => {
  const trendPullback = analyzeWeightedStrategy(data, index);
  const momentumBreakout = analyzeMomentumBreakout(data, index);

  // Average the scores
  const score = Math.round(((trendPullback.totalScore || 0) + (momentumBreakout.score || 0)) / 2);

  let signal = 'NEUTRAL';
  let confidence = 'LOW';
  
  if (score >= 80) {
    signal = 'STRONG BUY';
    confidence = 'HIGH';
  } else if (score >= 60) {
    signal = 'BUY';
    confidence = 'MEDIUM';
  } else if (score <= 20) {
    signal = 'STRONG SELL'; 
    confidence = 'HIGH';
  } else if (score <= 40) {
    signal = 'SELL';
    confidence = 'MEDIUM';
  }

  return {
    signal,
    score,
    reason: `Avg Score: ${score} (Trend: ${trendPullback.totalScore || 0}, Mom: ${momentumBreakout.score || 0})`
  };
};

export const runAllBacktests = (historicalData, initialCapital = 100000) => {
  const strategies = [
    { name: 'Trend-Pullback', fn: analyzeWeightedStrategy },
    { name: 'MFI Momentum', fn: analyzeConnorsRSI },
    { name: 'Momentum Breakout', fn: analyzeMomentumBreakout },
    { name: 'Opening Range', fn: analyzeOpeningRange },
    { name: 'Combined Consensus', fn: analyzeCombinedStrategy },
    { name: 'Sideways Range', fn: analyzeRangeReversion },
    { name: 'Trend + Momentum', fn: analyzeTrendMomentumStrategy }
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
