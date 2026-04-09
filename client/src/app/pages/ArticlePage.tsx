import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, Calendar, Globe, MapPin, User, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ImageWithFallback } from '../components/utils/ImageWithFallback';
import { ArticleSentimentPanel } from '../components/ArticleSentimentPanel';
import { getArticleById, NewsArticle, SentimentType } from '../services/newsAPI';

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

export function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const { t, isDark } = useApp();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const panelBase = isDark
    ? 'bg-slate-800/80 border-slate-700/50 backdrop-blur-md'
    : 'bg-white/85 border-white/60 backdrop-blur-md';

  const mutedText = isDark ? 'text-slate-400' : 'text-gray-500';
  const bodyText = isDark ? 'text-slate-200' : 'text-gray-700';

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
          <Link
            to="/"
            className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'}`}
          >
            <ArrowLeft size={16} />
            {t.backToHome}
          </Link>
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
        <Link
          to="/"
          className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'}`}
        >
          <ArrowLeft size={16} />
          {t.backToHome}
        </Link>
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
