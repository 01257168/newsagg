import requests
from bs4 import BeautifulSoup
import re
import nltk
from newspaper import Article, Config
from transformers import pipeline
from datetime import datetime
import pandas as pd
import json
from pathlib import Path

nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

# ============================================================
# STEP 1: LOAD AI MODELS
# ============================================================
print("⚙️  Loading AI models — this takes ~2 minutes on first run...")
sentiment_model = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    truncation=True,
    max_length=512,
    # top_k=None  → returns ALL label scores (positive + neutral + negative)
    top_k=None,
)
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
ner_model   = pipeline("ner", model="dslim/bert-base-NER", aggregation_strategy="simple")
print("✅ All three AI models loaded.\n")

# ============================================================
# STEP 2: CONFIGURATION
# ============================================================
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)
config = Config()
config.browser_user_agent = USER_AGENT
config.request_timeout = 15

SOURCE_CATEGORIES = {
    "Politics": "https://edition.cnn.com/politics",
    "Sport":    "https://edition.cnn.com/sport",
    "Business": "https://edition.cnn.com/business",
}
CATEGORY_LABELS = {
    "Politics": ["politics", "government", "election", "policy", "law"],
    "Sport":    ["sports", "athletics", "game", "match", "tournament"],
    "Business": ["business", "economy", "finance", "market", "company"],
}

# ── Sentiment tuning knobs ──────────────────────────────────
# An article is "neutral" when:
#   • neutral probability ≥ NEUTRAL_THRESHOLD  AND
#   • |positive − negative| ≤ NEUTRAL_POLARITY_CAP
# Otherwise we follow the polarity direction, but only if the
# margin between pos and neg is ≥ POLARITY_MARGIN.
NEUTRAL_THRESHOLD   = 0.52   # neutral prob must be this high
NEUTRAL_POLARITY_CAP = 0.18  # polarity must be small for "neutral"
POLARITY_MARGIN     = 0.10   # pos-neg gap needed to call pos/neg


# ============================================================
# SENTIMENT HELPERS
# ============================================================

def normalize_label(raw: str) -> str:
    """
    cardiffnlp model may return "Positive", "Negative", "Neutral",
    or legacy "LABEL_0/1/2".  Normalise everything to lowercase string.
    """
    s = str(raw).strip().lower()
    if "pos" in s:   return "positive"
    if "neg" in s:   return "negative"
    if "neu" in s:   return "neutral"
    return {"label_0": "negative", "label_1": "neutral", "label_2": "positive"}.get(s, "neutral")


def extract_probs(raw_output) -> dict:
    """
    pipeline(..., top_k=None) returns a list of dicts like:
      [{"label": "positive", "score": 0.72}, ...]
    Flatten, normalise keys, re-normalise so probs sum to 1.
    """
    probs = {"positive": 0.0, "neutral": 0.0, "negative": 0.0}

    # pipeline top_k=None can return [[{...}]] or [{...}]
    rows = raw_output
    if isinstance(rows, list) and rows and isinstance(rows[0], list):
        rows = rows[0]

    for entry in rows:
        if not isinstance(entry, dict):
            continue
        key = normalize_label(entry.get("label", "neutral"))
        try:
            probs[key] = max(0.0, min(1.0, float(entry["score"])))
        except (KeyError, TypeError, ValueError):
            pass

    total = sum(probs.values())
    if total > 0:
        probs = {k: v / total for k, v in probs.items()}
    return probs


def classify(probs: dict) -> tuple[str, float, float]:
    """
    Returns (label, confidence, polarity).

    • polarity  = P(positive) − P(negative)   ∈ [−1, 1]
    • confidence = P(predicted label)           ∈ [0, 1]

    Decision logic:
      1. If neutral prob is high AND polarity is small  → "neutral"
      2. Else follow polarity direction if margin is big enough
      3. Else pick the highest-prob label as a fallback
    """
    pos = probs.get("positive", 0.0)
    neu = probs.get("neutral",  0.0)
    neg = probs.get("negative", 0.0)
    polarity = pos - neg

    if neu >= NEUTRAL_THRESHOLD and abs(polarity) <= NEUTRAL_POLARITY_CAP:
        label = "neutral"
    elif polarity >=  POLARITY_MARGIN:
        label = "positive"
    elif polarity <= -POLARITY_MARGIN:
        label = "negative"
    else:
        # polarity is ambiguous — fall back to highest probability
        label = max(probs, key=probs.get)

    confidence = probs.get(label, max(probs.values()))
    return label, round(confidence, 4), round(polarity, 4)


# ============================================================
# STEP 3: CRAWL ARTICLE LINKS
# ============================================================
def crawl_article_links(categories: dict, max_per_category: int = 15) -> list:
    results   = []
    seen_urls = set()
    headers   = {"User-Agent": USER_AGENT}
    JUNK = re.compile(
        r"(getty|reuters|ap photo|shutterstock|afp|file photo|@\w+/|/x$|\.com|\.space|\bfile\b)",
        re.IGNORECASE,
    )

    for category, page_url in categories.items():
        print(f"🔍 Crawling {category} ({page_url})...")
        try:
            resp = requests.get(page_url, headers=headers, timeout=15)
            soup = BeautifulSoup(resp.text, "html.parser")
            count = 0

            for tag in soup.find_all("a", href=True):
                href = tag["href"]
                if not (re.search(r"/\d{4}/\d{2}/\d{2}/", href) and "/video/" not in href):
                    continue

                url = ("https://edition.cnn.com" + href if href.startswith("/") else href).split("?")[0]
                if url in seen_urls:
                    continue

                title_hint = tag.get("aria-label", "").strip()
                if not title_hint:
                    for tag_name in ["h2", "h3", "h4", "span"]:
                        el = tag.find(tag_name)
                        if el:
                            candidate = el.get_text(strip=True)
                            if len(candidate) >= 20 and not JUNK.search(candidate):
                                title_hint = candidate
                                break
                if not title_hint:
                    raw = tag.get_text(strip=True)
                    if len(raw) >= 20 and not JUNK.search(raw):
                        title_hint = raw
                if not title_hint:
                    continue

                seen_urls.add(url)
                results.append({"url": url, "topic": category, "title_hint": title_hint})
                count += 1
                if count >= max_per_category:
                    break

            print(f"   → Found {count} candidate URLs for {category}\n")
        except Exception as e:
            print(f"   ❌ Failed to crawl {category}: {e}\n")

    return results


# ============================================================
# STEP 4: AI FILTER ARTICLES
# ============================================================
def ai_filter_articles(candidates: list, confidence_threshold: float = 0.45) -> list:
    validated   = []
    PHOTO_CREDIT = re.compile(r"(getty|reuters|ap photo|shutterstock|afp|\/file|@\w+)", re.IGNORECASE)
    print("🤖 Validating article relevance (zero-shot classification)...")

    for item in candidates:
        title = item["title_hint"]
        if PHOTO_CREDIT.search(title) or len(title) < 15:
            continue
        labels = CATEGORY_LABELS[item["topic"]]
        try:
            result    = classifier(title, candidate_labels=labels, multi_label=False)
            top_score = result["scores"][0]
            if top_score >= confidence_threshold:
                item["ai_relevance_score"] = round(top_score, 4)
                validated.append(item)
        except Exception:
            validated.append(item)   # include on classifier error

    print(f"\n   → AI validation complete. {len(validated)} articles passed.\n")
    return validated


# ============================================================
# STEP 5: SCRAPE + AI ENRICHMENT
# ============================================================
def process_articles(validated_items: list) -> list:
    processed = []

    for item in validated_items:
        url   = item["url"]
        topic = item["topic"]

        try:
            print(f"⚙️  Processing [{topic}]: {url}")

            article = Article(url, config=config)
            article.download()
            article.parse()
            article.nlp()

            text = article.text.strip()
            if len(text) < 300:
                print("   ⚠️  Text too short, skipping.\n")
                continue

            # ── Description fallback ──────────────────────────
            description = article.summary.strip()
            if not description or len(description) < 50:
                description = text[:300] + "..."

            # ── Sentiment ─────────────────────────────────────
            # Use first ~1 500 chars for performance; model is capped at 512 tokens anyway.
            raw_sentiment = sentiment_model(text[:1500])
            probs         = extract_probs(raw_sentiment)
            label, confidence, polarity = classify(probs)

            # ── NER ───────────────────────────────────────────
            raw_ents = ner_model(text[:1500])
            entities = {"persons": [], "organizations": [], "locations": []}
            type_map = {"PER": "persons", "ORG": "organizations", "LOC": "locations"}
            for ent in raw_ents:
                key = type_map.get(ent["entity_group"])
                if key and ent["word"] not in entities[key]:
                    entities[key].append(ent["word"])

            record = {
                "source":      {"id": "cnn", "name": "CNN"},
                "author":      ", ".join(article.authors) if article.authors else "Unknown",
                "title":       article.title,
                "description": description,
                "url":         url,
                "urlToImage":  article.top_image,
                "publishedAt": (
                    article.publish_date.isoformat()
                    if article.publish_date else datetime.now().isoformat()
                ),
                "content":     text,
                # ── Sentiment block ──────────────────────────
                # • type         : "positive" | "neutral" | "negative"
                # • score        : confidence of the predicted label  (0–1)
                # • comparative  : polarity = P(pos) − P(neg)         (−1 to 1)
                # • probabilities: all three raw probabilities
                "sentiment": {
                    "type":        label,
                    "score":       confidence,
                    "comparative": polarity,
                    "probabilities": {
                        "positive": round(probs["positive"], 4),
                        "neutral":  round(probs["neutral"],  4),
                        "negative": round(probs["negative"], 4),
                    },
                },
                "topic":        topic,
                "keywords":     article.keywords,
                "entities":     entities,
                "ai_relevance": item.get("ai_relevance_score", 1.0),
            }

            processed.append(record)
            print(
                f"   ✅ {label.upper()} | conf={confidence:.2f} | "
                f"polarity={polarity:+.2f} | "
                f"P={probs['positive']:.2f} N={probs['neutral']:.2f} Ng={probs['negative']:.2f} | "
                f"{len(text)} chars\n"
            )

        except Exception as e:
            print(f"   ❌ Error: {e}\n")

    return processed


# ============================================================
# STEP 6: RUN THE PIPELINE
# ============================================================
TARGET_PER_CATEGORY = 15
CRAWL_BUFFER        = 10
final_articles_by_category: dict = {}

print("=" * 55)
print("PHASE 1 & 2 — CRAWLING AND AI FILTERING (BY CATEGORY)")
print("=" * 55)

for category, url in SOURCE_CATEGORIES.items():
    print(f"\n--- Processing Category: {category} ---")
    candidates      = crawl_article_links({category: url}, max_per_category=TARGET_PER_CATEGORY + CRAWL_BUFFER)
    validated       = ai_filter_articles(candidates, confidence_threshold=0.45)
    final_candidates = validated[:TARGET_PER_CATEGORY]
    final_articles_by_category[category] = final_candidates
    print(f"➡️  Selected {len(final_candidates)} high-quality articles for {category}.")

all_final_candidates = [art for cat_list in final_articles_by_category.values() for art in cat_list]

print("\n" + "=" * 55)
print("PHASE 3 — FINAL SCRAPING + AI ENRICHMENT")
print(f"Processing a total of {len(all_final_candidates)} articles...")
print("=" * 55)
final_data = process_articles(all_final_candidates)

# ============================================================
# STEP 7: EXPORT
# ============================================================
if final_data:
    df     = pd.DataFrame(final_data)
    output = {
        "status":       "ok",
        "totalResults": len(final_data),
        "articles":     final_data,
        "scrapedAt":    datetime.now().isoformat(),
        "aiModels": {
            "sentiment": "cardiffnlp/twitter-roberta-base-sentiment-latest",
            "zeroShot":  "facebook/bart-large-mnli",
            "ner":       "dslim/bert-base-NER",
        },
    }

    project_root = Path(__file__).resolve().parents[2]
    output_path  = project_root / "client" / "src" / "app" / "data" / "news_data_cnn.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)

    print("=" * 55)
    print(f"✅ Exported {len(final_data)} articles → {output_path}")
    print("=" * 55)

    df_sentiment = pd.Series([a["sentiment"]["type"] for a in final_data])
    print("\n📊 Sentiment distribution:")
    print(df_sentiment.value_counts().to_string())
    print("\n📄 First article preview:")
    print(json.dumps(final_data[0], indent=2, default=str))
else:
    print("No articles were successfully processed.")