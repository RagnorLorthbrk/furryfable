import fs from "fs";
import axios from "axios";
import slugify from "slugify";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

function getExistingBlogSlugs() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.startsWith("blog-") && f.endsWith(".html"))
    .map(f => f.replace("blog-", "").replace(".html", ""));
}

async function generateRawTopic(existingTitles = []) {
  const month = new Date().getUTCMonth() + 1;
  const currentYear = new Date().getFullYear();
  let season = "winter";
  if ([3, 4, 5].includes(month)) season = "spring";
  else if ([6, 7, 8].includes(month)) season = "summer";
  else if ([9, 10, 11].includes(month)) season = "autumn";

  const recentTitles = existingTitles.slice(-20).join("\n- ");

  const prompt = `
You are an advanced SEO keyword strategist and GEO (Generative Engine Optimization) expert for FurryFable.com.

Website: https://www.furryfable.com
Niche: Premium Dogs & Cats products and care
Target: Pet parents in USA & Canada
Season: ${season} ${currentYear}
Collections: pet toys, pet water bottles, pet apparel, harness & leash

ALREADY PUBLISHED (DO NOT REPEAT):
- ${recentTitles || "None yet"}

YOUR TASK: Generate ONE blog topic optimized for BOTH traditional search AND AI engine citations.

TOPIC SELECTION STRATEGY:
1. TARGET "People Also Ask" questions — topics Google shows in PAA boxes
2. TARGET AI-answerable queries — questions users ask ChatGPT, Gemini, Perplexity about pets
3. FOCUS on high-intent informational queries that lead to product discovery
4. CONSIDER seasonal relevance for ${season}
5. INCLUDE long-tail keyword (3-5 words) as primary keyword
6. AIM for low-medium competition keywords that a newer site can rank for

TOPIC CATEGORIES TO ROTATE THROUGH:
- Buying guides ("Best X for Y")
- How-to guides ("How to X for Your Dog/Cat")
- Comparison posts ("X vs Y: Which is Better for Your Pet")
- Seasonal care guides
- Problem-solving content ("Why Does My Dog/Cat X")
- Data/trend posts ("X Statistics & Trends in ${currentYear}")
- Size/measurement guides
- Breed-specific care
- New pet owner guides

Respond ONLY in strict JSON:
{
  "title": "SEO-optimized blog title (include primary keyword naturally, max 60 chars)",
  "primaryKeyword": "long-tail keyword (3-5 words, high search intent)",
  "imageTheme": "realistic lifestyle pet photo description for this topic",
  "searchIntent": "informational|commercial|navigational",
  "targetPAA": "a People Also Ask question this post will answer",
  "geoQuery": "a question an AI chatbot user would ask that this answers"
}

Rules:
- No markdown
- No explanation
- No arrays
- Title must be compelling, human-readable, and blog-ready
- Primary keyword must be specific (not generic like "dog care")
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9 }
    }
  );

  const raw = res.data.candidates[0].content.parts[0].text;

  let topic;
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    topic = JSON.parse(cleaned);
  } catch {
    throw new Error("❌ Gemini returned invalid JSON for topic generation");
  }

  if (!topic.title || typeof topic.title !== "string") {
    throw new Error("❌ Invalid topic.title");
  }

  return {
    title: topic.title.trim(),
    primaryKeyword: (topic.primaryKeyword || "").trim(),
    imageTheme: (topic.imageTheme || "Premium pet lifestyle image").trim(),
    searchIntent: (topic.searchIntent || "informational").trim(),
    targetPAA: (topic.targetPAA || "").trim(),
    geoQuery: (topic.geoQuery || "").trim()
  };
}

export async function generateNewTopic(existingSheetTitles = []) {
  const existingSlugs = new Set([
    ...getExistingBlogSlugs(),
    ...existingSheetTitles.map(t =>
      slugify(t, { lower: true, strict: true })
    )
  ]);

  const MAX_ATTEMPTS = 5;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    console.log(`🔁 Topic attempt ${i}...`);

    const topic = await generateRawTopic(existingSheetTitles);
    const slug = slugify(topic.title, { lower: true, strict: true });

    if (!existingSlugs.has(slug)) {
      console.log("✅ Unique topic approved:", topic.title);
      console.log(`   📌 Keyword: ${topic.primaryKeyword}`);
      console.log(`   🔍 PAA Target: ${topic.targetPAA}`);
      console.log(`   🤖 GEO Query: ${topic.geoQuery}`);
      return { ...topic, slug };
    }

    console.warn("⚠️ Duplicate detected, regenerating:", topic.title);
  }

  throw new Error("❌ Unable to generate a unique blog topic after 5 attempts");
}
