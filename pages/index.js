import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Dashboard() {
  const [portfolioStats, setPortfolioStats] = useState(null);
  const [latestReport, setLatestReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch portfolio
      const portfolioRes = await fetch('/api/portfolio');
      const portfolioData = await portfolioRes.json();
      
      if (portfolioData.success && portfolioData.data.length > 0) {
        const holdings = portfolioData.data;
        const totalInvested = holdings.reduce((sum, h) => sum + (h.quantity * h.avgBuyPrice), 0);
        setPortfolioStats({
          count: holdings.length,
          totalInvested
        });
      }

      // Fetch latest report
      const reportsRes = await fetch('/api/reports?limit=1');
      const reportsData = await reportsRes.json();
      
      if (reportsData.success && reportsData.data.length > 0) {
        setLatestReport(reportsData.data[0]);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Dashboard | ShareTrack</title>
        <meta name="description" content="Track your stock portfolio with advanced technical analysis" />
      </Head>

      <div className="animate-fade-in">
        {/* Hero Section */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">
            Welcome to <span className="text-gradient">ShareTrack</span>
          </h1>
          <p className="text-[var(--neutral-400)] text-lg max-w-2xl">
            Your intelligent stock portfolio tracker with 4 powerful trading strategies,
            automated analysis reports, and real-time market insights.
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="stat-card">
            <p className="label">Portfolio Holdings</p>
            <p className="value">{portfolioStats?.count || 0}</p>
            <Link href="/portfolio" className="text-sm text-[var(--primary-400)] mt-2 inline-block hover:underline">
              View portfolio →
            </Link>
          </div>

          <div className="stat-card">
            <p className="label">Total Invested</p>
            <p className="value">
              {portfolioStats?.totalInvested 
                ? `₹${portfolioStats.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : '₹0'
              }
            </p>
            <Link href="/portfolio" className="text-sm text-[var(--primary-400)] mt-2 inline-block hover:underline">
              Add stocks →
            </Link>
          </div>

          <div className="stat-card">
            <p className="label">Active Strategies</p>
            <p className="value">4</p>
            <Link href="/backtest" className="text-sm text-[var(--primary-400)] mt-2 inline-block hover:underline">
              Run backtest →
            </Link>
          </div>

          <div className="stat-card">
            <p className="label">Actions Required</p>
            <p className={`value ${latestReport?.actionRequiredCount > 0 ? 'negative' : 'positive'}`}>
              {latestReport?.actionRequiredCount || 0}
            </p>
            <Link href="/reports" className="text-sm text-[var(--primary-400)] mt-2 inline-block hover:underline">
              View reports →
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* Market Analysis Card */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>📊 Market Analysis</span>
              <Link href="/" className="btn btn-primary text-sm">
                Open Analysis
              </Link>
            </div>
            <div className="card-body">
              <p className="text-[var(--neutral-400)] mb-4">
                Analyze NIFTY 50, Bank NIFTY, and other major indexes with real-time 
                signals from 4 trading strategies.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {['Trend-Pullback', 'Connors RSI', 'Turtle Soup', 'Opening Range'].map((strategy) => (
                  <div key={strategy} className="text-center p-2 rounded bg-[var(--neutral-700)]">
                    <span className="text-xs text-[var(--neutral-300)]">{strategy}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Portfolio Overview Card */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>💼 Portfolio</span>
              <Link href="/portfolio" className="btn btn-primary text-sm">
                Manage Holdings
              </Link>
            </div>
            <div className="card-body">
              {portfolioStats?.count > 0 ? (
                <div>
                  <p className="text-[var(--neutral-400)] mb-4">
                    You have <span className="text-white font-semibold">{portfolioStats.count}</span> stocks 
                    in your portfolio with a total investment of{' '}
                    <span className="text-white font-semibold">
                      ₹{portfolioStats.totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-[var(--neutral-400)]">
                  Start building your portfolio by adding your stock holdings. 
                  Track P&L and get automated analysis reports.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Latest Report Preview */}
        {latestReport && (
          <div className="card mb-10">
            <div className="card-header flex items-center justify-between">
              <span>📋 Latest Report - {latestReport.marketDate}</span>
              <Link href="/reports" className="btn btn-secondary text-sm">
                View All Reports
              </Link>
            </div>
            <div className="card-body">
              {latestReport.actionRequired?.length > 0 ? (
                <div className="space-y-3">
                  {latestReport.actionRequired.slice(0, 3).map((action, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-[var(--neutral-700)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">{action.symbol}</span>
                        <span className={`signal-badge ${
                          action.signal === 'STRONG SELL' ? 'signal-strong-sell' :
                          action.signal === 'SELL' ? 'signal-sell' :
                          action.signal === 'LOSS ALERT' ? 'signal-sell' :
                          'signal-hold'
                        }`}>
                          {action.signal}
                        </span>
                      </div>
                      <span className={`font-semibold ${
                        parseFloat(action.pnlPercent) >= 0 ? 'text-[var(--success-400)]' : 'text-[var(--danger-400)]'
                      }`}>
                        {parseFloat(action.pnlPercent) >= 0 ? '+' : ''}{action.pnlPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <span className="text-4xl mb-3 block">✅</span>
                  <p className="text-[var(--neutral-400)]">No actions required. Your portfolio looks good!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Getting Started (if no portfolio) */}
        {!loading && !portfolioStats && (
          <div className="card card-glass animate-pulse-glow">
            <div className="card-body text-center py-12">
              <span className="text-5xl mb-4 block">🚀</span>
              <h2 className="text-2xl font-bold text-white mb-3">Get Started with ShareTrack</h2>
              <p className="text-[var(--neutral-400)] mb-6 max-w-lg mx-auto">
                Add your stock holdings to start tracking performance, 
                receive automated analysis reports, and get actionable trading signals.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/portfolio" className="btn btn-primary">
                  Add Your First Stock
                </Link>
                <Link href="/" className="btn btn-secondary">
                  Explore Market Analysis
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
