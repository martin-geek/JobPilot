import { useQuery } from '@tanstack/react-query'
import { api } from '../utils/api'

const STAGE_CONFIG = {
  discovered: { label: 'Discovered', color: 'surface-200/50' },
  assessed: { label: 'Assessed', color: 'info' },
  queued: { label: 'Ready to Apply', color: 'accent' },
  applied: { label: 'Applied', color: 'info' },
  screening: { label: 'Screening', color: 'warning' },
  phone_screen: { label: 'Phone Screen', color: 'warning' },
  interview_1: { label: 'Interview 1', color: 'warning' },
  interview_2: { label: 'Interview 2', color: 'warning' },
  interview_final: { label: 'Final Interview', color: 'warning' },
  offer: { label: 'Offer', color: 'success' },
  accepted: { label: 'Accepted', color: 'success' },
  rejected: { label: 'Rejected', color: 'danger' },
  withdrawn: { label: 'Withdrawn', color: 'surface-200/50' },
  closed: { label: 'Closed', color: 'surface-200/30' },
}

export default function PipelinePage() {
  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: api.dashboard.pipeline,
  })

  const { data: jobsData } = useQuery({
    queryKey: ['all-jobs'],
    queryFn: () => api.jobs.list({ limit: 200 }),
  })

  const jobs = jobsData?.jobs || []

  // Group into pipeline columns (simplified — key stages only)
  const columns = [
    { key: 'queued', stages: ['queued'] },
    { key: 'applied', stages: ['applied'] },
    { key: 'interviewing', stages: ['screening', 'phone_screen', 'interview_1', 'interview_2', 'interview_final'] },
    { key: 'outcome', stages: ['offer', 'accepted', 'rejected', 'withdrawn', 'closed'] },
  ]

  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Pipeline
      </h1>
      <p className="text-surface-200/50 mb-8">
        All roles across the application lifecycle
      </p>

      {/* Stage summary bar */}
      {stages && (
        <div className="flex gap-2 mb-8 flex-wrap">
          {stages.map(({ stage, count }) => {
            const cfg = STAGE_CONFIG[stage] || { label: stage, color: 'surface-200/50' }
            return (
              <div key={stage} className="card px-3 py-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full bg-${cfg.color}`} />
                <span className="text-xs text-surface-200/60">{cfg.label}</span>
                <span className="text-sm font-bold text-white">{count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-4 gap-4">
        {columns.map(col => {
          const colJobs = jobs.filter(j => col.stages.includes(j.status))
          const colLabel = col.key === 'queued' ? 'Ready to Apply' :
            col.key === 'interviewing' ? 'Interviewing' :
            col.key === 'outcome' ? 'Outcomes' :
            'Applied'

          return (
            <div key={col.key}>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-medium text-surface-200/70">{colLabel}</h3>
                <span className="text-xs text-surface-200/40 bg-white/5 px-2 py-0.5 rounded-full">
                  {colJobs.length}
                </span>
              </div>
              <div className="space-y-2">
                {colJobs.slice(0, 20).map(job => (
                  <a key={job.id} href={`/jobs/${job.id}`}
                    className="card-hover block p-3 cursor-pointer">
                    <p className="text-sm font-medium text-white truncate">{job.title}</p>
                    <p className="text-xs text-surface-200/50 truncate mt-0.5">
                      {job.company_name}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {job.fit_score != null && (
                        <span className={`text-xs font-mono ${
                          job.fit_score >= 80 ? 'text-success' :
                          job.fit_score >= 65 ? 'text-warning' : 'text-surface-200/40'
                        }`}>
                          {Math.round(job.fit_score)}%
                        </span>
                      )}
                      <span className={`badge text-[10px] ${
                        STAGE_CONFIG[job.status]?.color === 'success' ? 'badge-success' :
                        STAGE_CONFIG[job.status]?.color === 'warning' ? 'badge-warning' :
                        STAGE_CONFIG[job.status]?.color === 'danger' ? 'badge-danger' :
                        'badge-info'
                      }`}>
                        {STAGE_CONFIG[job.status]?.label || job.status}
                      </span>
                    </div>
                  </a>
                ))}
                {colJobs.length === 0 && (
                  <div className="card p-4 text-center">
                    <p className="text-xs text-surface-200/30">No roles</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
