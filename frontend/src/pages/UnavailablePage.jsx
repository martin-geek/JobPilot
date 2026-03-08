import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, RotateCcw, MessageSquare, Calendar } from 'lucide-react'
import { api } from '../utils/api'

export default function UnavailablePage() {
  const queryClient = useQueryClient()

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['unavailable-jobs'],
    queryFn: api.jobs.unavailable,
  })

  const restore = useMutation({
    mutationFn: (id) => api.jobs.unarchive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unavailable-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['all-jobs'] })
    },
  })

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Unavailable Roles</h1>
      <p className="text-surface-200/50 mb-8">
        Roles that were no longer available when you tried to apply. Restore to move back to queue if they reappear.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Ban className="w-12 h-12 text-surface-200/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-surface-200/60">No unavailable roles</h3>
          <p className="text-sm text-surface-200/40 mt-1">
            Mark roles as unavailable from the Pipeline or Job Detail view when they're no longer posted.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => (
            <div key={job.id} className="card-hover p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Link to={`/jobs/${job.id}`} className="text-sm font-medium text-white hover:text-accent-400 transition-colors">
                  {job.title}
                </Link>
                <p className="text-xs text-surface-200/50 mt-0.5">{job.company_name}</p>
                {job.notes && (
                  <p className="text-xs text-surface-200/40 mt-1 flex items-start gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {job.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-surface-200/30 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {(job.marked_at || job.updated_at || '').split('T')[0]}
                </span>
                <button onClick={() => restore.mutate(job.id)} className="btn-ghost text-xs py-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
