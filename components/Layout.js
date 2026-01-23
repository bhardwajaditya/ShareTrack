import Link from 'next/link';
import { useRouter } from 'next/router';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/analysis', label: 'Market Analysis', icon: '📊' },
  { href: '/portfolio', label: 'Portfolio', icon: '💼' },
  { href: '/backtest', label: 'Backtest', icon: '📈' },
  { href: '/reports', label: 'Reports', icon: '📋' },
];

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--neutral-900)]">
      {/* Navbar */}
      <nav className="navbar">
        <div className="flex items-center justify-between w-full">
          <Link href="/dashboard" className="navbar-brand flex items-center gap-2">
            <span className="text-2xl">📈</span>
            <span>ShareTrack</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--neutral-400)]">
              {new Date().toLocaleDateString('en-IN', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short' 
              })}
            </span>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="sidebar">
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link 
              key={item.href}
              href={item.href}
              className={`sidebar-link ${router.pathname === item.href ? 'active' : ''}`}
            >
              <span className="icon text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Quick Stats in Sidebar */}
        <div className="mt-8 px-4">
          <div className="p-4 rounded-lg bg-[var(--neutral-800)] border border-[var(--neutral-700)]">
            <p className="text-xs text-[var(--neutral-400)] uppercase tracking-wider mb-2">
              Market Status
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-sm text-[var(--neutral-200)]">NSE Open</span>
            </div>
          </div>
        </div>

        {/* Version */}
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs text-[var(--neutral-600)] text-center">
            ShareTrack v1.0
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
