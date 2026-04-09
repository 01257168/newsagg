import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { Activity, Clock3, TrendingUp, Users } from 'lucide-react';
import {
  getArticleId,
  getAllArticles,
  getLatestArticles,
  getLiveEngagement,
  getSentimentDistribution,
  getTrendingKeywords,
  SentimentType,
} from '../services/newsAPI';

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
};

const CustomTooltip = ({ active, payload, isDark }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={`px-3 py-2 rounded-lg text-xs shadow-lg ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-800 border border-gray-100'}`}>
        <p className="font-semibold">{payload[0].name}</p>
        <p>{payload[0].value}{payload[0].name === 'Articles' ? '' : '%'}</p>
      </div>
    );
  }
  return null;
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = Date.now();
  const diffMinutes = Math.round((now - date.getTime()) / (1000 * 60));

  if (diffMinutes <= 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatCount = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
};

const sentimentTextClass: Record<SentimentType, string> = {
  positive: 'text-emerald-500',
  neutral: 'text-gray-500',
  negative: 'text-red-500',
};

const sentimentPillClass: Record<SentimentType, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-gray-100 text-gray-700',
  negative: 'bg-red-100 text-red-700',
};

export function SentimentPanel() {
  const { t, isDark } = useApp();
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 12_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const allArticles = useMemo(() => getAllArticles(), []);
  const sentimentDistribution = useMemo(() => getSentimentDistribution(), []);
  const liveArticles = useMemo(() => getLatestArticles(6), []);
  const trendingKeywords = useMemo(() => getTrendingKeywords(10), []);
  const allKeywords = useMemo(() => getTrendingKeywords(10000), []);
  const liveEngagement = useMemo(() => getLiveEngagement(tick, 6), [tick]);

  const sentimentData = sentimentDistribution.map((item) => ({
    name: t[item.type],
    value: item.count,
    color: SENTIMENT_COLORS[item.type],
    type: item.type,
  }));

  const total = sentimentData.reduce((s, d) => s + d.value, 0);
  const maxKeywordCount = Math.max(1, ...trendingKeywords.map((item) => item.count));
  const textColor = isDark ? '#e2e8f0' : '#374151';
  const mutedColor = isDark ? '#64748b' : '#9ca3af';

  const panelBase = isDark
    ? 'bg-slate-800/80 border-slate-700/50 backdrop-blur-md'
    : 'bg-white/80 border-white/60 backdrop-blur-md';

  return (
    <div className="space-y-4 w-full">
      {/* Sentiment Distribution */}
      <div className={`rounded-2xl border shadow-lg p-4 ${panelBase}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Activity size={13} className="text-white" />
          </div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
            {t.sentimentDistribution}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <ResponsiveContainer width="50%" height={110}>
            <PieChart>
              <Pie
                data={sentimentData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                paddingAngle={3}
                dataKey="value"
              >
                {sentimentData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip isDark={isDark} />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2">
            {sentimentData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <span className="text-xs flex-1 truncate" style={{ color: textColor }}>{d.name}</span>
                <span className="text-xs font-semibold" style={{ color: d.color }}>
                  {d.value} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live View */}
      <div className={`rounded-2xl border shadow-lg p-4 ${panelBase}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Clock3 size={13} className="text-white" />
          </div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
            Live View
          </h3>
        </div>

        <div className="space-y-2.5">
          {liveArticles.map((article) => (
            <Link
              key={article.url}
              to={`/article/${getArticleId(article)}`}
              className={`block rounded-xl p-2.5 transition-colors ${isDark ? 'hover:bg-slate-700/60' : 'hover:bg-gray-50'}`}
            >
              <p className={`text-sm font-medium line-clamp-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                {article.title}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                <span style={{ color: mutedColor }}>{formatRelativeTime(article.publishedAt)}</span>
                <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>•</span>
                <span style={{ color: textColor }}>{article.topic}</span>
                <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>•</span>
                <span className={sentimentTextClass[article.sentiment.type]}>{article.sentiment.type}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Trending Topics */}
      <div className={`rounded-2xl border shadow-lg p-4 ${panelBase}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
            <TrendingUp size={13} className="text-white" />
          </div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
            {t.trendingTopics}
          </h3>
        </div>

        <div className="space-y-2">
          {trendingKeywords.map((topic, i) => (
            <div key={topic.keyword} className="flex items-center gap-2">
              <span className="text-xs font-bold w-4" style={{ color: mutedColor }}>{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium" style={{ color: textColor }}>{topic.keyword}</span>
                  <span className="text-xs" style={{ color: mutedColor }}>{topic.count}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(topic.count / maxKeywordCount) * 100}%`,
                      background: '#06b6d4',
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Engagement */}
      <div className={`rounded-2xl border shadow-lg p-4 ${panelBase}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Users size={13} className="text-white" />
          </div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
            Live Engagement
          </h3>
        </div>

        <div className="space-y-2.5">
          {liveEngagement.map((item) => (
            <div key={item.articleId} className={`rounded-xl p-2.5 ${isDark ? 'bg-slate-700/50' : 'bg-gray-50/90'}`}>
              <p className={`text-sm font-medium line-clamp-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap">
                <span style={{ color: mutedColor }}>{item.topic}</span>
                <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>•</span>
                <span className={`${sentimentPillClass[item.sentiment]} px-2 py-0.5 rounded-full`}>{item.sentiment}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <div>
                  <p style={{ color: mutedColor }}>Views</p>
                  <p className="font-semibold" style={{ color: textColor }}>{formatCount(item.views)}</p>
                </div>
                <div>
                  <p style={{ color: mutedColor }}>Likes</p>
                  <p className="font-semibold" style={{ color: textColor }}>{formatCount(item.likes)}</p>
                </div>
                <div>
                  <p style={{ color: mutedColor }}>Interactions</p>
                  <p className="font-semibold" style={{ color: textColor }}>{formatCount(item.interactions)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs" style={{ color: mutedColor }}>Updates every 12 seconds</span>
        </div>
      </div>

      <div className={`rounded-2xl border shadow-lg p-4 ${panelBase}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-2.5 ${isDark ? 'bg-slate-700/50' : 'bg-gray-50/90'}`}>
            <p className="text-xs" style={{ color: mutedColor }}>Articles</p>
            <p className="text-lg font-bold text-cyan-500">{allArticles.length}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${isDark ? 'bg-slate-700/50' : 'bg-gray-50/90'}`}>
            <p className="text-xs" style={{ color: mutedColor }}>Keywords tracked</p>
            <p className="text-lg font-bold text-violet-500">{allKeywords.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
