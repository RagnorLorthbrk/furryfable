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
 * Get existing blog URLs from /blog folder
 */
function getExistingBlogLinks() {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.startsWith("blog-") && f.endsWith(".html"))
    .map(f => {
      const slug = f.replace("blog-", "").replace(".html", "");
      return `https://www.furryfable.com/blogs/blog/${slug}`;
    });
}

/**
 * Generate blog HTML using Gemini
 */
export async function generateBlogHTML(title) {
  const existingBlogLinks = getExistingBlogLinks();

  const internalCollections = [
    "https://www.furryfable.com/",
    "https://www.furryfable.com/collections/",
    "https://www.furryfable.com/collections/all",
    "https://www.furryfable.com/collections/pet-toys",
    "https://www.furryfable.com/collections/pet-water-bottle",
    "https://www.furryfable.com/collections/pet-apparels",
    "https://www.furryfable.com/collections/pet-outdoor-supplies",
    "https://www.furryfable.com/collections/harness-and-leash"
  ];

  const prompt = `
You are a professional SEO content writer for a premium pet products brand.

Website: https://www.furryfable.com
Audience: USA & Canada
Niche: Dogs and Cats only

Write a high-quality SEO blog about:
"${title}"

STRICT RULES (DO NOT BREAK):
- Output VALID HTML ONLY
- Use proper HTML structure (h1, h2, h3, p, ul, li, a)
- No markdown
- No emojis
- No AI disclaimers
- No fake URLs
- No guessing links
- No future blog links

INTERNAL LINKING RULES:
1) You may ONLY link to these existing blog URLs (max 3 total):
${existingBlogLinks.join("\n") || "NO EXISTING BLOGS YET"}

2) You may ONLY link to these internal pages:
${internalCollections.join("\n")}

3) If a link is not relevant, DO NOT link.

SEO STRUCTURE:
- 1 H1
- Logical H2/H3 sections
- Natural internal links inside paragraphs
- No footer or navigation links

Write naturally. Do not mention SEO.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}

/**
 * Save blog HTML
 */
export function saveBlogHTML(title, html) {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = slugify(title, { lower: true, strict: true });
  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);

  fs.writeFileSync(filePath, html, "utf-8");

  return { slug, filePath };
}
