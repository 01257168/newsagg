import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, Calendar, Clock3, Globe, MapPin, Tag, TrendingUp, User, Users } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { ImageWithFallback } from '../components/utils/ImageWithFallback';
import { ArticleSentimentPanel } from '../components/ArticleSentimentPanel';
import {
  getAllArticles,
  getArticleById,
  getArticleId,
  getLiveEngagement,
  getSentimentDistribution,
  getTrendingKeywords,
  NewsArticle,
  NewsCategoryFilter,
  SentimentType,
} from '../services/newsAPI';

const SENTIMENT_STYLE: Record<SentimentType, { label: string; badge: string }> = {
  positive: {
    label: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  neutral: {
    label: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-700',
  },
  negative: {
    label: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
  },
};

const SENTIMENT_BAR_STYLE: Record<SentimentType, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-gray-500',
  negative: 'bg-red-500',
};

const SENTIMENT_CHART_COLORS: Record<SentimentType, string> = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
};

const TOPIC_TO_CATEGORY: Record<NewsArticle['topic'], NewsCategoryFilter> = {
  Politics: 'politics',
  Sport: 'sport',
  Business: 'business',
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

const formatPublishedDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
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

interface EntityBlockProps {
  title: string;
  values: string[];
  icon: ReactNode;
  isDark: boolean;
}

function EntityBlock({ title, values, icon, isDark }: EntityBlockProps) {
  return (
    <div>
      <h4 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
        {icon}
        {title}
      </h4>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={`${title}-${value}`}
              className={`px-2.5 py-1 rounded-full text-xs ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>None listed</p>
      )}
    </div>
  );
}

function SentimentTooltip({ active, payload, total, isDark }: any) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = Number(payload[0].value ?? 0);
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`px-3 py-2 rounded-lg text-xs shadow-lg ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-800 border border-gray-100'}`}>
      <p className="font-semibold">{payload[0].name}</p>
      <p>{value} articles ({percentage}%)</p>
    </div>
  );
}

export function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, isDark } = useApp();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());

  const handleBackToHome = () => {
    const historyIndex = window.history.state?.idx ?? 0;
    if (historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Article reference is missing.');
      return;
    }

    const foundArticle = getArticleById(id);
    setArticle(foundArticle);
    setError(foundArticle ? null : 'Article not found in the current dataset.');
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 12_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const panelBase = isDark
    ? 'bg-slate-800/80 border-slate-700/50 backdrop-blur-md'
    : 'bg-white/85 border-white/60 backdrop-blur-md';

  const mutedText = isDark ? 'text-slate-400' : 'text-gray-500';
  const bodyText = isDark ? 'text-slate-200' : 'text-gray-700';

  const articleCategory: NewsCategoryFilter = article ? TOPIC_TO_CATEGORY[article.topic] : 'all';

  const categorySentimentDistribution = useMemo(
    () => getSentimentDistribution(articleCategory),
    [articleCategory]
  );

  const categorySentimentTotal = useMemo(
    () => categorySentimentDistribution.reduce((sum, item) => sum + item.count, 0),
    [categorySentimentDistribution]
  );

  const categorySentimentChartData = useMemo(
    () => categorySentimentDistribution.map((item) => ({
      type: item.type,
      name: t[item.type],
      value: item.count,
      color: SENTIMENT_CHART_COLORS[item.type],
    })),
    [categorySentimentDistribution, t]
  );

  const categoryArticles = useMemo(
    () => getAllArticles(articleCategory),
    [articleCategory]
  );

  const categoryTrendingKeywords = useMemo(
    () => getTrendingKeywords(8, articleCategory),
    [articleCategory]
  );

  const categoryMaxKeywordCount = useMemo(
    () => categoryTrendingKeywords.reduce((max, item) => Math.max(max, item.count), 1),
    [categoryTrendingKeywords]
  );

  const categoryLiveEngagement = useMemo(
    () => getLiveEngagement(tick, 6, articleCategory),
    [tick, articleCategory]
  );

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto">
        <div className={`flex flex-col items-center justify-center py-20 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
          <div className="animate-spin text-3xl mb-4">⏳</div>
          <p className="text-lg font-medium">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <button
            type="button"
            onClick={handleBackToHome}
            className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'}`}
          >
            <ArrowLeft size={16} />
            {t.backToHome}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-center py-20 rounded-2xl border ${panelBase}`}
        >
          <div className="text-6xl mb-4">📰</div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Article Not Found</h2>
          <p className={`mb-6 ${mutedText}`}>{error}</p>
          <Link
            to="/"
            className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all"
          >
            Go to Homepage
          </Link>
        </motion.div>
      </div>
    );
  }

  const sentimentStyle = SENTIMENT_STYLE[article.sentiment.type];

  return (
    <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
        <button
          type="button"
          onClick={handleBackToHome}
          className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'}`}
        >
          <ArrowLeft size={16} />
          {t.backToHome}
        </button>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="min-w-0"
        >
          <div className="relative rounded-2xl overflow-hidden h-72 md:h-96 mb-5 shadow-lg">
            <ImageWithFallback
              src={article.urlToImage || undefined}
              alt={article.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-600 text-white">
                {article.topic}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sentimentStyle.badge}`}>
                {article.sentiment.type}
              </span>
            </div>
          </div>

          <h1 className={`leading-tight mb-4 ${isDark ? 'text-slate-50' : 'text-gray-900'}`} style={{ fontFamily: 'Poppins, sans-serif', fontSize: '2rem', fontWeight: 700 }}>
            {article.title}
          </h1>

          <div className={`flex flex-wrap items-center gap-4 pb-4 mb-6 border-b text-sm ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
            <div className="flex items-center gap-1.5">
              <User size={14} className={mutedText} />
              <span className={bodyText}>{article.author || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className={mutedText} />
              <span className={bodyText}>{formatPublishedDate(article.publishedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe size={14} className={mutedText} />
              <span className={bodyText}>{article.source.name}</span>
            </div>
          </div>

          {article.description && (
            <p className={`text-lg leading-relaxed mb-5 ${bodyText}`}>
              {article.description}
            </p>
          )}

          <div className={`whitespace-pre-line leading-relaxed mb-8 ${bodyText}`} style={{ fontSize: '1rem', lineHeight: '1.8' }}>
            {article.content || 'No content provided.'}
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <p className={`text-sm mb-3 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
              Read the original source:
            </p>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all text-sm"
            >
              {article.source.name}
            </a>
          </div>
        </motion.article>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="space-y-4"
        >
          <ArticleSentimentPanel article={article} isDark={isDark} />

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
              Category Sentiment Distribution
            </h3>

            <p className={`text-xs mb-4 ${mutedText}`}>
              {article.topic} articles in current dataset
            </p>

            <div className="h-[140px] w-full mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySentimentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={58}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categorySentimentChartData.map((item) => (
                      <Cell key={`article-category-sentiment-${item.type}`} fill={item.color} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<SentimentTooltip isDark={isDark} total={categorySentimentTotal} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2.5">
              {categorySentimentDistribution.map((item) => {
                const percentage = categorySentimentTotal > 0
                  ? Math.round((item.count / categorySentimentTotal) * 100)
                  : 0;

                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-16 text-xs ${mutedText}`}>{t[item.type]}</span>
                      <div className={`h-2 rounded-full overflow-hidden flex-1 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                        <div
                          className={`h-full rounded-full ${SENTIMENT_BAR_STYLE[item.type]}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${SENTIMENT_STYLE[item.type].label}`}>
                        {item.count} ({percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 text-xs">
              <span className={mutedText}>Total in category</span>
              <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                {categorySentimentTotal}
              </span>
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
              <Tag size={14} className="text-cyan-500" />
              Article Keywords
            </h3>

            {article.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((keyword) => (
                  <span
                    key={`keyword-${keyword}`}
                    className={`px-2.5 py-1 rounded-full text-xs ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}
                  >
                    #{keyword}
                  </span>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                No keywords extracted for this article.
              </p>
            )}
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <TrendingUp size={13} className="text-white" />
              </div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                Trending Topics ({article.topic})
              </h3>
            </div>

            <div className="space-y-2">
              {categoryTrendingKeywords.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noResults}</p>
              ) : (
                categoryTrendingKeywords.map((topic, index) => (
                  <div key={`${article.topic}-${topic.keyword}`} className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-4 ${mutedText}`}>{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>{topic.keyword}</span>
                        <span className={`text-xs ${mutedText}`}>{topic.count}</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(topic.count / categoryMaxKeywordCount) * 100}%`,
                            background: '#06b6d4',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <Clock3 size={13} className="text-white" />
                </div>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Live View ({article.topic})
                </h3>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                {categoryArticles.length} articles
              </span>
            </div>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {categoryArticles.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noResults}</p>
              ) : (
                categoryArticles.map((categoryArticle) => (
                  <Link
                    key={categoryArticle.url}
                    to={`/article/${getArticleId(categoryArticle)}`}
                    className={`block rounded-xl p-2.5 transition-colors ${isDark ? 'hover:bg-slate-700/60' : 'hover:bg-gray-50'}`}
                  >
                    <p className={`text-sm font-medium line-clamp-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                      {categoryArticle.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                      <span className={mutedText}>{formatRelativeTime(categoryArticle.publishedAt)}</span>
                      <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>•</span>
                      <span className={sentimentTextClass[categoryArticle.sentiment.type]}>{categoryArticle.sentiment.type}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Users size={13} className="text-white" />
              </div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                Live Engagement ({article.topic})
              </h3>
            </div>

            <div className="space-y-2.5">
              {categoryLiveEngagement.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noResults}</p>
              ) : (
                categoryLiveEngagement.map((item) => (
                  <Link
                    key={item.articleId}
                    to={`/article/${item.articleId}`}
                    className={`block rounded-xl p-2.5 transition-colors ${isDark ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-gray-50/90 hover:bg-gray-100'}`}
                  >
                    <p className={`text-sm font-medium line-clamp-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap">
                      <span className={`${sentimentPillClass[item.sentiment]} px-2 py-0.5 rounded-full`}>{item.sentiment}</span>
                      <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>•</span>
                      <span className={mutedText}>{formatRelativeTime(item.publishedAt)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div>
                        <p className={mutedText}>Views</p>
                        <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{formatCount(item.views)}</p>
                      </div>
                      <div>
                        <p className={mutedText}>Likes</p>
                        <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{formatCount(item.likes)}</p>
                      </div>
                      <div>
                        <p className={mutedText}>Interactions</p>
                        <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{formatCount(item.interactions)}</p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${panelBase}`}>
            <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
              Entities
            </h3>

            <div className="space-y-4">
              <EntityBlock
                title="Persons"
                values={article.entities.persons}
                icon={<Users size={14} className="text-cyan-500" />}
                isDark={isDark}
              />
              <EntityBlock
                title="Organizations"
                values={article.entities.organizations}
                icon={<Building2 size={14} className="text-cyan-500" />}
                isDark={isDark}
              />
              <EntityBlock
                title="Locations"
                values={article.entities.locations}
                icon={<MapPin size={14} className="text-cyan-500" />}
                isDark={isDark}
              />
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
