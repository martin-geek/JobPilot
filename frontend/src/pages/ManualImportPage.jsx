import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../utils/api'

export default function ManualImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    title: '', company: '', url: '', location: '', location_type: '',
    description: '', salary_min: '', salary_max: '', run_assessment: true,
  })
  const [result, setResult] = useState(null)

  const importJob = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        salary_min: data.salary_min ? parseFloat(data.salary_min) : null,
        salary_max: data.salary_max ? parseFloat(data.salary_max) : null,
      }
      return fetch('/api/pipeline/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
    },
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['all-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      if (data.status === 'imported') {
        // Reset form
        setForm({
          title: '', company: '', url: '', location: '', location_type: '',
          description: '', salary_min: '', salary_max: '', run_assessment: true,
        })
      }
    },
  })

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    if (!form.title.trim() || !form.company.trim()) return
    setResult(null)
    importJob.mutate(form)
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Add Role</h1>
      <p className="text-surface-200/50 mb-8">
        Manually add a job you found. If you have your API key configured, it will be automatically scored against your resume.
      </p>

      {/* Result feedback */}
      {result && (
        <div className={`card p-4 mb-6 flex items-center gap-3 ${
          result.status === 'imported' ? 'bg-success/5 border-success/20' :
          result.status === 'duplicate' ? 'bg-warning/5 border-warning/20' :
          'bg-danger/5 border-danger/20'
        }`}>
          {result.status === 'imported' ? (
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          )}
          <div>
            <p className="text-sm text-white font-medium">
              {result.status === 'imported' ? 'Role imported successfully!' :
               result.status === 'duplicate' ? 'This role already exists.' :
               'Import failed.'}
            </p>
            <p className="text-xs text-surface-200/50">
              {result.status === 'imported' && result.will_assess
                ? 'AI assessment running in the background. Check the Queue in a minute.'
                : result.message || ''}
            </p>
            {result.job_id && (
              <button
                onClick={() => navigate(`/jobs/${result.job_id}`)}
                className="text-xs text-accent-400 hover:text-accent-200 mt-1"
              >
                View role →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import form */}
      <div className="card p-6">
        <div className="space-y-4">
          {/* Required fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">
                Job Title <span className="text-danger">*</span>
              </label>
              <input className="input-field w-full" placeholder="e.g. Principal Enterprise Architect"
                value={form.title} onChange={set('title')} />
            </div>
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">
                Company <span className="text-danger">*</span>
              </label>
              <input className="input-field w-full" placeholder="e.g. Microsoft"
                value={form.company} onChange={set('company')} />
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">
              Job Posting URL
            </label>
            <input className="input-field w-full" placeholder="https://careers.company.com/job/..."
              value={form.url} onChange={set('url')} />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Location</label>
              <input className="input-field w-full" placeholder="e.g. Remote, Minneapolis MN"
                value={form.location} onChange={set('location')} />
            </div>
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Type</label>
              <select className="input-field w-full" value={form.location_type} onChange={set('location_type')}>
                <option value="">Select...</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Salary Min</label>
              <input className="input-field w-full" type="number" placeholder="170000"
                value={form.salary_min} onChange={set('salary_min')} />
            </div>
            <div>
              <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Salary Max</label>
              <input className="input-field w-full" type="number" placeholder="220000"
                value={form.salary_max} onChange={set('salary_max')} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">
              Job Description
            </label>
            <textarea className="input-field w-full h-40 resize-y"
              placeholder="Paste the full job description here. The more detail you provide, the better the AI assessment."
              value={form.description} onChange={set('description')} />
          </div>

          {/* Assessment toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.run_assessment}
              onChange={e => setForm({ ...form, run_assessment: e.target.checked })}
              className="w-4 h-4 rounded border-white/20 bg-surface-900 text-accent accent-accent" />
            <span className="text-sm text-surface-200/70">
              Run AI assessment automatically (requires API key)
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || !form.company.trim() || importJob.isPending}
            className={`btn-primary w-full py-3 ${
              (!form.title.trim() || !form.company.trim()) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {importJob.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
            ) : (
              <><Plus className="w-4 h-4" /> Import Role</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
