import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Archive, Ban, MessageSquare, ChevronDown, Calendar } from 'lucide-react'
import { api } from '../utils/api'

const COLUMNS = [
  { key: 'queued', label: 'Ready to Apply', statuses: ['queued'], color: 'accent' },
  { key: 'applied', label: 'Applied', statuses: ['applied'], color: 'info' },
  { key: 'interviewing', label: 'Interviewing', statuses: ['screening', 'phone_screen', 'interview_1', 'interview_2', 'interview_final'], color: 'warning' },
  { key: 'outcome', label: 'Outcomes', statuses: ['offer', 'accepted', 'rejected', 'withdrawn', 'closed'], color: 'success' },
]

const ALL_STATUSES = [
  { value: 'queued', label: 'Ready to Apply' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview_1', label: 'Interview 1' },
  { value: 'interview_2', label: 'Interview 2' },
  { value: 'interview_final', label: 'Final Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

function NoteDialog({ isOpen, onClose, onSave, title }) {
  const [note, setNote] = useState('')
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div className="card p-6 w-full max-w-md mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-display font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-surface-200/50 mb-4">Add an optional note.</p>
        <textarea
          className="input-field w-full h-28 resize-none mb-4"
          placeholder="Add a note..."
          value={note}
          onChange={e => setNote(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => { onSave(note); setNote(''); }} className="btn-primary text-sm">Confirm</button>
        </div>
      </div>
    </div>
  )
}

function CardMenu({ job, onArchive, onUnavailable, onAddNote }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-surface-200/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-50 card p-1 min-w-[160px] shadow-xl animate-fade-in">
            <button
              onClick={(e) => { e.preventDefault(); onAddNote(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200/70 hover:bg-white/5 rounded-lg transition-colors"
            >
              <MessageSquare className="w-3 h-3" /> Add Note
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onUnavailable(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-warning/70 hover:bg-warning/5 rounded-lg transition-colors"
            >
              <Ban className="w-3 h-3" /> Mark Unavailable
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onArchive(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger/70 hover:bg-danger/5 rounded-lg transition-colors"
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function PipelineCard({ job, onStatusChange, onArchive, onUnavailable, onAddNote, onDragStart }) {
  const fitColor = job.fit_score >= 80 ? 'text-green-400' :
    job.fit_score >= 65 ? 'text-yellow-400' :
    job.fit_score ? 'text-orange-400' : 'text-surface-200/30'

  const statusColor = job.status === 'rejected' ? 'badge-danger' :
    job.status === 'offer' || job.status === 'accepted' ? 'badge-success' :
    ['screening','phone_screen','interview_1','interview_2','interview_final'].includes(job.status) ? 'badge-warning' :
    job.status === 'queued' ? 'badge-accent' : 'badge-info'

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('jobId', String(job.id))
        e.dataTransfer.setData('currentStatus', job.status)
        onDragStart?.(job.id)
      }}
      className="card-hover p-3 cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-start justify-between mb-1.5">
        <Link to={`/jobs/${job.id}`} className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate group-hover:text-accent-400 transition-colors">
            {job.title}
          </p>
        </Link>
        <CardMenu
          job={job}
          onArchive={() => onArchive(job.id)}
          onUnavailable={() => onUnavailable(job.id)}
          onAddNote={() => onAddNote(job.id)}
        />
      </div>

      <p className="text-xs text-surface-200/50 truncate mb-2">{job.company_name}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.fit_score != null && (
            <span className={`text-xs font-mono font-bold ${fitColor}`}>
              {Math.round(job.fit_score)}%
            </span>
          )}
          <span className={`badge text-[10px] ${statusColor}`}>
            {job.status.replace(/_/g, ' ')}
          </span>
        </div>
        {(job.applied_date || job.discovered_at) && (
          <span className="text-[10px] text-surface-200/25 flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {job.applied_date || job.discovered_at?.split('T')[0]}
          </span>
        )}
      </div>

      {job.app_notes && (
        <p className="text-[10px] text-surface-200/30 mt-1.5 truncate">
          💬 {job.app_notes}
        </p>
      )}

      {/* Inline status selector */}
      <div className="mt-2 pt-2 border-t border-white/5">
        <select
          value={job.status}
          onChange={(e) => onStatusChange(job.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-surface-900/80 border border-white/5 rounded-lg text-[11px] text-surface-200/60 py-1 px-2 focus:outline-none focus:border-accent/30"
        >
          {ALL_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function PipelineColumn({ column, jobs, onStatusChange, onArchive, onUnavailable, onAddNote, onDrop }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const jobId = e.dataTransfer.getData('jobId')
        if (jobId) {
          const targetStatus = column.statuses[0]
          onDrop(parseInt(jobId), targetStatus)
        }
      }}
      className={`flex flex-col min-h-[400px] transition-colors duration-200 ${
        dragOver ? 'bg-accent/5 rounded-2xl' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-1 sticky top-0">
        <h3 className="text-sm font-medium text-surface-200/70">{column.label}</h3>
        <span className="text-xs text-surface-200/40 bg-white/5 px-2 py-0.5 rounded-full">
          {jobs.length}
        </span>
      </div>

      {dragOver && jobs.length === 0 && (
        <div className="border-2 border-dashed border-accent/20 rounded-xl p-4 mb-2 text-center">
          <p className="text-xs text-accent/40">Drop here</p>
        </div>
      )}

      <div className="space-y-2 flex-1">
        {jobs.map(job => (
          <PipelineCard
            key={job.id}
            job={job}
            onStatusChange={onStatusChange}
            onArchive={onArchive}
            onUnavailable={onUnavailable}
            onAddNote={onAddNote}
          />
        ))}
        {jobs.length === 0 && !dragOver && (
          <div className="card p-4 text-center">
            <p className="text-xs text-surface-200/20">No roles</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState({ type: null, jobId: null })

  const { data: jobsData } = useQuery({
    queryKey: ['all-jobs'],
    queryFn: () => api.jobs.list({ limit: 200 }),
  })

  const jobs = jobsData?.jobs || []

  const updateStatus = useMutation({
    mutationFn: ({ id, status, notes }) => api.jobs.updateStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] })
    },
  })

  const addNote = useMutation({
    mutationFn: ({ id, notes }) => api.jobs.addNote(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['all-jobs'] }),
  })

  const handleStatusChange = (jobId, status) => {
    updateStatus.mutate({ id: jobId, status })
  }

  const handleDrop = (jobId, targetStatus) => {
    updateStatus.mutate({ id: jobId, status: targetStatus })
  }

  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Pipeline</h1>
      <p className="text-surface-200/50 mb-6">
        Drag cards between columns or use the dropdown to change status. Right-click the menu to archive or add notes.
      </p>

      {/* Summary bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {COLUMNS.map(col => {
          const count = jobs.filter(j => col.statuses.includes(j.status)).length
          return (
            <div key={col.key} className="card px-3 py-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full bg-${col.color}`} />
              <span className="text-xs text-surface-200/60">{col.label}</span>
              <span className="text-sm font-bold text-white">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colJobs = jobs.filter(j => col.statuses.includes(j.status))
          return (
            <PipelineColumn
              key={col.key}
              column={col}
              jobs={colJobs}
              onStatusChange={handleStatusChange}
              onDrop={handleDrop}
              onArchive={(id) => setDialogState({ type: 'archive', jobId: id })}
              onUnavailable={(id) => setDialogState({ type: 'unavailable', jobId: id })}
              onAddNote={(id) => setDialogState({ type: 'note', jobId: id })}
            />
          )
        })}
      </div>

      {/* Dialogs */}
      <NoteDialog
        isOpen={dialogState.type === 'archive'}
        title="Archive this role"
        onClose={() => setDialogState({ type: null })}
        onSave={(note) => {
          updateStatus.mutate({ id: dialogState.jobId, status: 'archived', notes: note || 'Archived' })
          setDialogState({ type: null })
        }}
      />
      <NoteDialog
        isOpen={dialogState.type === 'unavailable'}
        title="Mark as unavailable"
        onClose={() => setDialogState({ type: null })}
        onSave={(note) => {
          updateStatus.mutate({ id: dialogState.jobId, status: 'unavailable', notes: note || 'No longer available' })
          setDialogState({ type: null })
        }}
      />
      <NoteDialog
        isOpen={dialogState.type === 'note'}
        title="Add a note"
        onClose={() => setDialogState({ type: null })}
        onSave={(note) => {
          if (note.trim()) addNote.mutate({ id: dialogState.jobId, notes: note })
          setDialogState({ type: null })
        }}
      />
    </div>
  )
}
