import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Kanban, DollarSign, MapPin, Brain,
  Building2, ScrollText, Settings, Rocket, RefreshCw,
} from 'lucide-react'
import { api } from './utils/api'

// Pages
import QueuePage from './pages/QueuePage'
import PipelinePage from './pages/PipelinePage'
import SalaryPage from './pages/SalaryPage'
import MapPage from './pages/MapPage'
import MarketPage from './pages/MarketPage'
import CompaniesPage from './pages/CompaniesPage'
import ActivityPage from './pages/ActivityPage'
import SettingsPage from './pages/SettingsPage'
import JobDetailPage from './pages/JobDetailPage'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Queue' },
  { path: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { path: '/salary', icon: DollarSign, label: 'Salary' },
  { path: '/map', icon: MapPin, label: 'Map' },
  { path: '/market', icon: Brain, label: 'Market Intel' },
  { path: '/companies', icon: Building2, label: 'Companies' },
  { path: '/activity', icon: ScrollText, label: 'Activity' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

function Sidebar() {
  const location = useLocation()

  const { mutate: runPipeline, isPending } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.pipeline.status,
    refetchInterval: 10_000,
  })

  const handleRunPipeline = async () => {
    try {
      await api.pipeline.run()
    } catch (e) {
      console.error('Pipeline trigger failed:', e)
    }
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-900/40 backdrop-blur-xl border-r border-white/5 flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-white tracking-tight">JobPilot</h1>
            <p className="text-[10px] text-surface-200/50 uppercase tracking-widest">Career Intelligence</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path))
          return (
            <NavLink
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-accent/10 text-accent-400 border border-accent/15'
                  : 'text-surface-200/60 hover:text-surface-100 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18 }} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* Pipeline trigger */}
      <div className="px-4 py-4 border-t border-white/5">
        <button
          onClick={handleRunPipeline}
          className="btn-primary w-full text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          Run Pipeline
        </button>
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route path="/" element={<QueuePage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/salary" element={<SalaryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
