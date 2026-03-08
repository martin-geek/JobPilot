import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, FileText, CheckCircle, XCircle,
  AlertTriangle, Clock, Building2
} from 'lucide-react'
import { api } from '../utils/api'

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.jobs.get(id),
  })

  const updateStatus = useMutation({
    mutationFn: ({ status, notes }) => api.jobs.updateStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-queue'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-20 text-surface-200/50">Job not found</div>
  }

  const assessment = job.assessment
  const assets = job.assets || []

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate(-1)}
        className="btn-ghost text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {assessment && (
                <span className={`badge ${
                  assessment.triage_category === 'strong_fit' ? 'badge-success' :
                  assessment.triage_category === 'stretch' ? 'badge-warning' :
                  assessment.triage_category === 'discard' ? 'badge-danger' : 'badge-info'
                }`}>
                  {assessment.triage_category?.replace('_', ' ')}
                </span>
              )}
              <span className="badge badge-accent">{job.status}</span>
              {job.source && <span className="text-xs text-surface-200/40">{job.source}</span>}
            </div>
            <h1 className="text-2xl font-display font-bold text-white">{job.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-surface-200/60">
              <span className="flex items-center gap-1">
                <Building2 className="w-4 h-4" /> {job.company_name}
              </span>
              {job.location && <span>📍 {job.location}</span>}
              {job.location_type && <span className="text-xs">({job.location_type})</span>}
            </div>
          </div>
          <a href={job.source_url} target="_blank" rel="noopener noreferrer"
            className="btn-primary text-sm">
            <ExternalLink className="w-4 h-4" /> Open Posting
          </a>
        </div>

        {/* Salary info */}
        {(job.salary_min || assessment?.salary_estimate) && (
          <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
            <span className="text-sm text-surface-200/60">Compensation:</span>
            {job.salary_min && job.salary_max ? (
              <span className="text-sm font-mono text-white">
                {job.salary_currency || '$'}{job.salary_min.toLocaleString()} – {job.salary_max.toLocaleString()}
              </span>
            ) : assessment?.salary_estimate ? (
              <span className="text-sm font-mono text-surface-200/60">
                ~${Math.round(assessment.salary_estimate).toLocaleString()} (estimated, {assessment.salary_confidence} confidence)
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Assessment */}
      {assessment && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-display font-semibold text-white mb-4">Assessment</h2>

          {/* Scores */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Fit', score: assessment.fit_score },
              { label: 'Career', score: assessment.career_score },
              { label: 'Compensation', score: assessment.compensation_score },
              { label: 'Culture', score: assessment.culture_score },
              { label: 'Confidence', score: assessment.confidence },
            ].filter(s => s.score != null).map(({ label, score }) => (
              <div key={label} className="text-center">
                <div className={`text-2xl font-display font-bold ${
                  score >= 80 ? 'text-success' :
                  score >= 65 ? 'text-warning' :
                  score >= 50 ? 'text-info' : 'text-danger'
                }`}>
                  {Math.round(score)}
                </div>
                <p className="text-[10px] text-surface-200/40 uppercase tracking-wider mt-1">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-surface-200/70 mb-4">{assessment.rationale}</p>

          <div className="grid grid-cols-2 gap-6">
            {assessment.key_matches?.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-success/70 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Key Matches
                </h4>
                <ul className="space-y-1">
                  {assessment.key_matches.map((m, i) => (
                    <li key={i} className="text-sm text-surface-200/60">• {m}</li>
                  ))}
                </ul>
              </div>
            )}
            {assessment.gaps?.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-warning/70 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Gaps
                </h4>
                <ul className="space-y-1">
                  {assessment.gaps.map((g, i) => (
                    <li key={i} className="text-sm text-surface-200/60">• {g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {assessment.risk_flags?.length > 0 && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-warning/5 border border-warning/10">
              <h4 className="text-xs uppercase tracking-wider text-warning/70 mb-1">Risk Flags</h4>
              {assessment.risk_flags.map((r, i) => (
                <p key={i} className="text-sm text-warning/60">⚠️ {r}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assets */}
      {assets.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-display font-semibold text-white mb-4">Application Materials</h2>
          <div className="flex gap-3">
            {assets.map(asset => (
              <a key={asset.id} href={asset.file_path}
                className="card-hover p-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-accent-400" />
                <div>
                  <p className="text-sm text-white capitalize">{asset.asset_type.replace('_', ' ')}</p>
                  <p className="text-xs text-surface-200/40">{asset.file_format} · v{asset.version}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {job.description && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-display font-semibold text-white mb-4">Job Description</h2>
          <div className="text-sm text-surface-200/60 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
            {job.description}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card p-6 flex items-center gap-3">
        <button onClick={() => updateStatus.mutate({ status: 'applied' })}
          className="btn-success">
          <CheckCircle className="w-4 h-4" /> Mark Applied
        </button>
        <button onClick={() => updateStatus.mutate({ status: 'screening' })}
          className="btn-primary">
          <Clock className="w-4 h-4" /> Move to Screening
        </button>
        <button onClick={() => updateStatus.mutate({ status: 'closed', notes: 'Manually closed' })}
          className="btn-danger">
          <XCircle className="w-4 h-4" /> Close
        </button>
      </div>
    </div>
  )
}
