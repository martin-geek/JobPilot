import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { MapPin, Wifi, Building, Home } from 'lucide-react'
import { api } from '../utils/api'

function JobMap({ data }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0 || !mapRef.current) return
    if (typeof window === 'undefined' || !window.L) return

    // Initialize map if not already done
    if (!mapInstance.current) {
      mapInstance.current = window.L.map(mapRef.current).setView([39.8, -98.5], 4)
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
      }).addTo(mapInstance.current)
    }

    const map = mapInstance.current

    // Clear existing markers
    map.eachLayer(layer => {
      if (layer instanceof window.L.CircleMarker) map.removeLayer(layer)
    })

    // Add markers
    data.forEach(job => {
      if (!job.latitude || !job.longitude) return

      const color =
        job.fit_score >= 80 ? '#10b981' :
        job.fit_score >= 65 ? '#f59e0b' :
        job.fit_score ? '#3b82f6' : '#94a3b8'

      const marker = window.L.circleMarker([job.latitude, job.longitude], {
        radius: 8,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.4,
      }).addTo(map)

      marker.bindPopup(`
        <div style="font-family: DM Sans, sans-serif; min-width: 180px;">
          <strong style="color: #f1f5f9;">${job.title}</strong><br/>
          <span style="color: #94a3b8; font-size: 12px;">${job.company}</span><br/>
          <span style="color: #94a3b8; font-size: 12px;">${job.location || 'No location'}</span><br/>
          ${job.fit_score ? `<span style="color: ${color}; font-size: 12px; font-weight: 600;">Fit: ${Math.round(job.fit_score)}%</span>` : ''}
        </div>
      `)
    })

    // Fit bounds to markers
    const points = data
      .filter(j => j.latitude && j.longitude)
      .map(j => [j.latitude, j.longitude])
    if (points.length > 0) {
      map.fitBounds(points, { padding: [50, 50] })
    }

    return () => {
      // Cleanup handled by component unmount
    }
  }, [data])

  return (
    <div
      ref={mapRef}
      className="w-full h-[500px] rounded-2xl overflow-hidden border border-white/5"
      style={{ background: '#0f172a' }}
    />
  )
}

function LocationBreakdown({ data }) {
  if (!data) return null

  const remote = data.filter(j => j.location_type === 'remote').length
  const hybrid = data.filter(j => j.location_type === 'hybrid').length
  const onsite = data.filter(j => j.location_type === 'onsite').length
  const unknown = data.filter(j => !j.location_type).length
  const total = data.length

  const items = [
    { label: 'Remote', count: remote, icon: Wifi, pct: total ? Math.round(remote/total*100) : 0, color: 'success' },
    { label: 'Hybrid', count: hybrid, icon: Home, pct: total ? Math.round(hybrid/total*100) : 0, color: 'warning' },
    { label: 'On-site', count: onsite, icon: Building, pct: total ? Math.round(onsite/total*100) : 0, color: 'info' },
    { label: 'Unknown', count: unknown, icon: MapPin, pct: total ? Math.round(unknown/total*100) : 0, color: 'surface-200/40' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {items.map(({ label, count, icon: Icon, pct, color }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <Icon className={`w-4 h-4 text-${color}`} style={{ opacity: 0.7 }} />
            <span className="text-2xl font-display font-bold text-white">{count}</span>
          </div>
          <p className="text-xs text-surface-200/50 uppercase tracking-wider">{label}</p>
          <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full bg-${color} rounded-full transition-all duration-500`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MapPage() {
  const { data: mapData, isLoading } = useQuery({
    queryKey: ['map-data'],
    queryFn: api.dashboard.mapData,
  })

  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Job Map
      </h1>
      <p className="text-surface-200/50 mb-8">
        Geographic distribution of discovered roles. Color indicates fit score.
      </p>

      <LocationBreakdown data={mapData} />

      {isLoading ? (
        <div className="card flex items-center justify-center h-[500px]">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <JobMap data={mapData} />
          <div className="flex items-center gap-6 mt-4 justify-center">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-success" />
              <span className="text-xs text-surface-200/50">Strong fit (80+)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-warning" />
              <span className="text-xs text-surface-200/50">Stretch (65-79)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-info" />
              <span className="text-xs text-surface-200/50">Review (&lt;65)</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
