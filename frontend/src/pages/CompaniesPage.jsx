import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Building2, Plus, Star, ExternalLink, Trash2 } from 'lucide-react'
import { api } from '../utils/api'

export default function CompaniesPage() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', career_url: '', priority: 'normal', is_watchlist: true })

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  })

  const addCompany = useMutation({
    mutationFn: (data) => api.companies.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowAdd(false)
      setForm({ name: '', career_url: '', priority: 'normal', is_watchlist: true })
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
          <p className="text-surface-200/50 mt-1">Track target companies and their career portals</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-white mb-4">Add Company</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <input className="input-field" placeholder="Company name"
              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className="input-field" placeholder="Career portal URL"
              value={form.career_url} onChange={e => setForm({...form, career_url: e.target.value})} />
            <select className="input-field" value={form.priority}
              onChange={e => setForm({...form, priority: e.target.value})}>
              <option value="high">High Priority</option>
              <option value="normal">Normal</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => addCompany.mutate(form)} className="btn-primary text-sm">Save</button>
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
                    {co.industry && (
                      <p className="text-xs text-surface-200/50">{co.industry}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {co.is_watchlist && (
                    <Star className="w-4 h-4 text-warning fill-warning" />
                  )}
                  <span className={`badge ${
                    co.priority === 'high' ? 'badge-success' :
                    co.priority === 'low' ? 'badge-danger' : 'badge-info'
                  }`}>
                    {co.priority}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-surface-200/50 mb-3">
                <span>{co.job_count || 0} roles found</span>
                <span>{co.applied_count || 0} applied</span>
                {co.portal_type && <span className="uppercase">{co.portal_type}</span>}
              </div>

              {co.culture_notes && (
                <p className="text-xs text-surface-200/40 mb-3">{co.culture_notes}</p>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                {co.career_url && (
                  <a href={co.career_url} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-xs py-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Career Portal
                  </a>
                )}
                <button onClick={() => deleteCompany.mutate(co.id)}
                  className="btn-ghost text-xs py-1.5 ml-auto text-danger/60 hover:text-danger">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
