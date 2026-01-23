import { useState, useEffect, useMemo } from 'react';
import { fetchIndexStocks } from '../utils/nseIndexes';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function SMAAnalysis() {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const columnDefs = useMemo(() => [
    { field: 'symbol', headerName: 'Symbol', sortable: true, filter: true, pinned: 'left' },
    { 
      field: 'lastPrice', 
      headerName: 'Last Price', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : ''
    },
    { 
      field: 'indicators.rsi', 
      headerName: 'RSI', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : '',
      cellStyle: params => {
        if (params.value < 30) return { color: '#4ade80', fontWeight: 'bold' };
        if (params.value > 70) return { color: '#f87171', fontWeight: 'bold' };
        return null;
      }
    },
    { 
      field: 'indicators.macd', 
      headerName: 'MACD', 
      sortable: true,
      valueGetter: params => {
        const macd = params.data.indicators?.macd;
        if (!macd) return null;
        return macd.MACD > macd.signal ? 'Bullish' : 'Bearish';
      },
      cellStyle: params => params.value === 'Bullish' ? { color: '#4ade80' } : { color: '#f87171' }
    },
    { 
      field: 'indicators.bb', 
      headerName: 'Bollinger Bands', 
      sortable: true,
      valueGetter: params => {
        const bb = params.data.indicators?.bb;
        const price = params.data.lastPrice;
        if (!bb || !price) return null;
        if (price < bb.lower) return 'Oversold';
        if (price > bb.upper) return 'Overbought';
        return 'Neutral';
      },
      cellStyle: params => {
        if (params.value === 'Oversold') return { color: '#4ade80' };
        if (params.value === 'Overbought') return { color: '#f87171' };
        return null;
      }
    },
    { 
      field: 'indicators.adx', 
      headerName: 'ADX', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : ''
    },
    { 
      field: 'indicators.stochastic', 
      headerName: 'Stochastic', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.k.toFixed(2) : ''
    },
    { 
      field: 'indicators.vwap', 
      headerName: 'VWAP', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : ''
    },
    { 
      field: 'indicators.sma44', 
      headerName: 'SMA 44', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : ''
    },
    { 
      field: 'indicators.sma90', 
      headerName: 'SMA 90', 
      sortable: true,
      valueFormatter: params => params.value ? params.value.toFixed(2) : ''
    }
  ], []);

  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 100,
    resizable: true
  }), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch NIFTY 50 stocks
        const stocks = await fetchIndexStocks('NIFTY 50');
        
        // 2. Fetch indicators for each stock
        // We do this in chunks to avoid overwhelming the browser/server
        const chunkSize = 10;
        const processedData = [];

        for (let i = 0; i < stocks.length; i += chunkSize) {
          const chunk = stocks.slice(i, i + chunkSize);
          const promises = chunk.map(async (stock) => {
            try {
              const response = await fetch('/api/indicators', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  symbol: stock.symbol,
                  indicators: ['sma', 'rsi', 'macd', 'bb', 'adx', 'stochastic', 'vwap']
                })
              });
              if (!response.ok) return null;
              return await response.json();
            } catch (e) {
              console.error(`Error fetching indicators for ${stock.symbol}:`, e);
              return null;
            }
          });

          const results = await Promise.all(promises);
          processedData.push(...results.filter(Boolean));
        }
        
        setStockData(processedData);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary-500)] mb-4"></div>
        <h2 className="text-xl font-semibold text-white">Loading Technical Analysis...</h2>
        <p className="text-[var(--neutral-400)]">Calculating indicators for NIFTY 50 stocks</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in flex flex-col justify-center items-center py-20">
        <div className="bg-[var(--danger-500)]/10 border border-[var(--danger-500)]/30 text-[var(--danger-400)] px-6 py-4 rounded-lg">
          <h2 className="text-xl font-semibold">Error: {error}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">📊 Technical Analysis (NIFTY 50)</h1>
        <p className="mt-2 text-[var(--neutral-400)]">Real-time technical indicators for all NIFTY 50 stocks</p>
      </div>
      
      {/* Grid */}
      <div className="card">
        <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
          <AgGridReact
            rowData={stockData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={20}
            animateRows={true}
            enableCellTextSelection={true}
          />
        </div>
      </div>
    </div>
  );
} 