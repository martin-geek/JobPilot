import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, ExternalLink, FileText, CheckCircle, XCircle,
  AlertTriangle, Clock, Building2, ChevronDown, ChevronUp,
  MessageSquare, Archive, Ban, Calendar, Tag
} from 'lucide-react'
import { api } from '../utils/api'

function ScoreStoplight({ score, label, size = 'lg' }) {
  const color = score >= 80 ? 'bg-green-500' :
    score >= 65 ? 'bg-yellow-400' :
    score >= 50 ? 'bg-orange-500' : 'bg-red-500'
  const textColor = score >= 80 ? 'text-green-400' :
    score >= 65 ? 'text-yellow-400' :
    score >= 50 ? 'text-orange-400' : 'text-red-400'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`${size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'} rounded-2xl ${color}/10 flex items-center justify-center`}>
        <span className={`${size === 'lg' ? 'text-2xl' : 'text-lg'} font-display font-bold ${textColor}`}>
          {Math.round(score)}
        </span>
      </div>
      <span className="text-[10px] text-surface-200/50 uppercase tracking-wider font-medium">{label}</span>
    </div>
  )
}

function ExpandableSection({ title, icon: Icon, iconColor, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors">
        <h2 className="text-base font-display font-semibold text-white flex items-center gap-2">
          {Icon && <Icon className={`${iconColor || 'text-accent-400'}`} style={{ width: 18, height: 18 }} />}
          {title}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-surface-200/40" /> : <ChevronDown className="w-4 h-4 text-surface-200/40" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-white/5 pt-4">{children}</div>}
    </div>
  )
}

function NoteDialog({ isOpen, onClose, onSave, title }) {
  const [note, setNote] = useState('')
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div className="card p-6 w-full max-w-md mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-display font-semibold text-white mb-1">{title}</h3>
        <textarea className="input-field w-full h-28 resize-none mb-4" placeholder="Add a note (optional)..."
          value={note} onChange={e => setNote(e.target.value)} autoFocus />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => { onSave(note); setNote(''); }} className="btn-primary text-sm">Confirm</button>
        </div>
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [archiveDialog, setArchiveDialog] = useState(false)
  const [unavailableDialog, setUnavailableDialog] = useState(false)
  const [noteDialog, setNoteDialog] = useState(false)

  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => api.jobs.get(id) })

  const updateStatus = useMutation({
    mutationFn: ({ status, notes }) => api.jobs.updateStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['all-jobs'] })
    },
  })

  const addNote = useMutation({
    mutationFn: (notes) => api.jobs.addNote(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', id] }),
  })

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>
  if (!job) return <div className="text-center py-20 text-surface-200/50">Job not found</div>

  const a = job.assessment
  const assets = job.assets || []

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-6"><ArrowLeft className="w-4 h-4" /> Back</button>

      {/* Header */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`badge ${job.status === 'rejected' ? 'badge-danger' : job.status === 'queued' ? 'badge-accent' : ['offer','accepted'].includes(job.status) ? 'badge-success' : 'badge-info'}`}>
                {job.status.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-surface-200/30">{job.source}</span>
              {job.posted_date && <span className="text-xs text-surface-200/30 flex items-center gap-1"><Calendar className="w-3 h-3" />Posted: {job.posted_date}</span>}
              <span className="text-xs text-surface-200/30 flex items-center gap-1"><Clock className="w-3 h-3" />Added: {(job.discovered_at || job.created_at || '').split('T')[0]}</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-white mb-2">{job.title}</h1>
            <div className="flex items-center gap-3 text-surface-200/60 text-sm">
              <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{job.company_name}</span>
              {job.location && <span>📍 {job.location}</span>}
            </div>
          </div>
          <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            <ExternalLink className="w-4 h-4" /> Open Posting
          </a>
        </div>

        {a && (
          <div className="flex items-center gap-6 pt-4 border-t border-white/5">
            <ScoreStoplight score={a.fit_score} label="Fit" />
            <ScoreStoplight score={a.career_score} label="Career" />
            {a.compensation_score != null && <ScoreStoplight score={a.compensation_score} label="Comp" />}
            {a.culture_score != null && <ScoreStoplight score={a.culture_score} label="Culture" />}
            <ScoreStoplight score={a.confidence} label="Confidence" />
            <div className="ml-auto text-right">
              {(job.salary_min || a.salary_estimate) && (
                <div>
                  <p className="text-xs text-surface-200/40 mb-0.5">Compensation</p>
                  <p className="text-sm font-mono text-white">
                    {job.salary_min ? `$${job.salary_min.toLocaleString()} – $${job.salary_max?.toLocaleString()}` :
                      `~$${Math.round(a.salary_estimate).toLocaleString()} est.`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions bar */}
      <div className="card p-4 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-surface-200/50 uppercase tracking-wider">Status:</span>
        <select value={job.status} onChange={e => updateStatus.mutate({ status: e.target.value })}
          className="input-field text-sm py-1.5 pr-8">
          {[{v:'queued',l:'Ready to Apply'},{v:'applied',l:'Applied'},{v:'screening',l:'Screening'},{v:'phone_screen',l:'Phone Screen'},
            {v:'interview_1',l:'Interview 1'},{v:'interview_2',l:'Interview 2'},{v:'interview_final',l:'Final Interview'},
            {v:'offer',l:'Offer'},{v:'accepted',l:'Accepted'},{v:'rejected',l:'Rejected'}].map(s =>
            <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setNoteDialog(true)} className="btn-ghost text-xs py-1.5"><MessageSquare className="w-3.5 h-3.5" /> Add Note</button>
          <button onClick={() => setUnavailableDialog(true)} className="btn-ghost text-xs py-1.5 text-warning/70"><Ban className="w-3.5 h-3.5" /> Unavailable</button>
          <button onClick={() => setArchiveDialog(true)} className="btn-ghost text-xs py-1.5 text-danger/70"><Archive className="w-3.5 h-3.5" /> Archive</button>
        </div>
      </div>

      {/* Notes */}
      {job.application?.notes && (
        <div className="card p-4 mb-4 bg-accent/5 border-accent/10">
          <p className="text-xs text-accent-400/70 uppercase tracking-wider mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Notes</p>
          <p className="text-sm text-surface-200/70 whitespace-pre-wrap">{job.application.notes}</p>
        </div>
      )}

      {/* Assets */}
      {assets.length > 0 && (
        <div className="flex gap-3 mb-4">
          {assets.map(asset => (
            <a key={asset.id} href={asset.file_path} className="card-hover p-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-400" />
              <span className="text-sm text-white capitalize">{asset.asset_type.replace('_', ' ')}</span>
            </a>
          ))}
        </div>
      )}

      {/* Expandable sections */}
      <div className="space-y-3">
        {a && (a.key_matches?.length > 0 || a.gaps?.length > 0) && (
          <ExpandableSection title="Skills Match" icon={Tag} iconColor="text-success" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-6">
              {a.key_matches?.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-success/70 mb-3 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Matches ({a.key_matches.length})</h4>
                  {a.key_matches.map((m, i) => <div key={i} className="flex items-start gap-2 text-sm text-surface-200/70 mb-1"><span className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0" />{m}</div>)}
                </div>
              )}
              {a.gaps?.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-warning/70 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Gaps ({a.gaps.length})</h4>
                  {a.gaps.map((g, i) => <div key={i} className="flex items-start gap-2 text-sm text-surface-200/70 mb-1"><span className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 flex-shrink-0" />{g}</div>)}
                </div>
              )}
            </div>
            {a.risk_flags?.length > 0 && (
              <div className="mt-4 px-4 py-3 rounded-xl bg-warning/5 border border-warning/10">
                {a.risk_flags.map((r, i) => <p key={i} className="text-sm text-warning/60">⚠️ {r}</p>)}
              </div>
            )}
          </ExpandableSection>
        )}

        {a && (
          <ExpandableSection title="AI Assessment" icon={CheckCircle} iconColor="text-accent-400">
            <p className="text-sm text-surface-200/70 leading-relaxed mb-4">{a.rationale}</p>
            <div className="text-xs text-surface-200/40 space-y-1">
              <p>Triage: <span className="text-surface-200/60">{a.triage_category}</span> · Recommended: <span className="text-surface-200/60">{a.recommended_action}</span></p>
            </div>
          </ExpandableSection>
        )}

        <ExpandableSection title="Job Description" icon={FileText} iconColor="text-info">
          {job.description ? (
            <div className="text-sm text-surface-200/60 leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">{job.description}</div>
          ) : (
            <p className="text-sm text-surface-200/30 italic">No description available. Click "Open Posting" to view.</p>
          )}
        </ExpandableSection>
      </div>

      {/* Dialogs */}
      <NoteDialog isOpen={archiveDialog} title="Archive this role" onClose={() => setArchiveDialog(false)}
        onSave={note => { updateStatus.mutate({ status: 'archived', notes: note || 'Archived' }); setArchiveDialog(false); navigate(-1) }} />
      <NoteDialog isOpen={unavailableDialog} title="Mark as unavailable" onClose={() => setUnavailableDialog(false)}
        onSave={note => { updateStatus.mutate({ status: 'unavailable', notes: note || 'No longer available' }); setUnavailableDialog(false); navigate(-1) }} />
      <NoteDialog isOpen={noteDialog} title="Add a note" onClose={() => setNoteDialog(false)}
        onSave={note => { if (note.trim()) addNote.mutate(note); setNoteDialog(false) }} />
    </div>
  )
}
