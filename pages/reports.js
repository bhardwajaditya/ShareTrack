import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { ClientSideRowModelModule, ValidationModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register modules
ModuleRegistry.registerModules([ClientSideRowModelModule, ValidationModule]);

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reports?limit=30');
      const data = await res.json();
      if (data.success) {
        setReports(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch reports. Make sure MongoDB is configured.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReportDetail = async (id) => {
    try {
      const res = await fetch(`/api/reports?id=${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedReport(data.data);
      }
    } catch (err) {
      alert('Failed to load report details');
    }
  };

  const generateReport = async () => {
    try {
      setGenerating(true);
      const res = await fetch('/api/analyze-portfolio', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchReports();
        if (data.report?._id) {
          setSelectedReport(data.report);
        }
      } else {
        alert(data.error || 'Failed to generate report');
      }
    } catch (err) {
      alert('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const getSignalBadge = (signal) => {
    const styles = {
      'STRONG BUY': 'signal-badge signal-strong-buy',
      'BUY': 'signal-badge signal-buy',
      'HOLD': 'signal-badge signal-hold',
      'SELL': 'signal-badge signal-sell',
      'STRONG SELL': 'signal-badge signal-strong-sell',
      'LOSS ALERT': 'signal-badge signal-sell',
      'MOMENTUM': 'signal-badge signal-strong-buy'
    };
    return (
      <span className={styles[signal] || 'signal-badge signal-hold'}>
        {signal}
      </span>
    );
  };



  const signalCellStyle = (params) => {
    const value = params.value;
    if (value === 'BUY') return { backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG BUY') return { backgroundColor: 'rgba(34, 197, 94, 0.4)', color: '#22c55e', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'SELL') return { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 'bold', textAlign: 'center' };
    if (value === 'STRONG SELL') return { backgroundColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444', fontWeight: 'bold', textAlign: 'center' };
    return { backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', textAlign: 'center' };
  };

  const columnDefs = useMemo(() => [
    { 
      field: 'symbol', 
      headerName: 'Symbol', 
      sortable: true, 
      filter: true, 
      pinned: 'left',
      width: 90
    },
    { 
      field: 'currentPrice', 
      headerName: 'Price', 
      sortable: true, 
      width: 85,
      valueFormatter: params => params.value ? `₹${params.value.toFixed(2)}` : ''
    },
    { 
      field: 'pnlPercent', 
      headerName: 'P&L %', 
      sortable: true, 
      width: 90,
      cellStyle: params => {
        if (params.value > 0) return { color: '#16a34a', fontWeight: '500' };
        if (params.value < 0) return { color: '#dc2626', fontWeight: '500' };
        return null;
      },
      valueFormatter: params => params.value ? `${parseFloat(params.value) >= 0 ? '+' : ''}${parseFloat(params.value).toFixed(2)}%` : '-'
    },
    // Overall Signal (Consensus)
    { 
      field: 'analysis.overallSignal', 
      headerName: '📊 Overall', 
      sortable: true, 
      filter: true,
      width: 100,
      cellStyle: signalCellStyle
    },
    { 
      field: 'analysis.overallScore', 
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
      field: 'analysis.buyCount', 
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
        { field: 'analysis.trendPullback.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'analysis.trendPullback.score', headerName: 'Pts', width: 50 }
      ]
    },
    // Strategy 2: MFI Momentum Trend
    {
      headerName: '2️⃣ MFI Momentum',
      children: [
        { field: 'analysis.connorsRSI.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'analysis.connorsRSI.score', headerName: 'Pts', width: 50 },
        { field: 'analysis.connorsRSI.mfi', headerName: 'MFI', width: 50 }
      ]
    },
    // Strategy 3: Momentum Breakout
    { 
      headerName: '3️⃣ Momentum Breakout',
      children: [
        { field: 'analysis.momentumBreakout.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'analysis.momentumBreakout.score', headerName: 'Pts', width: 50 },
        { 
          field: 'analysis.momentumBreakout.breakout', 
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
        { field: 'analysis.openingRange.signal', headerName: 'Sig', width: 80, cellStyle: signalCellStyle },
        { field: 'analysis.openingRange.score', headerName: 'Pts', width: 50 },
        { 
          field: 'analysis.openingRange.breakout', 
          headerName: 'Brk', 
          width: 45,
          valueFormatter: p => p.value ? '📈' : '-',
          cellStyle: params => ({ textAlign: 'center' })
        }
      ]
    }
  ], []);

  return (
    <>
      <Head>
        <title>Reports | ShareTrack</title>
      </Head>

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">📋 Portfolio Reports</h1>
            <p className="mt-2 text-[var(--neutral-400)]">
              View automated analysis reports for your holdings
            </p>
          </div>
          <button
            onClick={generateReport}
            disabled={generating}
            className="btn btn-primary disabled:opacity-50"
          >
            {generating ? 'Generating...' : '🔄 Generate New Report'}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-[var(--danger-500)]/10 border border-[var(--danger-500)]/30 text-[var(--danger-400)] px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}



          {/* Reports List */}
          <div className="lg:col-span-1">
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-white">Recent Reports</h2>
              </div>
              
              {loading && (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--primary-500)]"></div>
                </div>
              )}

              {!loading && reports.length === 0 && (
                <div className="text-center py-10 text-[var(--neutral-400)]">
                  <p>No reports yet</p>
                  <p className="text-sm mt-2">Generate your first report above</p>
                </div>
              )}

              <div className="divide-y divide-[var(--neutral-700)] max-h-[600px] overflow-y-auto">
                {reports.map((report) => (
                  <button
                    key={report._id}
                    onClick={() => fetchReportDetail(report._id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[var(--neutral-700)] transition-colors ${
                      selectedReport?._id === report._id ? 'bg-[var(--primary-600)]/20 border-l-4 border-[var(--primary-500)]' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{report.marketDate}</p>
                        <p className="text-xs text-[var(--neutral-400)]">{formatDate(report.generatedAt)}</p>
                      </div>
                      {report.actionRequiredCount > 0 && (
                        <span className="signal-badge signal-sell">
                          {report.actionRequiredCount} action{report.actionRequiredCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--neutral-400)] mt-1">
                      {report.totalHoldings} holdings analyzed
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Report Detail */}
          <div className="lg:col-span-2">
            {!selectedReport && (
              <div className="card card-glass p-10 text-center">
                <span className="text-5xl mb-4 block">📋</span>
                <p className="text-lg text-[var(--neutral-300)]">Select a report to view details</p>
                <p className="text-sm mt-2 text-[var(--neutral-500)]">Or generate a new report to get started</p>
              </div>
            )}

            {selectedReport && (
              <div className="space-y-6">
                {/* Report Header */}
                <div className="card">
                  <div className="card-body">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-bold text-white">
                          Report: {selectedReport.marketDate}
                        </h2>
                        <p className="text-sm text-[var(--neutral-400)]">
                          Generated: {formatDate(selectedReport.generatedAt)}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-[var(--neutral-700)] rounded-full text-sm text-[var(--neutral-300)]">
                        {selectedReport.type || 'manual'}
                      </span>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                      <div className="text-center p-3 bg-[var(--neutral-700)] rounded-lg">
                        <p className="text-2xl font-bold text-white">
                          {selectedReport.totalHoldings}
                        </p>
                        <p className="text-sm text-[var(--neutral-400)]">Holdings</p>
                      </div>
                      <div className="text-center p-3 bg-[var(--neutral-700)] rounded-lg">
                        <p className="text-2xl font-bold text-white">
                          {selectedReport.analyzedCount}
                        </p>
                        <p className="text-sm text-[var(--neutral-400)]">Analyzed</p>
                      </div>
                      <div className="text-center p-3 bg-[var(--neutral-700)] rounded-lg">
                        <p className={`text-2xl font-bold ${
                          selectedReport.actionRequired?.length > 0 ? 'text-[var(--danger-400)]' : 'text-[var(--success-400)]'
                        }`}>
                          {selectedReport.actionRequired?.length || 0}
                        </p>
                        <p className="text-sm text-[var(--neutral-400)]">Actions Required</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Required Section */}
                {selectedReport.actionRequired?.length > 0 && (
                  <div className="card">
                    <div className="card-header bg-[var(--danger-500)]/10 border-b border-[var(--danger-500)]/30">
                      <h3 className="font-semibold text-[var(--danger-400)]">⚠️ Actions Required</h3>
                    </div>
                    <div className="divide-y divide-[var(--neutral-700)]">
                      {selectedReport.actionRequired.map((action, idx) => (
                        <div key={idx} className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-white">{action.symbol}</span>
                              {getSignalBadge(action.signal)}
                            </div>
                            <span className={`font-semibold ${
                              parseFloat(action.pnlPercent) >= 0 ? 'text-[var(--success-400)]' : 'text-[var(--danger-400)]'
                            }`}>
                              {parseFloat(action.pnlPercent) >= 0 ? '+' : ''}{action.pnlPercent}%
                            </span>
                          </div>
                          <p className="text-sm text-[var(--neutral-400)] mt-2">{action.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Holdings */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="font-semibold text-white">All Holdings Analysis</h3>
                  </div>
                  <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
                    <AgGridReact
                      rowData={selectedReport.holdings}
                      columnDefs={columnDefs}
                      pagination={true}
                      paginationPageSize={20}
                      animateRows={true}
                      onGridReady={(params) => params.api.autoSizeAllColumns()}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
  );
}
