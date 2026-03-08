import { useQuery } from '@tanstack/react-query'
import { Brain, TrendingUp, Lightbulb, Target, BookOpen, ArrowUpRight } from 'lucide-react'
import { api } from '../utils/api'

function InsightCard({ insight }) {
  const data = typeof insight.data === 'string' ? JSON.parse(insight.data || '{}') : (insight.data || {})

  const iconMap = {
    skills_gap: Target,
    trending_skill: TrendingUp,
    role_recommendation: Lightbulb,
    demand_shift: ArrowUpRight,
  }
  const Icon = iconMap[insight.insight_type] || Brain

  const colorMap = {
    skills_gap: 'warning',
    trending_skill: 'info',
    role_recommendation: 'success',
    demand_shift: 'accent',
  }
  const color = colorMap[insight.insight_type] || 'surface-200'

  return (
    <div className="card-hover p-5 animate-slide-up">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl bg-${color}/10 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 text-${color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`badge badge-${color === 'accent' ? 'accent' : color}`}>
              {insight.insight_type.replace(/_/g, ' ')}
            </span>
            {insight.actionable && (
              <span className="badge badge-success">Actionable</span>
            )}
            {insight.relevance_score && (
              <span className="text-xs text-surface-200/40">
                Relevance: {Math.round(insight.relevance_score)}%
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{insight.title}</h3>
          <p className="text-sm text-surface-200/60 leading-relaxed">{insight.description}</p>

          {/* Type-specific details */}
          {insight.insight_type === 'skills_gap' && data.recommended_learning_path && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-warning/5 border border-warning/10">
              <p className="text-xs text-warning/80 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                <strong>Learning path:</strong> {data.recommended_learning_path}
              </p>
              {data.effort_to_acquire && (
                <p className="text-xs text-surface-200/50 mt-1">
                  Effort: {data.effort_to_acquire} · Frequency in stretch roles: {data.frequency_in_stretches}%
                </p>
              )}
            </div>
          )}

          {insight.insight_type === 'role_recommendation' && data.estimated_salary_range && (
            <div className="mt-3 flex items-center gap-4 text-xs text-surface-200/50">
              <span>💰 {data.estimated_salary_range}</span>
              {data.fit_probability && <span>🎯 Fit: {data.fit_probability}</span>}
            </div>
          )}

          {insight.insight_type === 'trending_skill' && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className={`${
                data.trend_direction === 'rising' ? 'text-success' :
                data.trend_direction === 'declining' ? 'text-danger' : 'text-surface-200/50'
              }`}>
                {data.trend_direction === 'rising' ? '📈' : data.trend_direction === 'declining' ? '📉' : '➡️'}
                {data.trend_direction}
              </span>
              {data.relevance_to_candidate && (
                <span className="text-surface-200/50">
                  Relevance: {data.relevance_to_candidate}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MarketPage() {
  const { data: insights, isLoading } = useQuery({
    queryKey: ['market-insights'],
    queryFn: api.dashboard.marketInsights,
  })

  // Group by type
  const grouped = {
    skills_gap: [],
    trending_skill: [],
    role_recommendation: [],
    demand_shift: [],
  }
  insights?.forEach(i => {
    if (grouped[i.insight_type]) grouped[i.insight_type].push(i)
  })

  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">
        Market Intelligence
      </h1>
      <p className="text-surface-200/50 mb-8">
        Weekly analysis of skills gaps, market trends, and strategic role recommendations.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : !insights || insights.length === 0 ? (
        <div className="card p-12 text-center">
          <Brain className="w-12 h-12 text-surface-200/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-surface-200/60">No insights yet</h3>
          <p className="text-sm text-surface-200/40 mt-1">
            Market intelligence is generated weekly after sufficient job data has been collected.
            Run the pipeline for a few days to start seeing insights.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Skills Gaps */}
          {grouped.skills_gap.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-warning" />
                Skills Gaps
                <span className="text-xs text-surface-200/40 font-normal">
                  — Skills that would unlock more roles for you
                </span>
              </h2>
              <div className="space-y-3">
                {grouped.skills_gap.map(i => <InsightCard key={i.id} insight={i} />)}
              </div>
            </section>
          )}

          {/* Role Recommendations */}
          {grouped.role_recommendation.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-success" />
                Role Recommendations
                <span className="text-xs text-surface-200/40 font-normal">
                  — Titles you might not be searching for
                </span>
              </h2>
              <div className="space-y-3">
                {grouped.role_recommendation.map(i => <InsightCard key={i.id} insight={i} />)}
              </div>
            </section>
          )}

          {/* Trending Skills */}
          {grouped.trending_skill.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-info" />
                Trending Skills
              </h2>
              <div className="space-y-3">
                {grouped.trending_skill.map(i => <InsightCard key={i.id} insight={i} />)}
              </div>
            </section>
          )}

          {/* Market Observations */}
          {grouped.demand_shift.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-accent-400" />
                Market Observations
              </h2>
              <div className="space-y-3">
                {grouped.demand_shift.map(i => <InsightCard key={i.id} insight={i} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
