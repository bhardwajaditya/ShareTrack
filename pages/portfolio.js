import { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import Head from 'next/head';

export default function Portfolio() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [formData, setFormData] = useState({ symbol: '', quantity: '', avgBuyPrice: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  
  // Autocomplete state
  const [nseSymbols, setNseSymbols] = useState([]);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingSymbols, setLoadingSymbols] = useState(false);

  // Fetch holdings on mount
  useEffect(() => {
    fetchHoldings();
  }, []);

  const fetchHoldings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      if (data.success) {
        // Fetch current prices for each holding
        const holdingsWithPrices = await Promise.all(
          data.data.map(async (holding) => {
            try {
              const priceRes = await fetch(`/api/stock-data?symbol=${holding.symbol}&period=1d`);
              const priceData = await priceRes.json();
              // API returns array directly, not { data: [...] }
              const currentPrice = Array.isArray(priceData) && priceData.length > 0 
                ? priceData[priceData.length - 1].close 
                : null;
              const investedValue = holding.quantity * holding.avgBuyPrice;
              const currentValue = currentPrice ? holding.quantity * currentPrice : null;
              const pnl = currentValue ? currentValue - investedValue : null;
              const pnlPercent = pnl ? (pnl / investedValue) * 100 : null;
              
              return {
                ...holding,
                currentPrice,
                investedValue,
                currentValue,
                pnl,
                pnlPercent
              };
            } catch (e) {
              return {
                ...holding,
                currentPrice: null,
                investedValue: holding.quantity * holding.avgBuyPrice,
                currentValue: null,
                pnl: null,
                pnlPercent: null
              };
            }
          })
        );
        setHoldings(holdingsWithPrices);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch portfolio. Make sure MongoDB is configured.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    setEditingHolding(null);
    setFormData({ symbol: '', quantity: '', avgBuyPrice: '', notes: '' });
    setSymbolSearch('');
    setShowModal(true);
    
    // Fetch NSE symbols if not already loaded
    if (nseSymbols.length === 0) {
      setLoadingSymbols(true);
      try {
        const res = await fetch('/api/nse-symbols');
        const data = await res.json();
        if (data.success) {
          setNseSymbols(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch NSE symbols:', err);
      } finally {
        setLoadingSymbols(false);
      }
    }
  };
  
  // Filter symbols based on search
  const filteredSymbols = useMemo(() => {
    if (!symbolSearch) return [];
    const search = symbolSearch.toUpperCase();
    return nseSymbols
      .filter(s => 
        s.symbol.includes(search) || 
        s.companyName.toUpperCase().includes(search)
      )
      .slice(0, 10); // Limit to 10 results
  }, [symbolSearch, nseSymbols]);
  
  const handleSymbolSelect = (symbol) => {
    setFormData({ ...formData, symbol });
    setSymbolSearch(symbol);
    setShowDropdown(false);
  };

  const handleEdit = (holding) => {
    setEditingHolding(holding);
    setFormData({
      symbol: holding.symbol,
      quantity: holding.quantity.toString(),
      avgBuyPrice: holding.avgBuyPrice.toString(),
      notes: holding.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this holding?')) return;
    
    try {
      const res = await fetch(`/api/portfolio?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchHoldings();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to delete holding');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const method = editingHolding ? 'PUT' : 'POST';
      const body = editingHolding 
        ? { ...formData, id: editingHolding._id }
        : formData;

      const res = await fetch('/api/portfolio', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchHoldings();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to save holding');
    } finally {
      setSubmitting(false);
    }
  };

  const columnDefs = useMemo(() => [
    { 
      field: 'symbol', 
      headerName: 'Symbol', 
      sortable: true, 
      filter: true,
      width: 100,
      cellStyle: { fontWeight: 'bold' }
    },
    { 
      field: 'quantity', 
      headerName: 'Qty', 
      sortable: true, 
      width: 80,
      type: 'numericColumn'
    },
    { 
      field: 'avgBuyPrice', 
      headerName: 'Avg Buy ₹', 
      sortable: true, 
      width: 100,
      valueFormatter: p => p.value ? `₹${p.value.toFixed(2)}` : '-'
    },
    { 
      field: 'currentPrice', 
      headerName: 'Current ₹', 
      sortable: true, 
      width: 100,
      valueFormatter: p => p.value ? `₹${p.value.toFixed(2)}` : 'N/A'
    },
    { 
      field: 'investedValue', 
      headerName: 'Invested', 
      sortable: true, 
      width: 110,
      valueFormatter: p => p.value ? `₹${p.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-'
    },
    { 
      field: 'currentValue', 
      headerName: 'Current Value', 
      sortable: true, 
      width: 120,
      valueFormatter: p => p.value ? `₹${p.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-'
    },
    { 
      field: 'pnl', 
      headerName: 'P&L', 
      sortable: true, 
      width: 100,
      valueFormatter: p => p.value ? `₹${p.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-',
      cellStyle: p => {
        if (p.value > 0) return { color: '#16a34a', fontWeight: 'bold' };
        if (p.value < 0) return { color: '#dc2626', fontWeight: 'bold' };
        return {};
      }
    },
    { 
      field: 'pnlPercent', 
      headerName: 'P&L %', 
      sortable: true, 
      width: 90,
      valueFormatter: p => p.value !== null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(2)}%` : '-',
      cellStyle: p => {
        if (p.value > 0) return { color: '#16a34a', fontWeight: 'bold' };
        if (p.value < 0) return { color: '#dc2626', fontWeight: 'bold' };
        return {};
      }
    },
    { 
      field: 'notes', 
      headerName: 'Notes', 
      flex: 1,
      tooltipField: 'notes'
    },
    {
      headerName: 'Actions',
      width: 150,
      cellRenderer: (params) => {
        return (
          <div className="flex gap-2">
            <button 
              onClick={() => handleEdit(params.data)}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Edit
            </button>
            <button 
              onClick={() => handleDelete(params.data._id)}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        );
      }
    }
  ], []);

  // Calculate totals
  const totals = useMemo(() => {
    const invested = holdings.reduce((sum, h) => sum + (h.investedValue || 0), 0);
    const current = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const pnl = current - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPercent };
  }, [holdings]);

  return (
    <>
      <Head>
        <title>Portfolio | ShareTrack</title>
      </Head>

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">💼 My Portfolio</h1>
            <p className="mt-2 text-[var(--neutral-400)]">Manage your stock holdings and track performance</p>
          </div>
          <button
            onClick={handleAddNew}
            className="btn btn-primary"
          >
            + Add Holding
          </button>
        </div>

        {/* Summary Cards */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="stat-card">
              <p className="label">Total Invested</p>
              <p className="value">
                ₹{totals.invested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="stat-card">
              <p className="label">Current Value</p>
              <p className="value">
                ₹{totals.current.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="stat-card">
              <p className="label">Total P&L</p>
              <p className={`value ${totals.pnl >= 0 ? 'positive' : 'negative'}`}>
                {totals.pnl >= 0 ? '+' : ''}₹{totals.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="stat-card">
              <p className="label">Return %</p>
              <p className={`value ${totals.pnlPercent >= 0 ? 'positive' : 'negative'}`}>
                {totals.pnlPercent >= 0 ? '+' : ''}{totals.pnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-[var(--danger-500)]/10 border border-[var(--danger-500)]/30 text-[var(--danger-400)] px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary-500)]"></div>
            <span className="ml-3 text-[var(--neutral-400)]">Loading portfolio...</span>
          </div>
        )}

        {/* Holdings Grid */}
        {!loading && !error && (
          <div className="card">
            <div className="ag-theme-alpine" style={{ height: 500, width: '100%' }}>
              <AgGridReact
                rowData={holdings}
                columnDefs={columnDefs}
                pagination={true}
                paginationPageSize={15}
                animateRows={true}
                domLayout="normal"
                onGridReady={(params) => params.api.autoSizeAllColumns()}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && holdings.length === 0 && (
          <div className="text-center py-20 card card-glass">
            <span className="text-5xl mb-4 block">💼</span>
            <p className="text-[var(--neutral-400)] text-lg mb-4">No holdings yet</p>
            <button
              onClick={handleAddNew}
              className="btn btn-primary"
            >
              Add Your First Stock
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingHolding ? 'Edit Holding' : 'Add New Holding'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-[var(--neutral-300)] mb-1">
                    Symbol (NSE)
                  </label>
                  {editingHolding ? (
                    <input
                      type="text"
                      value={formData.symbol}
                      className="input"
                      disabled
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        value={symbolSearch}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setSymbolSearch(val);
                          setFormData({ ...formData, symbol: val });
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        className="input"
                        placeholder={loadingSymbols ? 'Loading symbols...' : 'Type to search...'}
                        required
                        autoComplete="off"
                      />
                      {showDropdown && filteredSymbols.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-[var(--neutral-800)] border border-[var(--neutral-700)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredSymbols.map((item) => (
                            <div
                              key={item.symbol}
                              onClick={() => handleSymbolSelect(item.symbol)}
                              className="px-4 py-3 hover:bg-[var(--neutral-700)] cursor-pointer border-b border-[var(--neutral-700)] last:border-b-0"
                            >
                              <div className="font-medium text-white">{item.symbol}</div>
                              <div className="text-sm text-[var(--neutral-400)] truncate">{item.companyName}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {showDropdown && symbolSearch && filteredSymbols.length === 0 && !loadingSymbols && (
                        <div className="absolute z-50 w-full mt-1 bg-[var(--neutral-800)] border border-[var(--neutral-700)] rounded-lg shadow-lg p-4 text-center text-[var(--neutral-400)]">
                          No matching symbols found
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--neutral-300)] mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="input"
                    placeholder="e.g. 50"
                    min="1"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--neutral-300)] mb-1">
                    Average Buy Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.avgBuyPrice}
                    onChange={(e) => setFormData({ ...formData, avgBuyPrice: e.target.value })}
                    className="input"
                    placeholder="e.g. 2450.50"
                    min="0"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--neutral-300)] mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    placeholder="e.g. Long term hold"
                    rows="2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editingHolding ? 'Update' : 'Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
