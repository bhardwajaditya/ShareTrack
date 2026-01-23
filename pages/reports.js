import { useState, useEffect } from 'react';
import Head from 'next/head';

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-[var(--neutral-700)]">
                      <thead className="bg-[var(--neutral-900)]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--neutral-400)] uppercase">Symbol</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-[var(--neutral-400)] uppercase">Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-[var(--neutral-400)] uppercase">Avg Buy</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-[var(--neutral-400)] uppercase">Current</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-[var(--neutral-400)] uppercase">P&L %</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-[var(--neutral-400)] uppercase">Signal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--neutral-700)]">
                        {selectedReport.holdings?.map((holding, idx) => (
                          <tr key={idx} className="hover:bg-[var(--neutral-700)]/50">
                            <td className="px-4 py-3 font-medium text-white">{holding.symbol}</td>
                            <td className="px-4 py-3 text-right text-[var(--neutral-300)]">{holding.quantity}</td>
                            <td className="px-4 py-3 text-right text-[var(--neutral-300)]">
                              ₹{holding.avgBuyPrice?.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-[var(--neutral-300)]">
                              {holding.currentPrice ? `₹${holding.currentPrice.toFixed(2)}` : '-'}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${
                              parseFloat(holding.pnlPercent) >= 0 ? 'text-[var(--success-400)]' : 'text-[var(--danger-400)]'
                            }`}>
                              {holding.pnlPercent ? `${parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}${holding.pnlPercent}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {holding.signal ? getSignalBadge(holding.signal) : 
                                holding.analysis?.overallSignal ? getSignalBadge(holding.analysis.overallSignal) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
