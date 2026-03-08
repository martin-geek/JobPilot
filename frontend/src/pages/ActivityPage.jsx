import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ScrollText, Search, Zap, FileText, Eye, Settings, AlertCircle } from 'lucide-react'
import { api } from '../utils/api'

const EVENT_CONFIG = {
  job_discovered: { icon: Search, color: 'info', label: 'Discovered' },
  job_assessed: { icon: Zap, color: 'accent', label: 'Assessed' },
  job_queued: { icon: Eye, color: 'success', label: 'Queued' },
  job_discarded: { icon: AlertCircle, color: 'danger', label: 'Discarded' },
  status_changed: { icon: Zap, color: 'warning', label: 'Status Changed' },
  asset_generated: { icon: FileText, color: 'success', label: 'Asset Generated' },
  manual_override: { icon: Settings, color: 'warning', label: 'Override' },
  config_changed: { icon: Settings, color: 'accent', label: 'Config Changed' },
  agent_started: { icon: Zap, color: 'info', label: 'Agent Started' },
  agent_completed: { icon: Zap, color: 'success', label: 'Agent Completed' },
  agent_failed: { icon: AlertCircle, color: 'danger', label: 'Agent Failed' },
}

export default function ActivityPage() {
  const { data: activity, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.dashboard.activity(100),
  })

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Activity Log
      </h1>
      <p className="text-surface-200/50 mb-8">
        Full audit trail of every decision and action in the system.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-1">
          {activity?.map((entry) => {
            const config = EVENT_CONFIG[entry.event_type] || {
              icon: ScrollText, color: 'surface-200/40', label: entry.event_type
            }
            const Icon = config.icon
            const timeAgo = entry.timestamp
              ? formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })
              : ''

            return (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.02] transition-colors">
                <div className={`w-7 h-7 rounded-lg bg-${config.color}/10 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon className={`w-3.5 h-3.5 text-${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium text-${config.color}`}>{config.label}</span>
                    {entry.job_title && (
                      <a href={`/jobs/${entry.job_id}`} className="text-sm text-white hover:text-accent-400 transition-colors truncate">
                        {entry.job_title}
                      </a>
                    )}
                    {entry.company_name && (
                      <span className="text-xs text-surface-200/40">@ {entry.company_name}</span>
                    )}
                  </div>
                  {entry.details && (
                    <p className="text-xs text-surface-200/50 mt-0.5">{entry.details}</p>
                  )}
                  {entry.old_value && entry.new_value && (
                    <p className="text-xs text-surface-200/40 mt-0.5">
                      {entry.old_value} → {entry.new_value}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-surface-200/30 flex-shrink-0">{timeAgo}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
