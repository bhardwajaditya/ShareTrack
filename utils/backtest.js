// ============================================================
// BACKTEST ENGINE
// Uses strategies from stockData.js as single source of truth
// ============================================================

import {
  analyzeWeightedStrategy,
  analyzeConnorsRSI,
  analyzeTurtleSoup,
  analyzeOpeningRange
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
    } else if ((signal.signal === 'SELL' || signal.signal === 'STRONG SELL') && position) {
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
export const runAllBacktests = (historicalData, initialCapital = 100000) => {
  const strategies = [
    { name: 'Trend-Pullback', fn: analyzeWeightedStrategy },
    { name: 'Connors RSI-2', fn: analyzeConnorsRSI },
    { name: 'Turtle Soup', fn: analyzeTurtleSoup },
    { name: 'Opening Range', fn: analyzeOpeningRange }
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
