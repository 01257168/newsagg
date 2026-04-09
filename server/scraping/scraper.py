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
# ... (all the model loading and configuration code remains exactly the same) ...
# ... I am omitting it here for brevity but you should keep it in your script ...


# ============================================================
# STEP 1: LOAD AI MODELS (No Changes Here)
# ============================================================
print("  Loading AI models — this takes ~2 minutes on first run...")
sentiment_model = pipeline("sentiment-analysis",
                            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                            truncation=True,
                            max_length=512)
classifier = pipeline("zero-shot-classification", 
                      model="facebook/bart-large-mnli")
ner_model = pipeline("ner", model="dslim/bert-base-NER", 
                     aggregation_strategy="simple")
print("All three AI models loaded.\n")

# ============================================================
# STEP 2: CONFIGURATION (No Changes Here)
# ============================================================
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) " "AppleWebKit/537.36 (KHTML, like Gecko) " "Chrome/122.0.0.0 Safari/537.36")
config = Config()
config.browser_user_agent = USER_AGENT
config.request_timeout = 15
SOURCE_CATEGORIES = {"Politics": "https://edition.cnn.com/politics", "Sport": "https://edition.cnn.com/sport", "Business": "https://edition.cnn.com/business"}
CATEGORY_LABELS = {"Politics": ["politics", "government", "election", "policy", "law"], "Sport": ["sports", "athletics", "game", "match", "tournament"], "Business": ["business", "economy", "finance", "market", "company"]}

SENTIMENT_NEUTRAL_THRESHOLD = 0.55
SENTIMENT_POLARITY_MARGIN = 0.10
SENTIMENT_NEUTRAL_POLARITY_CAP = 0.20


def normalize_sentiment_label(raw_label: str) -> str:
    label = str(raw_label).strip().lower()

    if "pos" in label:
        return "positive"
    if "neg" in label:
        return "negative"
    if "neu" in label:
        return "neutral"

    label_map = {
        "label_0": "negative",
        "label_1": "neutral",
        "label_2": "positive",
    }
    return label_map.get(label, "neutral")


def extract_sentiment_probabilities(raw_scores) -> dict:
    probabilities = {
        "positive": 0.0,
        "neutral": 0.0,
        "negative": 0.0,
    }

    if not isinstance(raw_scores, list):
        return probabilities

    for entry in raw_scores:
        if not isinstance(entry, dict):
            continue

        label = normalize_sentiment_label(entry.get("label", "neutral"))
        score = entry.get("score", 0.0)

        try:
            numeric_score = float(score)
        except (TypeError, ValueError):
            continue

        probabilities[label] = max(0.0, min(1.0, numeric_score))

    total = sum(probabilities.values())
    if total > 0:
        probabilities = {key: value / total for key, value in probabilities.items()}

    return probabilities


def classify_sentiment(probabilities: dict) -> tuple[str, float, float]:
    positive = probabilities.get("positive", 0.0)
    neutral = probabilities.get("neutral", 0.0)
    negative = probabilities.get("negative", 0.0)

    polarity = positive - negative
    top_label = max(probabilities, key=probabilities.get)

    if neutral >= SENTIMENT_NEUTRAL_THRESHOLD and abs(polarity) <= SENTIMENT_NEUTRAL_POLARITY_CAP:
        label = "neutral"
    elif polarity >= SENTIMENT_POLARITY_MARGIN:
        label = "positive"
    elif polarity <= -SENTIMENT_POLARITY_MARGIN:
        label = "negative"
    else:
        label = top_label

    label_confidence = probabilities.get(label, 0.0)
    if label_confidence <= 0:
        label_confidence = max(probabilities.values())

    return label, label_confidence, polarity

# ============================================================
# STEP 3: CRAWL ARTICLE LINKS (No Changes Here)
# The crawl function itself is fine. We will just ask it for more articles.
# ============================================================
def crawl_article_links(categories: dict, max_per_category: int = 15) -> list:
    # ... (function code is unchanged) ...
    results = []
    seen_urls = set()
    headers = {"User-Agent": USER_AGENT}
    JUNK_PATTERNS = re.compile(r"(getty|reuters|ap photo|shutterstock|afp|file photo|@\w+/|/x$|\.com|\.space|\bfile\b)", re.IGNORECASE)
    for category, page_url in categories.items():
        print(f"Crawling {category} ({page_url})...")
        try:
            response = requests.get(page_url, headers=headers, timeout=15)
            soup = BeautifulSoup(response.text, "html.parser")
            count = 0
            for tag in soup.find_all("a", href=True):
                href = tag["href"]
                if not (re.search(r"/\d{4}/\d{2}/\d{2}/", href) and "/video/" not in href):
                    continue
                url = ("https://edition.cnn.com" + href if href.startswith("/") else href)
                url = url.split("?")[0]
                if url in seen_urls:
                    continue
                title_hint = tag.get("aria-label", "").strip()
                if not title_hint:
                    for tag_name in ["h2", "h3", "h4", "span"]:
                        el = tag.find(tag_name)
                        if el:
                            candidate = el.get_text(strip=True)
                            if len(candidate) >= 20 and not JUNK_PATTERNS.search(candidate):
                                title_hint = candidate
                                break
                if not title_hint:
                    raw = tag.get_text(strip=True)
                    if len(raw) >= 20 and not JUNK_PATTERNS.search(raw):
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
            print(f"  Failed to crawl {category}: {e}\n")
    return results


# ============================================================
# STEP 4: AI FILTER ARTICLES (No Changes Here)
# This function is also fine, it correctly filters what it's given.
# ============================================================
def ai_filter_articles(candidates: list, confidence_threshold: float = 0.45) -> list:
    # ... (function code is unchanged) ...
    validated = []
    PHOTO_CREDIT = re.compile(r"(getty|reuters|ap photo|shutterstock|afp|\/file|@\w+)", re.IGNORECASE)
    print("validating article relevance (zero-shot classification)...")
    for item in candidates:
        title = item["title_hint"]
        if PHOTO_CREDIT.search(title):
            continue
        if len(title) < 15:
            continue
        labels = CATEGORY_LABELS[item["topic"]]
        try:
            result = classifier(title, candidate_labels=labels, multi_label=False)
            top_score = result["scores"][0]
            if top_score >= confidence_threshold:
                item["ai_relevance_score"] = round(top_score, 4)
                validated.append(item)
        except Exception:
            validated.append(item)
    print(f"\n   → AI validation complete. {len(validated)} articles passed.\n")
    return validated


# ============================================================
# STEP 5: SCRAPE + AI ENRICHMENT (No Changes Here)
# ============================================================
def process_articles(validated_items: list) -> list:
    processed = []

    for item in validated_items:
        url = item["url"]
        topic = item["topic"]

        try:
            print(f"Processing [{topic}]: {url}")

            article = Article(url, config=config)
            article.download()
            article.parse()
            article.nlp()

            text = article.text.strip()

            # ❗ Skip very short articles
            if len(text) < 300:
                print("   ⚠️  Text too short, skipping.\n")
                continue

            # ✅ FULL CONTENT (NO TRUNCATION)
            full_content = text

            # ✅ BETTER DESCRIPTION (fallback if summary is bad)
            description = article.summary.strip()
            if not description or len(description) < 50:
                description = text[:300] + "..."

            # ✅ SENTIMENT (still limit input for performance)
            try:
                raw_sentiment = sentiment_model(text[:1500], top_k=None)
            except TypeError:
                raw_sentiment = sentiment_model(text[:1500], return_all_scores=True)

            if isinstance(raw_sentiment, list) and len(raw_sentiment) > 0 and isinstance(raw_sentiment[0], list):
                raw_scores = raw_sentiment[0]
            elif isinstance(raw_sentiment, list):
                raw_scores = raw_sentiment
            else:
                raw_scores = [raw_sentiment]

            sentiment_probabilities = extract_sentiment_probabilities(raw_scores)
            sentiment_label, sentiment_score, sentiment_polarity = classify_sentiment(sentiment_probabilities)

            # ✅ NER
            raw_entities = ner_model(text[:1500])
            entities = {"persons": [], "organizations": [], "locations": []}
            type_map = {"PER": "persons", "ORG": "organizations", "LOC": "locations"}

            for ent in raw_entities:
                key = type_map.get(ent["entity_group"])
                if key and ent["word"] not in entities[key]:
                    entities[key].append(ent["word"])

            # ✅ FINAL RECORD (FULL DATA)
            record = {
                "source": {"id": "cnn", "name": "CNN"},
                "author": ", ".join(article.authors) if article.authors else "Unknown",
                "title": article.title,
                "description": description,
                "url": url,
                "urlToImage": article.top_image,
                "publishedAt": (
                    article.publish_date.isoformat()
                    if article.publish_date else datetime.now().isoformat()
                ),
                "content": full_content, 
                "sentiment": {
                    "type": sentiment_label,
                    "score": round(sentiment_score, 4),
                    "comparative": round(sentiment_polarity, 4),
                    "probabilities": {
                        "positive": round(sentiment_probabilities["positive"], 4),
                        "neutral": round(sentiment_probabilities["neutral"], 4),
                        "negative": round(sentiment_probabilities["negative"], 4),
                    },
                },
                "topic": topic,
                "keywords": article.keywords,
                "entities": entities,
                "ai_relevance": item.get("ai_relevance_score", 1.0)
            }

            processed.append(record)

            print(f"   Done. FULL article saved ({len(full_content)} chars)\n")

        except Exception as e:
            print(f"   Error: {e}\n")

    return processed

# ============================================================
# STEP 6: RUN THE PIPELINE ### THIS IS WHERE THE LOGIC CHANGES ###
# ============================================================
TARGET_PER_CATEGORY = 15
CRAWL_BUFFER = 10 # We will crawl 10 extra links (25 total) to create a buffer
final_articles_by_category = {}

print("=" * 55)
print("PHASE 1 & 2 — CRAWLING AND AI FILTERING (BY CATEGORY)")
print("=" * 55)

for category, url in SOURCE_CATEGORIES.items():
    print(f"\n--- Processing Category: {category} ---")
    # 1. Crawl MORE articles than needed for this single category
    candidates = crawl_article_links({category: url}, max_per_category=TARGET_PER_CATEGORY + CRAWL_BUFFER)

    # 2. Let the AI filter the larger list of candidates
    validated = ai_filter_articles(candidates, confidence_threshold=0.45)

    # 3. Slice the high-quality list to get the exact number you want
    final_candidates = validated[:TARGET_PER_CATEGORY]
    final_articles_by_category[category] = final_candidates
    print(f"Selected {len(final_candidates)} high-quality articles for {category}.")


# Combine all the selected articles into one list for processing
all_final_candidates = []
for cat_list in final_articles_by_category.values():
    all_final_candidates.extend(cat_list)


print("\n" + "=" * 55)
print("PHASE 3 — FINAL SCRAPING + AI ENRICHMENT")
print(f"Processing a total of {len(all_final_candidates)} articles...")
print("=" * 55)
final_data = process_articles(all_final_candidates)

# ============================================================
# STEP 7: EXPORT (No Changes Here)
# ============================================================
if final_data:
    # ... (export code is unchanged) ...
    df = pd.DataFrame(final_data)
    output = {"status": "ok", "totalResults": len(final_data), "articles": final_data, "scrapedAt": datetime.now().isoformat(), "aiModels": {"sentiment": "cardiffnlp/twitter-roberta-base-sentiment-latest", "zeroShot": "facebook/bart-large-mnli", "ner": "dslim/bert-base-NER"}}
    project_root = Path(__file__).resolve().parents[2]
    output_path = project_root / "client" / "src" / "app" / "data" / "news_data_cnn.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    print("=" * 55)
    print(f"Exported {len(final_data)} articles → {output_path}")
    print("=" * 55)
    df_sentiment = pd.Series([a["sentiment"]["type"] for a in final_data])
    print("\nSentiment distribution:")
    print(df_sentiment.value_counts().to_string())
    print("\nFirst article preview:")
    print(json.dumps(final_data[0], indent=2, default=str))
else:
    print("No articles were successfully processed.")