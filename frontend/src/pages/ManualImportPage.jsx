import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Link2, Plus, CheckCircle, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Edit3, Send, RotateCcw,
  MapPin, Building2, DollarSign, FileText, Briefcase
} from 'lucide-react'
import { api } from '../utils/api'

const STEPS = [
  { key: 'url', label: 'Paste URL' },
  { key: 'fetching', label: 'Extracting' },
  { key: 'preview', label: 'Review' },
  { key: 'submitting', label: 'Submitting' },
  { key: 'done', label: 'Done' },
]

function ProgressBar({ currentStep, error }) {
  const stepIdx = STEPS.findIndex(s => s.key === currentStep)

  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.filter(s => s.key !== 'submitting').map((step, i) => {
        const thisIdx = STEPS.findIndex(s => s.key === step.key)
        const isActive = thisIdx === stepIdx
        const isDone = thisIdx < stepIdx
        const isError = error && isActive

        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold transition-all duration-300 ${
                isError ? 'bg-danger/20 text-danger ring-2 ring-danger/30' :
                isDone ? 'bg-success/20 text-success' :
                isActive ? 'bg-accent/20 text-accent-400 ring-2 ring-accent/30' :
                'bg-white/5 text-surface-200/30'
              }`}>
                {isError ? '!' : isDone ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                isError ? 'text-danger' :
                isDone ? 'text-success/70' :
                isActive ? 'text-accent-400' :
                'text-surface-200/30'
              }`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.filter(s => s.key !== 'submitting').length - 1 && (
              <div className={`h-px flex-1 mx-2 transition-all duration-500 ${
                isDone ? 'bg-success/30' : 'bg-white/5'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FetchingIndicator() {
  const [dots, setDots] = useState('')
  const [stage, setStage] = useState(0)
  const stages = ['Fetching page', 'Reading content', 'Extracting job details']

  useEffect(() => {
    const dotTimer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400)
    const stageTimer = setInterval(() => setStage(s => Math.min(s + 1, stages.length - 1)), 3000)
    return () => { clearInterval(dotTimer); clearInterval(stageTimer) }
  }, [])

  return (
    <div className="card p-8 text-center animate-fade-in">
      <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
      </div>
      <p className="text-base font-medium text-white mb-1">{stages[stage]}{dots}</p>
      <p className="text-sm text-surface-200/40">This usually takes 5-15 seconds</p>

      {/* Animated progress bar */}
      <div className="mt-5 h-1.5 bg-white/5 rounded-full overflow-hidden max-w-xs mx-auto">
        <div className="h-full bg-gradient-to-r from-accent to-accent-400 rounded-full transition-all duration-[3000ms] ease-out"
          style={{ width: `${Math.min(30 + stage * 30, 90)}%` }} />
      </div>
    </div>
  )
}

function EditablePreview({ data, onSubmit, onReset, isSubmitting }) {
  const [form, setForm] = useState(data)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <div className="card overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="bg-success/5 border-b border-success/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-success" />
          <span className="text-sm font-medium text-success">Data extracted — review and submit</span>
        </div>
        <button onClick={onReset} className="btn-ghost text-xs py-1">
          <RotateCcw className="w-3 h-3" /> Start Over
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Title + Company */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> Job Title
            </label>
            <input className="input-field w-full text-lg font-semibold" value={form.title} onChange={set('title')} />
          </div>
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Company
            </label>
            <input className="input-field w-full text-lg font-semibold" value={form.company} onChange={set('company')} />
          </div>
        </div>

        {/* URL (readonly display) */}
        <div>
          <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Source URL
          </label>
          <div className="input-field w-full text-sm text-surface-200/40 truncate bg-surface-950/50">{form.url}</div>
        </div>

        {/* Location + Type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location
            </label>
            <input className="input-field w-full" placeholder="e.g. Remote, Minneapolis MN"
              value={form.location || ''} onChange={set('location')} />
          </div>
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Type</label>
            <select className="input-field w-full" value={form.location_type || ''} onChange={set('location_type')}>
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
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Salary Min
            </label>
            <input className="input-field w-full" type="number" placeholder="170000"
              value={form.salary_min || ''} onChange={e => setForm({ ...form, salary_min: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
          <div>
            <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Salary Max</label>
            <input className="input-field w-full" type="number" placeholder="220000"
              value={form.salary_max || ''} onChange={e => setForm({ ...form, salary_max: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Job Description
          </label>
          <textarea className="input-field w-full h-48 resize-y text-sm leading-relaxed"
            value={form.description || ''} onChange={set('description')} />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <p className="text-xs text-surface-200/40">
            AI assessment will run automatically after submission
          </p>
          <button
            onClick={() => onSubmit(form)}
            disabled={!form.title?.trim() || !form.company?.trim() || isSubmitting}
            className="btn-primary px-8 py-3"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4" /> Submit to Queue</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ManualImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [currentStep, setCurrentStep] = useState('url')
  const [url, setUrl] = useState('')
  const [extractedData, setExtractedData] = useState(null)
  const [error, setError] = useState(null)
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({
    title: '', company: '', url: '', location: '', location_type: '',
    description: '', salary_min: '', salary_max: '', run_assessment: true,
  })

  // Step 1: Extract from URL
  const extractUrl = useMutation({
    mutationFn: (url) =>
      fetch('/api/pipeline/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).then(r => r.json()),
    onMutate: () => {
      setCurrentStep('fetching')
      setError(null)
      setExtractedData(null)
    },
    onSuccess: (res) => {
      if (res.status === 'extracted') {
        setExtractedData(res.data)
        setCurrentStep('preview')
      } else if (res.status === 'duplicate') {
        setError(res.message)
        setCurrentStep('url')
      } else {
        setError(res.message || 'Extraction failed')
        setCurrentStep('url')
      }
    },
    onError: (err) => {
      setError(err.message || 'Network error')
      setCurrentStep('url')
    },
  })

  // Step 2: Submit confirmed data
  const submitJob = useMutation({
    mutationFn: (data) =>
      fetch('/api/pipeline/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          company: data.company,
          url: data.url,
          location: data.location || '',
          location_type: data.location_type || null,
          description: data.description || '',
          salary_min: data.salary_min || null,
          salary_max: data.salary_max || null,
          source: 'url_import',
          run_assessment: true,
        }),
      }).then(r => r.json()),
    onMutate: () => setCurrentStep('submitting'),
    onSuccess: (res) => {
      if (res.status === 'imported') {
        setCurrentStep('done')
        queryClient.invalidateQueries()
      } else if (res.status === 'duplicate') {
        setError('This role already exists')
        setCurrentStep('preview')
      }
    },
    onError: () => {
      setError('Failed to save')
      setCurrentStep('preview')
    },
  })

  // Manual import
  const importManual = useMutation({
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
    onSuccess: (res) => {
      if (res.status === 'imported') {
        queryClient.invalidateQueries()
        navigate(`/jobs/${res.job_id}`)
      }
    },
  })

  const handleReset = () => {
    setCurrentStep('url')
    setUrl('')
    setExtractedData(null)
    setError(null)
  }

  const mset = (key) => (e) => setManualForm({ ...manualForm, [key]: e.target.value })

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Add Role</h1>
      <p className="text-surface-200/50 mb-6">
        Paste a job posting URL. We'll extract the details and you can review before submitting.
      </p>

      {/* Progress steps */}
      <ProgressBar currentStep={currentStep} error={error} />

      {/* Error banner */}
      {error && currentStep === 'url' && (
        <div className="card p-4 mb-4 bg-danger/5 border-danger/20 flex items-start gap-3 animate-slide-up">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">Extraction failed</p>
            <p className="text-xs text-surface-200/50">{error}</p>
          </div>
        </div>
      )}

      {/* ── Step 1: URL Input ────────────────────── */}
      {currentStep === 'url' && (
        <div className="card p-6 mb-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-5 h-5 text-accent-400" />
            <h2 className="text-base font-display font-semibold text-white">Paste Job URL</h2>
          </div>
          <div className="flex gap-3">
            <input
              className="input-field flex-1 text-base"
              placeholder="https://careers.company.com/job/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url.trim() && extractUrl.mutate(url.trim())}
              autoFocus
            />
            <button
              onClick={() => url.trim() && extractUrl.mutate(url.trim())}
              disabled={!url.trim()}
              className={`btn-primary px-6 text-sm ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus className="w-4 h-4" /> Extract
            </button>
          </div>
          <p className="text-xs text-surface-200/30 mt-3">
            Works with LinkedIn, Indeed, Greenhouse, Lever, Workday, iCIMS, and most career portals.
          </p>
        </div>
      )}

      {/* ── Step 2: Fetching ─────────────────────── */}
      {currentStep === 'fetching' && <FetchingIndicator />}

      {/* ── Step 3: Editable Preview ─────────────── */}
      {(currentStep === 'preview' || currentStep === 'submitting') && extractedData && (
        <EditablePreview
          data={extractedData}
          onSubmit={(data) => submitJob.mutate(data)}
          onReset={handleReset}
          isSubmitting={currentStep === 'submitting'}
        />
      )}

      {/* ── Step 4: Done ─────────────────────────── */}
      {currentStep === 'done' && (
        <div className="card p-8 text-center animate-slide-up">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-success" />
          </div>
          <h3 className="text-lg font-display font-semibold text-white mb-1">Role submitted!</h3>
          <p className="text-sm text-surface-200/50 mb-4">
            AI assessment is running. The role will appear in your Queue with scores shortly.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleReset} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Another
            </button>
            <button onClick={() => navigate('/')} className="btn-ghost">
              Go to Queue
            </button>
          </div>
        </div>
      )}

      {/* ── Manual Form (Expandable Fallback) ────── */}
      {(currentStep === 'url') && (
        <div className="card overflow-hidden mt-4">
          <button onClick={() => setShowManual(!showManual)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors">
            <h2 className="text-sm font-medium text-surface-200/60 flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> Or enter details manually
            </h2>
            {showManual ? <ChevronUp className="w-4 h-4 text-surface-200/30" /> :
              <ChevronDown className="w-4 h-4 text-surface-200/30" />}
          </button>

          {showManual && (
            <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Job Title *</label>
                  <input className="input-field w-full" placeholder="Principal Enterprise Architect" value={manualForm.title} onChange={mset('title')} />
                </div>
                <div>
                  <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Company *</label>
                  <input className="input-field w-full" placeholder="Microsoft" value={manualForm.company} onChange={mset('company')} />
                </div>
              </div>
              <div>
                <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">URL</label>
                <input className="input-field w-full" placeholder="https://..." value={manualForm.url} onChange={mset('url')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Location</label>
                  <input className="input-field w-full" placeholder="Remote" value={manualForm.location} onChange={mset('location')} />
                </div>
                <div>
                  <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Type</label>
                  <select className="input-field w-full" value={manualForm.location_type} onChange={mset('location_type')}>
                    <option value="">Select...</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-surface-200/50 uppercase tracking-wider mb-1.5 block">Job Description</label>
                <textarea className="input-field w-full h-32 resize-y" placeholder="Paste the full job description..."
                  value={manualForm.description} onChange={mset('description')} />
              </div>
              <button onClick={() => manualForm.title && manualForm.company && importManual.mutate(manualForm)}
                disabled={!manualForm.title.trim() || !manualForm.company.trim() || importManual.isPending}
                className="btn-primary w-full py-3">
                {importManual.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Import Role
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
