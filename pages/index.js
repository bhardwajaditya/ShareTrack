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

  // Signal cell style helper
  const signalCellStyle = (params) => {
    const value = params.value;
    if (value === 'BUY') return { backgroundColor: '#dcfce7', color: '#166534', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG BUY') return { backgroundColor: '#22c55e', color: 'white', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'SELL') return { backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG SELL') return { backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold', textAlign: 'center' };
    return { backgroundColor: '#f3f4f6', color: '#6b7280', textAlign: 'center' };
  };

  // Detail Grid: Stocks & Analysis - 8 Strategies
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
    // Overall Signal
    { 
      field: 'overallSignal', 
      headerName: '📊 Overall', 
      sortable: true, 
      filter: true,
      width: 100,
      cellStyle: signalCellStyle
    },
    { 
      field: 'buyCount', 
      headerName: 'Buy#', 
      sortable: true, 
      width: 55,
      cellStyle: params => params.value >= 3 ? { color: '#16a34a', fontWeight: 'bold' } : {}
    },
    // Strategy 1: PVB
    { 
      headerName: '1️⃣ PVB',
      children: [
        { field: 'pvb.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'pvb.reason', headerName: 'Reason', width: 140, tooltipField: 'pvb.reason' }
      ]
    },
    // Strategy 2: VSA
    { 
      headerName: '2️⃣ VSA',
      children: [
        { field: 'vsa.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'vsa.reason', headerName: 'Reason', width: 140, tooltipField: 'vsa.reason' }
      ]
    },
    // Strategy 3: Donchian
    { 
      headerName: '3️⃣ Donchian',
      children: [
        { field: 'donchian.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'donchian.reason', headerName: 'Reason', width: 140, tooltipField: 'donchian.reason' }
      ]
    },
    // Strategy 4: RSI + Supertrend
    { 
      headerName: '4️⃣ RSI+ST',
      children: [
        { field: 'rsiSupertrend.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'rsiSupertrend.rsi', headerName: 'RSI', width: 55 }
      ]
    },
    // Strategy 5: MA Crossover
    { 
      headerName: '5️⃣ MACross',
      children: [
        { field: 'maCrossover.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'maCrossover.reason', headerName: 'Reason', width: 140, tooltipField: 'maCrossover.reason' }
      ]
    },
    // Strategy 6: MACD
    { 
      headerName: '6️⃣ MACD',
      children: [
        { field: 'macdCrossover.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'macdCrossover.histogram', headerName: 'Hist', width: 60 }
      ]
    },
    // Strategy 7: Bollinger Bands
    { 
      headerName: '7️⃣ BB',
      children: [
        { field: 'bollingerBands.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'bollingerBands.percentB', headerName: '%B', width: 55 }
      ]
    },
    // Strategy 8: Stochastic
    { 
      headerName: '8️⃣ Stoch',
      children: [
        { field: 'stochastic.signal', headerName: 'Sig', width: 70, cellStyle: signalCellStyle },
        { field: 'stochastic.k', headerName: '%K', width: 50 }
      ]
    }
  ], []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">NSE Stock Tracker & Analysis</h1>
          <p className="mt-2 text-gray-600">Select an index to view technical analysis and signals</p>
        </div>

        {/* Master Grid: Indexes */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden mb-8">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Market Indexes</h2>
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
          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  {selectedIndex.name} Analysis
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedIndex.description}
                </p>
              </div>
              {loading && (
                <div className="flex items-center text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                  Analyzing...
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 text-red-600 bg-red-50">
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
    </div>
  );
}
