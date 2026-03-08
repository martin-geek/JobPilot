import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Building2, Plus, Star, ExternalLink, Trash2, Search, Loader2 } from 'lucide-react'
import { api } from '../utils/api'

export default function CompaniesPage() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    name: '', career_url: '', priority: 'normal', is_watchlist: true,
    industry: '', auto_search: true,
  })
  const [searching, setSearching] = useState({}) // company_id -> true

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  })

  const addCompany = useMutation({
    mutationFn: (data) => api.companies.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowAdd(false)
      setForm({ name: '', career_url: '', priority: 'normal', is_watchlist: true, industry: '', auto_search: true })
      if (res.searching) {
        setSearching(prev => ({ ...prev, [res.id]: true }))
        // Clear searching state after a delay
        setTimeout(() => {
          setSearching(prev => { const n = {...prev}; delete n[res.id]; return n })
          queryClient.invalidateQueries({ queryKey: ['companies'] })
        }, 30000)
      }
    },
  })

  const searchPortal = useMutation({
    mutationFn: (id) => api.companies.search(id),
    onMutate: (id) => setSearching(prev => ({ ...prev, [id]: true })),
    onSettled: (_, __, id) => {
      setTimeout(() => {
        setSearching(prev => { const n = {...prev}; delete n[id]; return n })
        queryClient.invalidateQueries({ queryKey: ['companies'] })
      }, 20000)
    },
  })

  const deleteCompany = useMutation({
    mutationFn: (id) => api.companies.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Companies</h1>
          <p className="text-surface-200/50 mt-1">Track target companies. Add a company to auto-search its career portal for relevant roles.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-white mb-4">Add Company</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <input className="input-field" placeholder="Company name *"
              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className="input-field" placeholder="Career portal URL (optional)"
              value={form.career_url} onChange={e => setForm({...form, career_url: e.target.value})} />
            <input className="input-field" placeholder="Industry (optional)"
              value={form.industry} onChange={e => setForm({...form, industry: e.target.value})} />
          </div>
          <div className="flex items-center gap-4 mb-4">
            <select className="input-field text-sm" value={form.priority}
              onChange={e => setForm({...form, priority: e.target.value})}>
              <option value="high">High Priority</option>
              <option value="normal">Normal</option>
              <option value="low">Low Priority</option>
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.auto_search}
                onChange={e => setForm({...form, auto_search: e.target.checked})}
                className="w-4 h-4 rounded border-white/20 bg-surface-900 accent-accent" />
              <span className="text-sm text-surface-200/70">Search career portal for roles automatically</span>
            </label>
          </div>
          <p className="text-xs text-surface-200/40 mb-4">
            {form.career_url
              ? "We'll search the provided career URL for architect, AI, and enterprise roles."
              : "We'll try to discover the career portal via Google and search for relevant roles."
            }
          </p>
          <div className="flex gap-2">
            <button onClick={() => form.name && addCompany.mutate(form)}
              disabled={!form.name.trim() || addCompany.isPending}
              className="btn-primary text-sm">
              {addCompany.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Company
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {companies?.map(co => (
            <div key={co.id} className="card-hover p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-accent-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{co.name}</h3>
                    {co.industry && <p className="text-xs text-surface-200/50">{co.industry}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {co.is_watchlist && <Star className="w-4 h-4 text-warning fill-warning" />}
                  <span className={`badge ${
                    co.priority === 'high' ? 'badge-success' :
                    co.priority === 'low' ? 'badge-danger' : 'badge-info'
                  }`}>{co.priority}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-surface-200/50 mb-3">
                <span>{co.job_count || 0} roles found</span>
                <span>{co.active_count || 0} active</span>
                {co.portal_type && <span className="uppercase">{co.portal_type}</span>}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                {co.career_url && (
                  <a href={co.career_url} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-xs py-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Career Portal
                  </a>
                )}
                <button
                  onClick={() => searchPortal.mutate(co.id)}
                  disabled={searching[co.id]}
                  className="btn-ghost text-xs py-1.5"
                >
                  {searching[co.id] ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...</>
                  ) : (
                    <><Search className="w-3.5 h-3.5" /> Search Roles</>
                  )}
                </button>
                <button onClick={() => deleteCompany.mutate(co.id)}
                  className="btn-ghost text-xs py-1.5 ml-auto text-danger/60 hover:text-danger">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {companies?.length === 0 && (
            <div className="col-span-2 card p-12 text-center">
              <Building2 className="w-12 h-12 text-surface-200/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-surface-200/60">No companies yet</h3>
              <p className="text-sm text-surface-200/40 mt-1">Add target companies to monitor their career portals.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
