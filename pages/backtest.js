import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { ClientSideRowModelModule, ValidationModule } from 'ag-grid-community';
import { runAllBacktests } from '../utils/backtest';
import { fetchIndexStocks, NSE_INDEXES, getAvailableIndexes } from '../utils/nseIndexes';

ModuleRegistry.registerModules([ClientSideRowModelModule, ValidationModule]);

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function BacktestPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, symbol: '', index: '' });
  const [selectedIndex, setSelectedIndex] = useState('ALL');

  // Get all available indexes
  const availableIndexes = useMemo(() => getAvailableIndexes(), []);

  const runBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Determine which indexes to run
      const indexesToRun = selectedIndex === 'ALL' 
        ? availableIndexes 
        : [NSE_INDEXES[selectedIndex]];

      // Collect all stocks from selected indexes (dedupe by symbol)
      const allStocksMap = new Map();
      for (const index of indexesToRun) {
        setProgress({ current: 0, total: 0, symbol: 'Fetching...', index: index.name });
        try {
          const stocks = await fetchIndexStocks(index.id);
          stocks.forEach(stock => {
            if (!allStocksMap.has(stock.symbol)) {
              allStocksMap.set(stock.symbol, { ...stock, index: index.name });
            }
          });
        } catch (err) {
          console.error(`Error fetching stocks for ${index.name}:`, err);
        }
      }
      const stocks = Array.from(allStocksMap.values());
      setProgress({ current: 0, total: stocks.length, symbol: '', index: 'Processing' });

      // Aggregate results for all 4 strategies
      const aggregatedResults = {
        strategies: [],
        benchmark: { totalPnL: 0, percentageReturn: 0 },
        stockResults: []
      };

      const strategyTotals = {
        'Trend-Pullback': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'MFI Momentum': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'Momentum Breakout': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 },
        'Opening Range': { totalPnL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, falsePositives: 0, falseNegatives: 0, stocks: 0 }
      };

      let benchmarkTotal = 0;
      let validStocks = 0;

      // Process each stock
      for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        setProgress({ current: i + 1, total: stocks.length, symbol: stock.symbol, index: 'Processing' });

        try {
          // Fetch 1 year of data
          const response = await fetch(`/api/stock-data?symbol=${stock.symbol}&period=1y&interval=1d`);
          if (!response.ok) continue;
          
          const data = await response.json();
          if (!data || data.length < 60) continue; // Need at least 60 days

          // Run backtest on this stock
          const stockBacktest = runAllBacktests(data, 100000);
          validStocks++;

          // Aggregate strategy results (now single strategy)
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

          // Store individual stock results for all 4 strategies
          aggregatedResults.stockResults.push({
            symbol: stock.symbol,
            name: stock.name,
            dataPoints: data.length,
            trendPullback: { 
              pnl: stockBacktest.strategies[0]?.totalPnL || 0, 
              trades: stockBacktest.strategies[0]?.totalTrades || 0, 
              winRate: stockBacktest.strategies[0]?.winRate || 0 
            },
            connorsRSI: { 
              pnl: stockBacktest.strategies[1]?.totalPnL || 0, 
              trades: stockBacktest.strategies[1]?.totalTrades || 0, 
              winRate: stockBacktest.strategies[1]?.winRate || 0 
            },
            momentumBreakout: { 
              pnl: stockBacktest.strategies[2]?.totalPnL || 0, 
              trades: stockBacktest.strategies[2]?.totalTrades || 0, 
              winRate: stockBacktest.strategies[2]?.winRate || 0 
            },
            openingRange: { 
              pnl: stockBacktest.strategies[3]?.totalPnL || 0, 
              trades: stockBacktest.strategies[3]?.totalTrades || 0, 
              winRate: stockBacktest.strategies[3]?.winRate || 0 
            },
            benchmarkReturn: stockBacktest.benchmark.percentageReturn,
            buyHoldProfit: stockBacktest.benchmark.totalPnL || (100000 * stockBacktest.benchmark.percentageReturn / 100)
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

      // Find best/worst strategies from all 4
      aggregatedResults.summary = {
        bestStrategy: aggregatedResults.strategies.reduce((best, current) => 
          current.percentageReturn > best.percentageReturn ? current : best
        ),
        worstStrategy: aggregatedResults.strategies.reduce((worst, current) => 
          current.percentageReturn < worst.percentageReturn ? current : worst
        ),
        mostFalsePositives: aggregatedResults.strategies.reduce((most, current) => 
          current.falsePositives > most.falsePositives ? current : most
        ),
        mostFalseNegatives: aggregatedResults.strategies.reduce((most, current) => 
          current.falseNegatives > most.falseNegatives ? current : most
        )
      };

      setResults(aggregatedResults);

    } catch (err) {
      setError('Failed to run backtest: ' + err.message);
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedIndex, availableIndexes]);

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
      cellStyle: params => ({ backgroundColor: params.value > 50 ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: params.value > 50 ? '#f87171' : 'inherit' })
    },
    { 
      field: 'falseNegatives', 
      headerName: 'False -ve', 
      width: 100,
      cellStyle: params => ({ backgroundColor: params.value > 100 ? 'rgba(251, 191, 36, 0.2)' : 'transparent', color: params.value > 100 ? '#fbbf24' : 'inherit' })
    },
    { field: 'stocksAnalyzed', headerName: 'Stocks', width: 80 }
  ], []);

  // Individual stock results columns - All 4 Strategies
  const stockColumnDefs = useMemo(() => [
    { field: 'symbol', headerName: 'Symbol', width: 100, pinned: 'left' },
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'dataPoints', headerName: 'Days', width: 60 },
    { 
      field: 'benchmarkReturn', 
      headerName: 'B&H %', 
      width: 80,
      valueFormatter: params => `${params.value?.toFixed(1) || 0}%`,
      cellStyle: params => params.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' }
    },
    { 
      headerName: '1️⃣ Trend-Pullback', 
      children: [
        { field: 'trendPullback.pnl', headerName: 'P&L', width: 90, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, cellStyle: p => p.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' } },
        { field: 'trendPullback.trades', headerName: 'Trd', width: 50 }
      ]
    },
    { 
      headerName: '2️⃣ MFI Momentum', 
      children: [
        { field: 'connorsRSI.pnl', headerName: 'P&L', width: 90, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, cellStyle: p => p.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' } },
        { field: 'connorsRSI.trades', headerName: 'Trd', width: 50 }
      ]
    },
    { 
      headerName: '3️⃣ Momentum Breakout', 
      children: [
        { field: 'momentumBreakout.pnl', headerName: 'P&L', width: 90, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, cellStyle: p => p.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' } },
        { field: 'momentumBreakout.trades', headerName: 'Trd', width: 50 }
      ]
    },
    { 
      headerName: '4️⃣ Opening Range', 
      children: [
        { field: 'openingRange.pnl', headerName: 'P&L', width: 90, valueFormatter: p => `₹${(p.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}`, cellStyle: p => p.value > 0 ? { color: '#16a34a' } : { color: '#dc2626' } },
        { field: 'openingRange.trades', headerName: 'Trd', width: 50 }
      ]
    }
  ], []);

  return (
    <div className="min-h-screen bg-gray-900 text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            📊 4-Strategy Backtester
          </h1>
          <p className="mt-2 text-gray-400">
            Backtest 4 Strategies on {selectedIndex === 'ALL' ? 'all available indexes' : NSE_INDEXES[selectedIndex]?.name || selectedIndex} with 1 year historical data
          </p>
        </div>

        {/* Index Selector */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <label className="text-gray-300 font-medium">Select Index:</label>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value)}
              disabled={loading}
              className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">🌐 All Available Indexes</option>
              <optgroup label="Major Indices">
                {availableIndexes.filter(i => i.category === 'Major Indices').map(index => (
                  <option key={index.id} value={index.id}>{index.name}</option>
                ))}
              </optgroup>
              <optgroup label="Market Cap Indices">
                {availableIndexes.filter(i => i.category === 'Market Cap Indices').map(index => (
                  <option key={index.id} value={index.id}>{index.name}</option>
                ))}
              </optgroup>
              <optgroup label="Sectoral Indices">
                {availableIndexes.filter(i => i.category === 'Sectoral Indices').map(index => (
                  <option key={index.id} value={index.id}>{index.name}</option>
                ))}
              </optgroup>
              <optgroup label="Thematic Indices">
                {availableIndexes.filter(i => i.category === 'Thematic Indices').map(index => (
                  <option key={index.id} value={index.id}>{index.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
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
                {progress.index !== 'Processing' 
                  ? `Fetching ${progress.index}...`
                  : `Processing ${progress.symbol} (${progress.current}/${progress.total})`
                }
              </span>
            ) : `🚀 Run Backtest on ${selectedIndex === 'ALL' ? 'All Indexes' : NSE_INDEXES[selectedIndex]?.name || selectedIndex}`}
          </button>
          {selectedIndex === 'ALL' && !loading && (
            <p className="mt-2 text-gray-500 text-sm">
              ⚠️ Running on all indexes may take several minutes depending on the number of stocks
            </p>
          )}
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
                  onGridReady={(params) => params.api.autoSizeAllColumns()}
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
                  onGridReady={(params) => params.api.autoSizeAllColumns()}
                />
              </div>
            </div>
          </>
        )}

        {/* 4 Strategy Explanations */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-white mb-4">📐 4 Trading Strategies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border border-blue-500/50 rounded-xl p-5">
              <h3 className="text-base font-bold text-blue-400 mb-2">1️⃣ Trend-Pullback</h3>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• Price &gt; 50 EMA (uptrend)</li>
                <li>• Stochastic + BB setup</li>
                <li>• MACD trigger</li>
                <li>• Volume confirmation</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-teal-900/50 to-teal-800/30 border border-teal-500/50 rounded-xl p-5">
              <h3 className="text-base font-bold text-teal-400 mb-2">2️⃣ MFI Momentum</h3>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• Price &gt; 50 EMA (uptrend)</li>
                <li>• MFI(14) &lt; 40 = BUY</li>
                <li>• ADX &gt; 20 (trending)</li>
                <li>• Volume &gt; 1.3x avg</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 border border-orange-500/50 rounded-xl p-5">
              <h3 className="text-base font-bold text-orange-400 mb-2">3️⃣ Momentum Breakout</h3>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• Above 20/50 EMA (trend)</li>
                <li>• RSI(14) 50-70 (momentum)</li>
                <li>• ADX &gt;25 (strong trend)</li>
                <li>• 10-day high + volume</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-500/50 rounded-xl p-5">
              <h3 className="text-base font-bold text-green-400 mb-2">4️⃣ Opening Range</h3>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• Break 5-day range high</li>
                <li>• Above VWAP</li>
                <li>• Volume spike &gt;1.3x</li>
                <li>• Target: 2x range</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-blue-400 hover:text-blue-300 underline">
            ← Back to Stock Tracker
          </a>
        </div>
      </div>


    </div>
  );
}
