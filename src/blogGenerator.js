import fs from "fs";
import path from "path";
import axios from "axios";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash"; // Stable 2026 model

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

function buildInternalBlogLinks(existingBlogs = []) {
  return existingBlogs
    .filter(b => b.slug)
    .slice(0, 3)
    .map(b => `<li><a href="https://www.furryfable.com/blogs/blog/${b.slug}">${b.title}</a></li>`)
    .join("\n");
}

export async function generateBlogHTML({ title, primaryKeyword, existingBlogs = [] }) {
  const internalBlogLinksHTML = buildInternalBlogLinks(existingBlogs);

  const prompt = `
Act as a Senior Pet Industry Researcher for FurryFable.com. 

TOPIC: "${title}"
PRIMARY KEYWORD: "${primaryKeyword}"
WEBSITE: https://www.furryfable.com
NICHE: Dogs and Cats only (Premium segment)

STRICT WRITING RULES:
1. FACTUAL GROUNDING: Use real pet industry data trends for 2026. Reference the general sentiments of the American Kennel Club (AKC) and the American Pet Products Association (APPA). 
2. NO HALLUCINATIONS: If a specific 2026 or 2027 statistic is not explicitly available, DO NOT invent one. Instead, describe the general industry trend (e.g., "The market is shifting toward proactive pet wellness and organic nutrition").
3. TONE: Professional, authoritative, and helpful for premium pet parents in the USA & Canada.
4. SEO STRUCTURE: Use proper HTML (h1, h2, h3, p, ul). No markdown or emojis.

INTERNAL LINKS (USE EXACTLY):
<ul>
${internalBlogLinksHTML}
</ul>

ALLOWED COLLECTIONS:
- https://www.furryfable.com/collections/pet-toys
- https://www.furryfable.com/collections/pet-water-bottle
- https://www.furryfable.com/collections/pet-apparels
- https://www.furryfable.com/collections/harness-and-leash

Output VALID HTML ONLY.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] }
  );

  return res.data.candidates[0].content.parts[0].text;
}

export function saveBlogHTML(slug, html) {
  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}
