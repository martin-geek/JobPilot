import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CheckCircle, XCircle, ExternalLink, FileText,
  TrendingUp, Briefcase, Shield, Clock, AlertTriangle, Star
} from 'lucide-react'
import { api } from '../utils/api'

function ScoreRing({ score, size = 48 }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#f59e0b' : score >= 50 ? '#3b82f6' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  )
}

function QueueCard({ job, onApply, onSkip }) {
  const isPendingAssessment = Boolean(job.pending_assessment)
  const keyMatches = Array.isArray(job.key_matches) ? job.key_matches : []
  const gaps = Array.isArray(job.gaps) ? job.gaps : []
  const riskFlags = Array.isArray(job.risk_flags) ? job.risk_flags : []

  return (
    <div className="card-hover p-6 animate-slide-up">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isPendingAssessment ? (
              <span className="badge badge-info">Assessment Pending</span>
            ) : (
              <span className={`badge ${job.triage_category === 'strong_fit' ? 'badge-success' : 'badge-warning'}`}>
                {job.triage_category === 'strong_fit' ? 'Strong Fit' : 'Stretch'}
              </span>
            )}
            {job.salary_estimate && (
              <span className="badge badge-info">${Math.round(job.salary_estimate / 1000)}K est.</span>
            )}
          </div>
          <Link to={`/jobs/${job.id}`} className="group">
            <h3 className="text-lg font-semibold text-white group-hover:text-accent-400 transition-colors truncate">
              {job.title}
            </h3>
          </Link>
          <p className="text-surface-200/60 text-sm mt-0.5">
            {job.company_name} · {job.location || 'Location not specified'}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {isPendingAssessment ? (
            <div className="text-xs text-surface-200/50 text-right">
              <Clock className="w-4 h-4 inline-block mr-1" />
              Scoring soon
            </div>
          ) : (
            <>
              <ScoreRing score={job.fit_score} />
              <ScoreRing score={job.career_score} />
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-surface-200/70 mb-4 leading-relaxed">
        {isPendingAssessment
          ? 'This role was added manually and is waiting for AI assessment. It will be scored and triaged automatically.'
          : job.rationale}
      </p>

      {!isPendingAssessment && <div className="grid grid-cols-2 gap-4 mb-4">
        {keyMatches.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-success/70 mb-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Matches
            </h4>
            <ul className="space-y-1">
              {keyMatches.slice(0, 3).map((m, i) => <li key={i} className="text-xs text-surface-200/60">{m}</li>)}
            </ul>
          </div>
        )}
        {gaps.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-warning/70 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Gaps
            </h4>
            <ul className="space-y-1">
              {gaps.slice(0, 3).map((g, i) => <li key={i} className="text-xs text-surface-200/60">{g}</li>)}
            </ul>
          </div>
        )}
      </div>}

      {!isPendingAssessment && riskFlags.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-warning/5 border border-warning/10">
          <p className="text-xs text-warning/80">⚠️ {riskFlags.join(' · ')}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex gap-2">
          {job.assets?.filter(a => a.asset_type === 'resume').map(a => (
            <a key={a.id} href={a.file_path} className="btn-ghost text-xs py-1.5 px-3">
              <FileText className="w-3.5 h-3.5" /> Resume
            </a>
          ))}
          {job.assets?.filter(a => a.asset_type === 'cover_letter').map(a => (
            <a key={a.id} href={a.file_path} className="btn-ghost text-xs py-1.5 px-3">
              <FileText className="w-3.5 h-3.5" /> Cover Letter
            </a>
          ))}
          <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs py-1.5 px-3">
            <ExternalLink className="w-3.5 h-3.5" /> Apply Portal
          </a>
        </div>
        <div className="flex gap-2">
          {isPendingAssessment ? (
            <Link to={`/jobs/${job.id}`} className="btn-ghost text-xs py-1.5 px-3">
              <Clock className="w-3.5 h-3.5" /> View Role
            </Link>
          ) : (
            <>
              <button onClick={() => onSkip(job.id)} className="btn-ghost text-xs py-1.5 px-3">
                <XCircle className="w-3.5 h-3.5" /> Skip
              </button>
              <button onClick={() => onApply(job.id)} className="btn-success text-xs py-1.5 px-3">
                <CheckCircle className="w-3.5 h-3.5" /> Mark Applied
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatsBar({ stats }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-5 gap-4 mb-8">
      {[
        { label: 'Queue', value: stats.today_queue_count, icon: Clock, color: 'text-accent-400' },
        { label: 'Applied', value: stats.total_applied, icon: Briefcase, color: 'text-info' },
        { label: 'Interviewing', value: stats.total_interviewing, icon: TrendingUp, color: 'text-warning' },
        { label: 'Offers', value: stats.total_offers, icon: Star, color: 'text-success' },
        { label: 'Response Rate', value: `${stats.response_rate}%`, icon: Shield, color: 'text-accent-400' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <Icon className={`w-4 h-4 ${color} opacity-60`} />
            <span className="text-2xl font-display font-bold text-white">{value}</span>
          </div>
          <p className="text-xs text-surface-200/50 uppercase tracking-wider">{label}</p>
        </div>
      ))}
    </div>
  )
}

function parseCron(cron) {
  // Simple cron display — "0 4 * * *" → "Daily at 4:00 AM"
  if (!cron) return 'Not scheduled'
  const parts = cron.split(' ')
  if (parts.length >= 5) {
    const min = parts[0].padStart(2, '0')
    const hour = parseInt(parts[1])
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    return `Daily at ${h}:${min} ${ampm}`
  }
  return cron
}

export default function QueuePage() {
  const queryClient = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: api.dashboard.stats })
  const { data: queue, isLoading } = useQuery({ queryKey: ['dashboard-queue'], queryFn: api.dashboard.queue })
  const { data: pipelineStatus } = useQuery({ queryKey: ['pipeline-status'], queryFn: api.pipeline.status })

  const markApplied = useMutation({
    mutationFn: (jobId) => api.jobs.updateStatus(jobId, 'applied'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-queue'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const skipJob = useMutation({
    mutationFn: (jobId) => api.jobs.updateStatus(jobId, 'closed', 'Skipped from queue'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-queue'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const lastRun = pipelineStatus?.last_completed_run?.completed_at
  const schedule = pipelineStatus?.schedule_cron

  return (
    <div className="max-w-5xl">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Good morning, Martin</h1>
          <p className="text-surface-200/50 mt-1">{queue?.length || 0} roles ready for your review</p>
        </div>
        <div className="text-right">
          {lastRun && (
            <p className="text-xs text-surface-200/40">
              Last pipeline: <span className="text-surface-200/60">{new Date(lastRun).toLocaleString()}</span>
            </p>
          )}
          {schedule && (
            <p className="text-xs text-surface-200/30">
              Next run: <span className="text-surface-200/50">{parseCron(schedule)}</span>
            </p>
          )}
        </div>
      </div>

      <StatsBar stats={stats} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : queue?.length === 0 ? (
        <div className="card p-12 text-center">
          <Briefcase className="w-12 h-12 text-surface-200/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-surface-200/60">Queue is empty</h3>
          <p className="text-sm text-surface-200/40 mt-1">
            Run the pipeline to discover new roles, or <Link to="/import" className="text-accent-400 hover:underline">add a role manually</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map(job => (
            <QueueCard key={job.id} job={job}
              onApply={(id) => markApplied.mutate(id)}
              onSkip={(id) => skipJob.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
