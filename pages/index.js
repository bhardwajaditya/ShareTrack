import { useState, useMemo, useCallback } from 'react';
import { getAvailableIndexes } from '../utils/nseIndexes';
import { fetchIndexAnalysis } from '../utils/stockData';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { ClientSideRowModelModule, ValidationModule } from 'ag-grid-community'; 

// Register modules
ModuleRegistry.registerModules([ClientSideRowModelModule, ValidationModule]);

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export default function Home() {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Master Grid: Indexes
  const indexRowData = useMemo(() => getAvailableIndexes(), []);
  
  const indexColumnDefs = useMemo(() => [
    { field: 'name', headerName: 'Index Name', sortable: true, filter: true, flex: 2 },
    { field: 'category', headerName: 'Category', sortable: true, filter: true, flex: 1 },
    { field: 'description', headerName: 'Description', flex: 3 }
  ], []);

  const onIndexRowSelected = useCallback(async (event) => {
    if (event.node.isSelected()) {
      const index = event.data;
      setSelectedIndex(index);
      setLoading(true);
      setError(null);
      setStockData([]);

      try {
        const data = await fetchIndexAnalysis(index.id);
        setStockData(data);
      } catch (err) {
        setError('Failed to fetch analysis data. Please try again.');
        console.error('Error fetching analysis:', err);
      } finally {
        setLoading(false);
      }
    }
  }, []);

  // Signal cell style helper (dark theme compatible)
  const signalCellStyle = (params) => {
    const value = params.value;
    if (value === 'BUY') return { backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG BUY') return { backgroundColor: 'rgba(34, 197, 94, 0.4)', color: '#22c55e', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'SELL') return { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG SELL') return { backgroundColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444', fontWeight: 'bold', textAlign: 'center' };
    return { backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', textAlign: 'center' };
  };

  // Detail Grid: Stocks & 4 Strategy Analysis
  const stockColumnDefs = useMemo(() => [
    { 
      field: 'symbol', 
      headerName: 'Symbol', 
      sortable: true, 
      filter: true, 
      pinned: 'left',
      width: 90
    },
    { 
      field: 'lastPrice', 
      headerName: 'Price', 
      sortable: true, 
      width: 85,
      valueFormatter: params => params.value ? `₹${params.value.toFixed(2)}` : ''
    },
    { 
      field: 'change', 
      headerName: 'Chg%', 
      sortable: true, 
      width: 70,
      cellStyle: params => {
        if (params.value > 0) return { color: '#16a34a', fontWeight: '500' };
        if (params.value < 0) return { color: '#dc2626', fontWeight: '500' };
        return null;
      },
      valueFormatter: params => params.value ? `${params.value > 0 ? '+' : ''}${params.value}%` : ''
    },
    // Overall Signal (Consensus)
    { 
      field: 'overallSignal', 
      headerName: '📊 Overall', 
      sortable: true, 
      filter: true,
      width: 100,
      cellStyle: signalCellStyle
    },
    { 
      field: 'overallScore', 
      headerName: 'Score', 
      sortable: true, 
      width: 65,
      cellStyle: params => {
        const score = params.value || 0;
        if (score >= 60) return { color: '#22c55e', fontWeight: 'bold' };
        if (score >= 40) return { color: '#fbbf24' };
        return { color: '#f87171' };
      }
    },
    { 
      field: 'buyCount', 
      headerName: 'Buys', 
      sortable: true, 
      width: 55,
      cellStyle: params => params.value >= 3 ? { color: '#22c55e', fontWeight: 'bold' } : 
                           params.value >= 2 ? { color: '#4ade80' } : { color: '#94a3b8' }
    },
    // Strategy 1: Trend-Pullback
    { 
      headerName: '1️⃣ Trend-Pullback',
      children: [
        { field: 'trendPullback.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'trendPullback.score', headerName: 'Pts', width: 50 }
      ]
    },
    // Strategy 2: Connors RSI-2
    { 
      headerName: '2️⃣ Connors RSI',
      children: [
        { field: 'connorsRSI.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'connorsRSI.score', headerName: 'Pts', width: 50 },
        { field: 'connorsRSI.rsi2', headerName: 'RSI', width: 50 }
      ]
    },
    // Strategy 3: Turtle Soup
    { 
      headerName: '3️⃣ Turtle Soup',
      children: [
        { field: 'turtleSoup.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'turtleSoup.score', headerName: 'Pts', width: 50 },
        { 
          field: 'turtleSoup.breakout', 
          headerName: 'Brk', 
          width: 45,
          valueFormatter: p => p.value ? '🚀' : '-',
          cellStyle: params => ({ textAlign: 'center' })
        }
      ]
    },
    // Strategy 4: Opening Range
    { 
      headerName: '4️⃣ Opening Range',
      children: [
        { field: 'openingRange.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'openingRange.score', headerName: 'Pts', width: 50 },
        { 
          field: 'openingRange.breakout', 
          headerName: 'Brk', 
          width: 45,
          valueFormatter: p => p.value ? '📈' : '-',
          cellStyle: params => ({ textAlign: 'center' })
        }
      ]
    }
  ], []);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">📊 Market Analysis</h1>
        <p className="mt-2 text-[var(--neutral-400)]">Select an index to view technical analysis and signals</p>
      </div>

      {/* Master Grid: Indexes */}
      <div className="card mb-8">
        <div className="card-header">
          <h2 className="text-lg font-medium text-white">Market Indexes</h2>
        </div>
        <div className="ag-theme-alpine" style={{ height: 300, width: '100%' }}>
          <AgGridReact
            rowData={indexRowData}
            columnDefs={indexColumnDefs}
            rowSelection="single"
            onRowSelected={onIndexRowSelected}
            pagination={true}
            paginationPageSize={10}
            animateRows={true}
          />
        </div>
      </div>

      {/* Detail View */}
      {selectedIndex && (
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-white">
                {selectedIndex.name} Analysis
              </h2>
              <p className="mt-1 text-sm text-[var(--neutral-400)]">
                {selectedIndex.description}
              </p>
            </div>
            {loading && (
              <div className="flex items-center text-[var(--primary-400)]">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--primary-400)] mr-2"></div>
                Analyzing...
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 text-[var(--danger-400)] bg-[var(--danger-500)]/10 border-t border-[var(--neutral-700)]">
              {error}
            </div>
          )}

          {!loading && !error && stockData.length > 0 && (
            <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
              <AgGridReact
                rowData={stockData}
                columnDefs={stockColumnDefs}
                pagination={true}
                paginationPageSize={20}
                animateRows={true}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
