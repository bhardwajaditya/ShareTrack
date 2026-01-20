import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { ClientSideRowModelModule, ValidationModule } from 'ag-grid-community';
import { runAllBacktests } from '../utils/backtest';
import { fetchIndexStocks } from '../utils/nseIndexes';

ModuleRegistry.registerModules([ClientSideRowModelModule, ValidationModule]);

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function BacktestPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, symbol: '' });

  const runBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Fetch NIFTY 50 stocks
      const stocks = await fetchIndexStocks('NIFTY_50');
      setProgress({ current: 0, total: stocks.length, symbol: '' });

      // Aggregate results across all stocks
      const aggregatedResults = {
        strategies: [],
        benchmark: { totalPnL: 0, percentageReturn: 0 },
        stockResults: []
      };

      const strategyTotals = {
        'PVB (Price Volume Breakout)': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'VSA (No Supply Pullback)': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'Donchian Channel': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'RSI + Supertrend': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'MA Crossover (Golden/Death)': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'MACD Crossover': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'Bollinger Bands': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'Stochastic Oscillator': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 }
      };

      let benchmarkTotal = 0;
      let validStocks = 0;

      // Process each stock
      for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        setProgress({ current: i + 1, total: stocks.length, symbol: stock.symbol });

        try {
          // Fetch 1 year of data
          const response = await fetch(`/api/stock-data?symbol=${stock.symbol}&period=1y&interval=1d`);
          if (!response.ok) continue;
          
          const data = await response.json();
          if (!data || data.length < 60) continue; // Need at least 60 days

          // Run backtest on this stock
          const stockBacktest = runAllBacktests(data, 100000);
          validStocks++;

          // Aggregate strategy results
          stockBacktest.strategies.forEach(stratResult => {
            const totals = strategyTotals[stratResult.strategyName];
            if (totals) {
              totals.totalPnL += stratResult.totalPnL;
              totals.totalTrades += stratResult.totalTrades;
              totals.winningTrades += stratResult.winningTrades;
              totals.losingTrades += stratResult.losingTrades;
              totals.falsePositives += stratResult.falsePositives;
              totals.falseNegatives += stratResult.falseNegatives;
              totals.stocks++;
            }
          });

          benchmarkTotal += stockBacktest.benchmark.percentageReturn;

          // Store individual stock results
          aggregatedResults.stockResults.push({
            symbol: stock.symbol,
            name: stock.name,
            dataPoints: data.length,
            ...Object.fromEntries(
              stockBacktest.strategies.map(s => [
                s.strategyName.split(' ')[0].toLowerCase(),
                { pnl: s.totalPnL, trades: s.totalTrades, winRate: s.winRate }
              ])
            ),
            benchmarkReturn: stockBacktest.benchmark.percentageReturn
          });

        } catch (err) {
          console.error(`Error processing ${stock.symbol}:`, err);
        }
      }

      // Calculate final aggregated results
      const initialCapitalPerStock = 100000;
      aggregatedResults.strategies = Object.entries(strategyTotals).map(([name, totals]) => ({
        strategyName: name,
        totalPnL: totals.totalPnL,
        avgPnLPerStock: totals.stocks > 0 ? totals.totalPnL / totals.stocks : 0,
        totalTrades: totals.totalTrades,
        winningTrades: totals.winningTrades,
        losingTrades: totals.losingTrades,
        winRate: totals.totalTrades > 0 ? (totals.winningTrades / totals.totalTrades) * 100 : 0,
        falsePositives: totals.falsePositives,
        falseNegatives: totals.falseNegatives,
        percentageReturn: totals.stocks > 0 ? (totals.totalPnL / (totals.stocks * initialCapitalPerStock)) * 100 : 0,
        stocksAnalyzed: totals.stocks
      }));

      aggregatedResults.benchmark = {
        avgPercentageReturn: validStocks > 0 ? benchmarkTotal / validStocks : 0,
        stocksAnalyzed: validStocks
      };

      // Find best/worst strategies
      aggregatedResults.summary = {
        bestStrategy: aggregatedResults.strategies.reduce((best, curr) => 
          curr.percentageReturn > best.percentageReturn ? curr : best
        ),
        worstStrategy: aggregatedResults.strategies.reduce((worst, curr) => 
          curr.percentageReturn < worst.percentageReturn ? curr : worst
        ),
        mostFalsePositives: aggregatedResults.strategies.reduce((most, curr) => 
          curr.falsePositives > most.falsePositives ? curr : most
        ),
        mostFalseNegatives: aggregatedResults.strategies.reduce((most, curr) => 
          curr.falseNegatives > most.falseNegatives ? curr : most
        )
      };

      setResults(aggregatedResults);

    } catch (err) {
      setError('Failed to run backtest: ' + err.message);
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Strategy summary columns
  const strategyColumnDefs = useMemo(() => [
    { field: 'strategyName', headerName: 'Strategy', width: 200, pinned: 'left' },
    { 
      field: 'totalPnL', 
      headerName: 'Total P&L (₹)', 
      width: 140,
      valueFormatter: params => `₹${params.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}`,
      cellStyle: params => params.value > 0 ? { color: '#16a34a', fontWeight: 'bold' } : { color: '#dc2626', fontWeight: 'bold' }
    },
    { 
      field: 'percentageReturn', 
      headerName: 'Avg Return %', 
      width: 120,
      valueFormatter: params => `${params.value?.toFixed(2) || 0}%`,
      cellStyle: params => params.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' }
    },
    { field: 'totalTrades', headerName: 'Total Trades', width: 110 },
    { field: 'winningTrades', headerName: 'Wins', width: 80 },
    { field: 'losingTrades', headerName: 'Losses', width: 80 },
    { 
      field: 'winRate', 
      headerName: 'Win Rate', 
      width: 100,
      valueFormatter: params => `${params.value?.toFixed(1) || 0}%`
    },
    { 
      field: 'falsePositives', 
      headerName: 'False +ve', 
      width: 100,
      cellStyle: params => ({ backgroundColor: params.value > 50 ? '#fee2e2' : 'transparent' })
    },
    { 
      field: 'falseNegatives', 
      headerName: 'False -ve', 
      width: 100,
      cellStyle: params => ({ backgroundColor: params.value > 100 ? '#fef3c7' : 'transparent' })
    },
    { field: 'stocksAnalyzed', headerName: 'Stocks', width: 80 }
  ], []);

  // Individual stock results columns
  const stockColumnDefs = useMemo(() => [
    { field: 'symbol', headerName: 'Symbol', width: 100, pinned: 'left' },
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'dataPoints', headerName: 'Days', width: 70 },
    { 
      field: 'benchmarkReturn', 
      headerName: 'Buy & Hold %', 
      width: 120,
      valueFormatter: params => `${params.value?.toFixed(2) || 0}%`,
      cellStyle: params => params.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' }
    },
    { 
      headerName: 'PVB', 
      children: [
        { field: 'pvb.pnl', headerName: 'P&L', width: 100, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}` },
        { field: 'pvb.trades', headerName: 'Trades', width: 70 }
      ]
    },
    { 
      headerName: 'VSA', 
      children: [
        { field: 'vsa.pnl', headerName: 'P&L', width: 100, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}` },
        { field: 'vsa.trades', headerName: 'Trades', width: 70 }
      ]
    },
    { 
      headerName: 'Donchian', 
      children: [
        { field: 'donchian.pnl', headerName: 'P&L', width: 100, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}` },
        { field: 'donchian.trades', headerName: 'Trades', width: 70 }
      ]
    },
    { 
      headerName: 'RSI+ST', 
      children: [
        { field: 'rsi.pnl', headerName: 'P&L', width: 100, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}` },
        { field: 'rsi.trades', headerName: 'Trades', width: 70 }
      ]
    }
  ], []);

  return (
    <div className="min-h-screen bg-gray-900 text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            📊 Strategy Backtester
          </h1>
          <p className="mt-2 text-gray-400">
            Backtest all 8 trading strategies on NIFTY 50 stocks with 1 year historical data
          </p>
        </div>

        {/* Run Button */}
        <div className="text-center mb-8">
          <button
            onClick={runBacktest}
            disabled={loading}
            className={`px-8 py-4 rounded-xl font-bold text-lg transition-all ${
              loading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Processing {progress.symbol} ({progress.current}/{progress.total})
              </span>
            ) : '🚀 Run Backtest on NIFTY 50'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {results && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Best Strategy */}
              <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-500/50 rounded-xl p-6">
                <h3 className="text-green-400 text-sm font-medium mb-2">🏆 Best Performer</h3>
                <p className="text-2xl font-bold text-white">{results.summary.bestStrategy.strategyName.split('(')[0]}</p>
                <p className="text-green-400 text-lg mt-1">
                  +{results.summary.bestStrategy.percentageReturn.toFixed(2)}% avg
                </p>
                <p className="text-gray-400 text-sm">
                  ₹{results.summary.bestStrategy.totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total P&L
                </p>
              </div>

              {/* Worst Strategy */}
              <div className="bg-gradient-to-br from-red-900/50 to-red-800/30 border border-red-500/50 rounded-xl p-6">
                <h3 className="text-red-400 text-sm font-medium mb-2">📉 Worst Performer</h3>
                <p className="text-2xl font-bold text-white">{results.summary.worstStrategy.strategyName.split('(')[0]}</p>
                <p className="text-red-400 text-lg mt-1">
                  {results.summary.worstStrategy.percentageReturn.toFixed(2)}% avg
                </p>
                <p className="text-gray-400 text-sm">
                  ₹{results.summary.worstStrategy.totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total P&L
                </p>
              </div>

              {/* Most False Positives */}
              <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 border border-orange-500/50 rounded-xl p-6">
                <h3 className="text-orange-400 text-sm font-medium mb-2">⚠️ Most False Positives</h3>
                <p className="text-2xl font-bold text-white">{results.summary.mostFalsePositives.strategyName.split('(')[0]}</p>
                <p className="text-orange-400 text-lg mt-1">
                  {results.summary.mostFalsePositives.falsePositives} bad signals
                </p>
                <p className="text-gray-400 text-sm">
                  Trades that resulted in losses
                </p>
              </div>

              {/* Most False Negatives */}
              <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 border border-yellow-500/50 rounded-xl p-6">
                <h3 className="text-yellow-400 text-sm font-medium mb-2">🔍 Most False Negatives</h3>
                <p className="text-2xl font-bold text-white">{results.summary.mostFalseNegatives.strategyName.split('(')[0]}</p>
                <p className="text-yellow-400 text-lg mt-1">
                  {results.summary.mostFalseNegatives.falseNegatives} missed
                </p>
                <p className="text-gray-400 text-sm">
                  Missed opportunities (more than2% gain)
                </p>
              </div>
            </div>

            {/* Benchmark */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8">
              <h3 className="text-gray-400 text-sm font-medium mb-2">📈 Benchmark (Buy & Hold)</h3>
              <p className="text-xl font-bold text-white">
                Average Return: <span className={results.benchmark.avgPercentageReturn > 0 ? 'text-green-400' : 'text-red-400'}>
                  {results.benchmark.avgPercentageReturn.toFixed(2)}%
                </span>
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Across {results.benchmark.stocksAnalyzed} stocks analyzed
              </p>
            </div>

            {/* Strategy Comparison Grid */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">📊 Strategy Comparison</h2>
              </div>
              <div className="ag-theme-alpine-dark" style={{ height: 400, width: '100%' }}>
                <AgGridReact
                  rowData={results.strategies}
                  columnDefs={strategyColumnDefs}
                  domLayout="normal"
                />
              </div>
            </div>

            {/* Individual Stock Results */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">📋 Individual Stock Results</h2>
              </div>
              <div className="ag-theme-alpine-dark" style={{ height: 500, width: '100%' }}>
                <AgGridReact
                  rowData={results.stockResults}
                  columnDefs={stockColumnDefs}
                  pagination={true}
                  paginationPageSize={15}
                />
              </div>
            </div>
          </>
        )}

        {/* Strategy Explanation */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-blue-400 mb-2">1️⃣ PVB</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• Price above 50 EMA</li>
              <li>• Breaks 20-day resistance</li>
              <li>• Volume ≥ 1.5x average</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-purple-400 mb-2">2️⃣ VSA</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• Stock in uptrend</li>
              <li>• Narrow range, low volume candle</li>
              <li>• Price near 20 EMA support</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-green-400 mb-2">3️⃣ Donchian</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• BUY: New 20-day high</li>
              <li>• SELL: Break below band</li>
              <li>• Turtle Trading rules</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-orange-400 mb-2">4️⃣ RSI+ST</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• BUY: ST green + RSI ≥ 60</li>
              <li>• SELL: ST red OR RSI &lt; 40</li>
              <li>• Momentum + Trend</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-cyan-400 mb-2">5️⃣ MA Cross</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• Golden Cross: 50 EMA &gt; 200 EMA</li>
              <li>• Death Cross: 50 EMA &lt; 200 EMA</li>
              <li>• Classic trend following</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-pink-400 mb-2">6️⃣ MACD</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• BUY: MACD crosses signal</li>
              <li>• (12, 26, 9) settings</li>
              <li>• Momentum + trend</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-indigo-400 mb-2">7️⃣ Bollinger</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• BUY: Price at lower band</li>
              <li>• SELL: Price at upper band</li>
              <li>• Mean reversion strategy</li>
            </ul>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-base font-bold text-teal-400 mb-2">8️⃣ Stochastic</h3>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• BUY: Oversold (&lt;20) + cross</li>
              <li>• SELL: Overbought (&gt;80) + cross</li>
              <li>• %K/%D momentum</li>
            </ul>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-blue-400 hover:text-blue-300 underline">
            ← Back to Stock Tracker
          </a>
        </div>
      </div>

      <style jsx global>{`
        .ag-theme-alpine-dark {
          --ag-background-color: transparent;
          --ag-header-background-color: rgba(31, 41, 55, 0.8);
          --ag-odd-row-background-color: rgba(31, 41, 55, 0.3);
          --ag-row-hover-color: rgba(59, 130, 246, 0.2);
        }
      `}</style>
    </div>
  );
}
