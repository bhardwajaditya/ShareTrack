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
        if (params.value < 30) return { color: 'green', fontWeight: 'bold' };
        if (params.value > 70) return { color: 'red', fontWeight: 'bold' };
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
      cellStyle: params => params.value === 'Bullish' ? { color: 'green' } : { color: 'red' }
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
        if (params.value === 'Oversold') return { color: 'green' };
        if (params.value === 'Overbought') return { color: 'red' };
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
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Loading Technical Analysis...</h2>
          <p className="text-gray-600">Calculating indicators for NIFTY 50 stocks</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-red-600">Error: {error}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-7xl sm:mx-auto w-full px-4">
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-full mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Technical Analysis (NIFTY 50)</h1>
            </div>
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
      </div>
    </div>
  );
} 