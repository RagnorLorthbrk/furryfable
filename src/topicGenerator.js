import fs from "fs";
import path from "path";
import axios from "axios";
import slugify from "slugify";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

/**
 * Collect all existing slugs from /blog folder
 */
function getExistingBlogSlugs() {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.startsWith("blog-") && f.endsWith(".html"))
    .map(f => f.replace("blog-", "").replace(".html", ""));
}

/**
 * Generate a single SEO topic from Gemini
 */
async function generateRawTopic() {
  const prompt = `
You are an SEO strategist for a premium pet brand.

Website: https://www.furryfable.com
Niche: Dogs and Cats only
Target: USA & Canada

Generate ONE unique blog topic.

Respond ONLY in strict JSON:

{
  "title": "SEO optimized blog title",
  "primaryKeyword": "main keyword",
  "imageTheme": "realistic lifestyle pet photo description"
}

Rules:
- No markdown
- No explanation
- No arrays
- Title must be human and blog-ready
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  const raw = res.data.candidates[0].content.parts[0].text;

  let topic;
  try {
    topic = JSON.parse(raw);
  } catch {
    throw new Error("❌ Gemini returned invalid JSON");
  }

  if (!topic.title || typeof topic.title !== "string") {
    throw new Error("❌ Invalid topic.title");
  }

  return {
    title: topic.title.trim(),
    primaryKeyword: (topic.primaryKeyword || "").trim(),
    imageTheme: (topic.imageTheme || "Premium pet lifestyle image").trim()
  };
}

/**
 * PUBLIC: Generate a UNIQUE topic (no duplicates)
 */
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

    const topic = await generateRawTopic();
    const slug = slugify(topic.title, {
      lower: true,
      strict: true
    });

    if (!existingSlugs.has(slug)) {
      console.log("✅ Unique topic approved:", topic.title);
      return {
        ...topic,
        slug
      };
    }

    console.warn("⚠️ Duplicate detected, regenerating:", topic.title);
  }

  throw new Error("❌ Unable to generate a unique blog topic after 5 attempts");
}
