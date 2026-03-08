import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react'
import { api } from '../utils/api'

const THRESHOLD_US = 170000
const THRESHOLD_SPAIN = 70000

function SalaryChart({ data }) {
  if (!data || data.length === 0) return null

  const chartData = data.map(d => ({
    name: `${d.role_category}\n${d.geography}`,
    shortName: d.role_category.split('/')[0].trim(),
    min: Math.round(d.avg_min / 1000),
    max: Math.round(d.avg_max / 1000),
    median: Math.round(d.avg_median / 1000),
    threshold: d.currency === 'EUR' ? THRESHOLD_SPAIN / 1000 : THRESHOLD_US / 1000,
    samples: d.total_samples,
    currency: d.currency,
    geography: d.geography,
    meetsThreshold: d.avg_max >= (d.currency === 'EUR' ? THRESHOLD_SPAIN : THRESHOLD_US),
  }))

  return (
    <div className="card p-6">
      <h3 className="text-lg font-display font-semibold text-white mb-4">
        Salary Ranges by Role & Geography
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="shortName"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            angle={-30}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            label={{ value: 'Salary ($K)', angle: -90, position: 'insideLeft',
                     fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '12px',
            }}
            formatter={(val, name) => [`$${val}K`, name === 'min' ? 'Min' : name === 'max' ? 'Max' : 'Median']}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="min" fill="#3b82f6" opacity={0.3} radius={[4, 4, 0, 0]} />
          <Bar dataKey="median" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.meetsThreshold ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
          <Bar dataKey="max" fill="#3b82f6" opacity={0.5} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-surface-200/40 mt-2 text-center">
        Green = meets your salary threshold · Red = below threshold
      </p>
    </div>
  )
}

function SalaryTable({ data }) {
  if (!data || data.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Role Category</th>
            <th className="text-left text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Geography</th>
            <th className="text-right text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Min</th>
            <th className="text-right text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Median</th>
            <th className="text-right text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Max</th>
            <th className="text-right text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Samples</th>
            <th className="text-center text-xs uppercase tracking-wider text-surface-200/50 px-6 py-3">Threshold</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((row, i) => {
            const threshold = row.currency === 'EUR' ? THRESHOLD_SPAIN : THRESHOLD_US
            const meetsThreshold = row.avg_max >= threshold
            const sym = row.currency === 'EUR' ? '€' : '$'
            return (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3 text-sm text-white font-medium">{row.role_category}</td>
                <td className="px-6 py-3 text-sm text-surface-200/60">{row.geography}</td>
                <td className="px-6 py-3 text-sm text-surface-200/60 text-right font-mono">
                  {sym}{Math.round(row.avg_min).toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm text-white text-right font-mono font-medium">
                  {sym}{Math.round(row.avg_median).toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm text-surface-200/60 text-right font-mono">
                  {sym}{Math.round(row.avg_max).toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm text-surface-200/40 text-right">{row.total_samples}</td>
                <td className="px-6 py-3 text-center">
                  {meetsThreshold ? (
                    <span className="badge-success">✓ Meets</span>
                  ) : (
                    <span className="badge-danger">✗ Below</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function SalaryPage() {
  const { data: salaryData, isLoading } = useQuery({
    queryKey: ['salary-summary'],
    queryFn: api.dashboard.salarySummary,
  })

  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Salary Intelligence
      </h1>
      <p className="text-surface-200/50 mb-8">
        Compensation ranges across roles and geographies. Green meets your threshold; red doesn't.
      </p>

      {/* Threshold cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <p className="text-xs text-surface-200/50 uppercase tracking-wider">US Threshold</p>
            <p className="text-xl font-display font-bold text-white">${THRESHOLD_US.toLocaleString()}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <p className="text-xs text-surface-200/50 uppercase tracking-wider">Spain Threshold</p>
            <p className="text-xl font-display font-bold text-white">€{THRESHOLD_SPAIN.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : salaryData?.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingUp className="w-12 h-12 text-surface-200/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-surface-200/60">No salary data yet</h3>
          <p className="text-sm text-surface-200/40 mt-1">
            Salary data is collected as the pipeline assesses roles with posted compensation ranges.
          </p>
        </div>
      ) : (
        <>
          <SalaryChart data={salaryData} />
          <div className="mt-6">
            <SalaryTable data={salaryData} />
          </div>
        </>
      )}
    </div>
  )
}
