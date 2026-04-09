import newsData from '../data/news_data_cnn.json';

export const SUPPORTED_TOPICS = ['Politics', 'Sport', 'Business'] as const;
export type NewsTopic = (typeof SUPPORTED_TOPICS)[number];
export type NewsCategoryFilter = 'all' | 'politics' | 'sport' | 'business';
export type SentimentType = 'positive' | 'neutral' | 'negative';

export interface NewsSentimentProbabilities {
    positive: number;
    neutral: number;
    negative: number;
}

export interface NewsSentiment {
    type: SentimentType;
    score: number;
    comparative: number;
    probabilities: NewsSentimentProbabilities;
}

export interface NewsEntities {
    persons: string[];
    organizations: string[];
    locations: string[];
}

export interface NewsArticle {
    source: {
        id: string | null;
        name: string;
    };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
    sentiment: NewsSentiment;
    topic: NewsTopic;
    keywords: string[];
    entities: NewsEntities;
    ai_relevance?: number;
}

export interface NewsApiResponse {
    status: string;
    totalResults: number;
    articles: NewsArticle[];
}

export interface ServerResponse {
    status: number;
    success: boolean;
    message: string;
    data?: NewsApiResponse;
    error?: string;
}

export interface SentimentDistributionItem {
    type: SentimentType;
    count: number;
}

export interface TrendingKeyword {
    keyword: string;
    count: number;
}

export interface LiveEngagementItem {
    articleId: string;
    title: string;
    topic: NewsTopic;
    sentiment: SentimentType;
    publishedAt: string;
    views: number;
    likes: number;
    interactions: number;
}

interface RawNewsData {
    status?: string;
    articles?: unknown[];
}

const TOPIC_MAP: Record<NewsCategoryFilter, NewsTopic | null> = {
    all: null,
    politics: 'Politics',
    sport: 'Sport',
    business: 'Business',
};

const SENTIMENT_TYPES: SentimentType[] = ['positive', 'neutral', 'negative'];

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const clampSignedUnit = (value: number): number => Math.max(-1, Math.min(1, value));

const asStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const normalizeCategory = (category: string): NewsCategoryFilter => {
    const normalized = category.toLowerCase();
    if (normalized === 'politics') {
        return 'politics';
    }
    if (normalized === 'sport' || normalized === 'sports') {
        return 'sport';
    }
    if (normalized === 'business') {
        return 'business';
    }
    return 'all';
};

const normalizeTopic = (topic: unknown): NewsTopic | null => {
    if (typeof topic !== 'string') {
        return null;
    }

    const normalized = topic.toLowerCase();
    if (normalized === 'politics') {
        return 'Politics';
    }
    if (normalized === 'sport' || normalized === 'sports') {
        return 'Sport';
    }
    if (normalized === 'business') {
        return 'Business';
    }
    return null;
};

const normalizeSentiment = (value: unknown): NewsSentiment => {
    const rawType =
        typeof value === 'object' && value !== null && 'type' in value
            ? String((value as { type: unknown }).type).toLowerCase()
            : 'neutral';

    const type: SentimentType = SENTIMENT_TYPES.includes(rawType as SentimentType)
        ? (rawType as SentimentType)
        : 'neutral';

    const score =
        typeof value === 'object' &&
            value !== null &&
            'score' in value &&
            typeof (value as { score: unknown }).score === 'number'
            ? clampUnit((value as { score: number }).score)
            : 0;

    const comparative =
        typeof value === 'object' &&
            value !== null &&
            'comparative' in value &&
            typeof (value as { comparative: unknown }).comparative === 'number'
            ? clampSignedUnit((value as { comparative: number }).comparative)
            : 0;

    const rawProbabilities =
        typeof value === 'object' &&
            value !== null &&
            'probabilities' in value &&
            typeof (value as { probabilities: unknown }).probabilities === 'object'
            ? ((value as { probabilities: Record<string, unknown> }).probabilities ?? {})
            : {};

    let probabilities: NewsSentimentProbabilities = {
        positive: typeof rawProbabilities.positive === 'number' ? clampUnit(rawProbabilities.positive) : 0,
        neutral: typeof rawProbabilities.neutral === 'number' ? clampUnit(rawProbabilities.neutral) : 0,
        negative: typeof rawProbabilities.negative === 'number' ? clampUnit(rawProbabilities.negative) : 0,
    };

    const probabilityTotal = probabilities.positive + probabilities.neutral + probabilities.negative;
    if (probabilityTotal > 0) {
        probabilities = {
            positive: probabilities.positive / probabilityTotal,
            neutral: probabilities.neutral / probabilityTotal,
            negative: probabilities.negative / probabilityTotal,
        };
    } else if (type === 'positive') {
        probabilities = {
            positive: score,
            neutral: 1 - score,
            negative: 0,
        };
    } else if (type === 'negative') {
        probabilities = {
            positive: 0,
            neutral: 1 - score,
            negative: score,
        };
    } else {
        const split = (1 - score) / 2;
        probabilities = {
            positive: split,
            neutral: score,
            negative: split,
        };
    }

    return { type, score, comparative, probabilities };
};

const normalizeArticle = (article: unknown): NewsArticle | null => {
    if (!article || typeof article !== 'object') {
        return null;
    }

    const raw = article as Record<string, unknown>;
    const topic = normalizeTopic(raw.topic);

    if (!topic) {
        return null;
    }

    const rawSource = (raw.source as Record<string, unknown> | undefined) ?? {};
    const rawEntities = (raw.entities as Record<string, unknown> | undefined) ?? {};
    const publishedAt = typeof raw.publishedAt === 'string' ? raw.publishedAt : new Date(0).toISOString();

    return {
        source: {
            id: typeof rawSource.id === 'string' ? rawSource.id : null,
            name: typeof rawSource.name === 'string' ? rawSource.name : 'Unknown Source',
        },
        author: typeof raw.author === 'string' ? raw.author : null,
        title: typeof raw.title === 'string' ? raw.title : 'Untitled',
        description: typeof raw.description === 'string' ? raw.description : null,
        url: typeof raw.url === 'string' ? raw.url : '',
        urlToImage: typeof raw.urlToImage === 'string' ? raw.urlToImage : null,
        publishedAt,
        content: typeof raw.content === 'string' ? raw.content : null,
        sentiment: normalizeSentiment(raw.sentiment),
        topic,
        keywords: asStringArray(raw.keywords),
        entities: {
            persons: asStringArray(rawEntities.persons),
            organizations: asStringArray(rawEntities.organizations),
            locations: asStringArray(rawEntities.locations),
        },
        ai_relevance: typeof raw.ai_relevance === 'number' ? raw.ai_relevance : undefined,
    };
};

const stableHash = (value: string): number => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
};

const parsedNewsData = newsData as RawNewsData;

const normalizedArticles = (parsedNewsData.articles ?? [])
    .map(normalizeArticle)
    .filter((article): article is NewsArticle => article !== null)
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());

const newsStatus = parsedNewsData.status ?? 'ok';

const paginateArticles = (articles: NewsArticle[], pageSize: number, page: number): NewsArticle[] => {
    const safePageSize = pageSize > 0 ? pageSize : 20;
    const safePage = page > 0 ? page : 1;
    const startIndex = (safePage - 1) * safePageSize;
    const endIndex = startIndex + safePageSize;
    return articles.slice(startIndex, endIndex);
};

const filterByCategory = (articles: NewsArticle[], category: string): NewsArticle[] => {
    const normalizedCategory = normalizeCategory(category);
    const expectedTopic = TOPIC_MAP[normalizedCategory];
    if (!expectedTopic) {
        return articles;
    }
    return articles.filter((article) => article.topic === expectedTopic);
};

const buildSuccessResponse = (
    articles: NewsArticle[],
    message: string,
    pageSize: number,
    page: number
): ServerResponse => {
    const paginatedArticles = paginateArticles(articles, pageSize, page);

    return {
        status: 200,
        success: true,
        message,
        data: {
            status: newsStatus,
            totalResults: articles.length,
            articles: paginatedArticles,
        },
    };
};

const buildFailureResponse = (message: string, error: unknown): ServerResponse => ({
    status: 500,
    success: false,
    message,
    error: error instanceof Error ? error.message : 'Unknown error',
});

export const getAllArticles = (): NewsArticle[] => [...normalizedArticles];

export const getArticleId = (article: Pick<NewsArticle, 'url' | 'title'>): string =>
    encodeURIComponent(article.url || article.title);

export const getArticleById = (articleId: string): NewsArticle | null => {
    try {
        const decoded = decodeURIComponent(articleId);
        return normalizedArticles.find((article) => article.url === decoded || article.title === decoded) ?? null;
    } catch {
        return null;
    }
};

export const getSentimentDistribution = (): SentimentDistributionItem[] => {
    const counts: Record<SentimentType, number> = {
        positive: 0,
        neutral: 0,
        negative: 0,
    };

    normalizedArticles.forEach((article) => {
        counts[article.sentiment.type] += 1;
    });

    return SENTIMENT_TYPES.map((type) => ({
        type,
        count: counts[type],
    }));
};

export const getLatestArticles = (limit = 6): NewsArticle[] =>
    normalizedArticles.slice(0, Math.max(0, limit));

export const getTrendingKeywords = (limit = 10): TrendingKeyword[] => {
    const keywordMap = new Map<string, number>();

    normalizedArticles.forEach((article) => {
        article.keywords.forEach((keyword) => {
            const normalized = keyword.toLowerCase();
            keywordMap.set(normalized, (keywordMap.get(normalized) ?? 0) + 1);
        });
    });

    return [...keywordMap.entries()]
        .sort((left, right) => {
            if (right[1] === left[1]) {
                return left[0].localeCompare(right[0]);
            }
            return right[1] - left[1];
        })
        .slice(0, Math.max(0, limit))
        .map(([keyword, count]) => ({ keyword, count }));
};

export const getLiveEngagement = (timestamp = Date.now(), limit = 8): LiveEngagementItem[] => {
    const tick = timestamp / 10000;

    return normalizedArticles
        .map((article) => {
            const seed = stableHash(article.title);
            const baseViews = 1200 + (seed % 8500);
            const baseLikes = 220 + (seed % 2200);
            const baseInteractions = 480 + (seed % 3400);
            const phase = tick + (seed % 37);

            return {
                articleId: getArticleId(article),
                title: article.title,
                topic: article.topic,
                sentiment: article.sentiment.type,
                publishedAt: article.publishedAt,
                views: Math.max(0, Math.round(baseViews + Math.sin(phase) * 280)),
                likes: Math.max(0, Math.round(baseLikes + Math.cos(phase * 1.1) * 95)),
                interactions: Math.max(0, Math.round(baseInteractions + Math.sin(phase * 0.9) * 140)),
            };
        })
        .sort((left, right) => right.interactions - left.interactions)
        .slice(0, Math.max(0, limit));
};

export const newsAPI = {
    getAllNews: async (pageSize = 40, page = 1): Promise<ServerResponse> => {
        try {
            return buildSuccessResponse(normalizedArticles, 'Articles fetched successfully', pageSize, page);
        } catch (error) {
            return buildFailureResponse('Failed to fetch articles', error);
        }
    },

    getTopHeadlines: async (
        category = 'all',
        pageSize = 80,
        page = 1
    ): Promise<ServerResponse> => {
        try {
            const articles = filterByCategory(normalizedArticles, category);
            return buildSuccessResponse(articles, 'Top headlines fetched successfully', pageSize, page);
        } catch (error) {
            return buildFailureResponse('Failed to fetch headlines', error);
        }
    },

    getCountryHeadlines: async (
        _countryCode: string,
        pageSize = 80,
        page = 1
    ): Promise<ServerResponse> => {
        try {
            return buildSuccessResponse(normalizedArticles, 'Country headlines fetched successfully', pageSize, page);
        } catch (error) {
            return buildFailureResponse('Failed to fetch country headlines', error);
        }
    },
};
