import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Settings as SettingsIcon, Save, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../utils/api'

function SettingsGroup({ category, settings, onSave }) {
  const [edits, setEdits] = useState({})

  const handleSave = (key) => {
    if (edits[key] !== undefined) {
      onSave(key, edits[key])
      setEdits(prev => { const n = {...prev}; delete n[key]; return n })
    }
  }

  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">{category}</h3>
      <div className="space-y-3">
        {settings.map(s => (
          <div key={s.key} className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-surface-200/70">{s.description || s.key}</p>
              <p className="text-[10px] text-surface-200/30 font-mono">{s.key}</p>
            </div>
            <input
              className="input-field w-48 text-sm"
              value={edits[s.key] !== undefined ? edits[s.key] : s.value}
              onChange={e => setEdits({...edits, [s.key]: e.target.value})}
            />
            {edits[s.key] !== undefined && (
              <button onClick={() => handleSave(s.key)} className="btn-primary text-xs py-1.5">
                <Save className="w-3 h-3" /> Save
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SearchQueriesManager() {
  const queryClient = useQueryClient()
  const [newQuery, setNewQuery] = useState({ tier: 'primary', keywords: '', geography: '', seniority: 'senior' })

  const { data: queries } = useQuery({
    queryKey: ['search-queries'],
    queryFn: api.searchQueries.list,
  })

  const addQuery = useMutation({
    mutationFn: (data) => api.searchQueries.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-queries'] })
      setNewQuery({ tier: 'primary', keywords: '', geography: '', seniority: 'senior' })
    },
  })

  const toggleQuery = useMutation({
    mutationFn: (id) => api.searchQueries.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-queries'] }),
  })

  const deleteQuery = useMutation({
    mutationFn: (id) => api.searchQueries.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-queries'] }),
  })

  const tiers = { primary: 'Primary', adjacent: 'Adjacent', opportunistic: 'Opportunistic' }

  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Search Matrix</h3>

      {/* Add new query */}
      <div className="flex gap-2 mb-6">
        <select className="input-field text-sm flex-shrink-0" value={newQuery.tier}
          onChange={e => setNewQuery({...newQuery, tier: e.target.value})}>
          <option value="primary">Primary</option>
          <option value="adjacent">Adjacent</option>
          <option value="opportunistic">Opportunistic</option>
        </select>
        <input className="input-field text-sm flex-1" placeholder="Keywords (e.g. Enterprise Architect)"
          value={newQuery.keywords} onChange={e => setNewQuery({...newQuery, keywords: e.target.value})} />
        <input className="input-field text-sm w-40" placeholder="Geography"
          value={newQuery.geography} onChange={e => setNewQuery({...newQuery, geography: e.target.value})} />
        <button onClick={() => newQuery.keywords && addQuery.mutate(newQuery)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Existing queries */}
      {Object.entries(tiers).map(([tier, label]) => {
        const tierQueries = queries?.filter(q => q.tier === tier) || []
        if (tierQueries.length === 0) return null
        return (
          <div key={tier} className="mb-4">
            <h4 className="text-xs text-surface-200/40 uppercase tracking-wider mb-2">{label}</h4>
            <div className="space-y-1">
              {tierQueries.map(q => (
                <div key={q.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02]">
                  <button onClick={() => toggleQuery.mutate(q.id)} className="flex-shrink-0">
                    {q.is_active ? (
                      <ToggleRight className="w-5 h-5 text-success" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-surface-200/30" />
                    )}
                  </button>
                  <span className={`text-sm flex-1 ${q.is_active ? 'text-white' : 'text-surface-200/30 line-through'}`}>
                    {q.keywords}
                  </span>
                  <span className="text-xs text-surface-200/40">{q.geography}</span>
                  <span className="text-xs text-surface-200/30">{q.seniority}</span>
                  <button onClick={() => deleteQuery.mutate(q.id)}
                    className="text-surface-200/20 hover:text-danger transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.getAll,
  })

  const updateSetting = useMutation({
    mutationFn: ({ key, value }) => api.settings.update(key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Settings
      </h1>
      <p className="text-surface-200/50 mb-8">
        Configure search queries, scoring thresholds, and pipeline behavior.
      </p>

      <div className="space-y-6">
        <SearchQueriesManager />

        {settings && Object.entries(settings).map(([category, items]) => (
          <SettingsGroup
            key={category}
            category={category}
            settings={items}
            onSave={(key, value) => updateSetting.mutate({ key, value })}
          />
        ))}
      </div>
    </div>
  )
}
