import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Utensils, Heart, BookOpen, Settings } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ─── Bottom navigation ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/feed',      icon: Utensils,        label: 'Feed'      },
  { to: '/health',    icon: Heart,           label: 'Health'    },
  { to: '/library',   icon: BookOpen,        label: 'Library'   },
]

function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white shadow-nav pb-safe-bottom">
      <div className="flex h-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => [
              'flex-1 flex flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors',
              isActive ? 'text-forest-500' : 'text-stone-400',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ title }: { title?: string }) {
  const navigate = useNavigate()
  const location = useLocation()

  const pageTitle = title ?? NAV_ITEMS.find(n => location.pathname.startsWith(n.to))?.label ?? 'Pet Tracker'

  return (
    <header className="sticky top-0 z-30 bg-stone-100/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-semibold text-forest-900">{pageTitle}</h1>
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-xl hover:bg-stone-200 text-stone-400 transition-colors"
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  )
}

// ─── App shell ────────────────────────────────────────────────────────────────

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-stone-100">
      <TopBar title={title} />
      <main className="pb-[calc(4rem+env(safe-area-inset-bottom))] max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
