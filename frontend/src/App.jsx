import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Kanban, DollarSign, MapPin, Brain,
  Building2, ScrollText, Settings, Rocket, RefreshCw,
  Archive, Ban, Plus, Square,
} from 'lucide-react'
import { api } from './utils/api'

import QueuePage from './pages/QueuePage'
import PipelinePage from './pages/PipelinePage'
import SalaryPage from './pages/SalaryPage'
import MapPage from './pages/MapPage'
import MarketPage from './pages/MarketPage'
import CompaniesPage from './pages/CompaniesPage'
import ActivityPage from './pages/ActivityPage'
import SettingsPage from './pages/SettingsPage'
import JobDetailPage from './pages/JobDetailPage'
import ArchivedPage from './pages/ArchivedPage'
import UnavailablePage from './pages/UnavailablePage'
import ManualImportPage from './pages/ManualImportPage'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Queue' },
  { path: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { path: '/import', icon: Plus, label: 'Add Role' },
  { path: '/salary', icon: DollarSign, label: 'Salary' },
  { path: '/map', icon: MapPin, label: 'Map' },
  { path: '/market', icon: Brain, label: 'Market Intel' },
  { path: '/companies', icon: Building2, label: 'Companies' },
  { path: '/activity', icon: ScrollText, label: 'Activity' },
  { path: '/archived', icon: Archive, label: 'Archived' },
  { path: '/unavailable', icon: Ban, label: 'Unavailable' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

const STAGE_LABELS = {
  discovery: 'Discovering roles',
  dedup: 'Removing duplicates',
  assessment: 'Scoring & triaging',
  tailoring: 'Generating documents',
}

function PipelineProgress({ status }) {
  if (!status?.is_running && !status?.stages_completed?.length) return null

  const stages = status.all_stages || ['discovery', 'dedup', 'assessment', 'tailoring']
  const completed = status.stages_completed || []
  const current = status.current_stage

  return (
    <div className="px-4 pb-3">
      <div className="rounded-xl bg-surface-900/80 border border-white/5 p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" />
          <span className="text-[10px] text-accent-400 uppercase tracking-wider font-medium">Pipeline Active</span>
        </div>

        <div className="space-y-2">
          {stages.map((stage, i) => {
            const isDone = completed.includes(stage)
            const isCurrent = stage === current
            const isPending = !isDone && !isCurrent

            return (
              <div key={stage} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  isDone ? 'bg-success/20 text-success' :
                  isCurrent ? 'bg-accent/20 text-accent-400 ring-2 ring-accent/30' :
                  'bg-white/5 text-surface-200/30'
                }`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] truncate ${
                    isDone ? 'text-success/70' :
                    isCurrent ? 'text-accent-400' :
                    'text-surface-200/30'
                  }`}>
                    {STAGE_LABELS[stage] || stage}
                  </p>
                  {isCurrent && status.stage_progress && (
                    <p className="text-[10px] text-accent-400/60 truncate">{status.stage_progress}</p>
                  )}
                  {isDone && status.stage_progress && stage === completed[completed.length - 1] && (
                    <p className="text-[10px] text-success/50 truncate">{status.stage_progress}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {status.error && !status.error.includes('Stop requested') && (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-danger/10 border border-danger/20">
            <p className="text-[10px] text-danger/80 truncate">Error: {status.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Sidebar() {
  const location = useLocation()
  const queryClient = useQueryClient()

  const { data: pipelineStatus } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.pipeline.status,
    refetchInterval: (data) => data?.is_running ? 2000 : 30000,
  })

  const isRunning = pipelineStatus?.is_running

  // Refresh data when pipeline finishes
  useEffect(() => {
    if (pipelineStatus && !pipelineStatus.is_running && pipelineStatus.stages_completed?.length > 0) {
      const timer = setTimeout(() => queryClient.invalidateQueries(), 1000)
      return () => clearTimeout(timer)
    }
  }, [pipelineStatus?.is_running])

  const handleRunPipeline = async () => {
    try {
      await api.pipeline.run()
    } catch (e) {
      console.error('Pipeline trigger failed:', e)
    }
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-900/40 backdrop-blur-xl border-r border-white/5 flex flex-col z-50">
      <div className="px-6 py-5 border-b border-white/5">
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

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
          return (
            <NavLink key={path} to={path}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive ? 'bg-accent/10 text-accent-400 border border-accent/15'
                  : 'text-surface-200/60 hover:text-surface-100 hover:bg-white/5 border border-transparent'
              }`}>
              <Icon className="flex-shrink-0" style={{ width: 17, height: 17 }} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* Pipeline progress panel */}
      {isRunning && <PipelineProgress status={pipelineStatus} />}

      {/* Run button */}
      <div className="px-4 py-3 border-t border-white/5">
        {pipelineStatus?.last_completed_run?.completed_at && !isRunning && (
          <p className="text-[10px] text-surface-200/30 text-center mb-2">
            Last run: {new Date(pipelineStatus.last_completed_run.completed_at).toLocaleString()}
          </p>
        )}
        <button
          onClick={handleRunPipeline}
          disabled={isRunning}
          className={`w-full text-sm inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
            isRunning
              ? 'bg-accent/20 text-accent-400/70 cursor-wait'
              : 'bg-accent hover:bg-accent-600 text-white shadow-lg shadow-accent/25 cursor-pointer'
          }`}>
          <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running...' : 'Run Pipeline'}
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
          <Route path="/import" element={<ManualImportPage />} />
          <Route path="/salary" element={<SalaryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/archived" element={<ArchivedPage />} />
          <Route path="/unavailable" element={<UnavailablePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
