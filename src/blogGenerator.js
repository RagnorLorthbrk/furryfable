import fs from "fs";
import path from "path";
import axios from "axios";
import { BLOG_DIR } from "./config.js";
import { getPublishedBlogSlugs } from "./sheetManager.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

/**
 * Build internal links from published blogs for interlinking
 */
async function buildInternalLinks(currentSlug) {
  try {
    const published = await getPublishedBlogSlugs();
    return published
      .filter(b => b.slug !== currentSlug)
      .slice(-8) // Last 8 published blogs for variety
      .map(b => `- "${b.title}": https://www.furryfable.com/blogs/blog/${b.slug}`)
      .join("\n");
  } catch {
    return "";
  }
}

export async function generateBlogHTML({ title, primaryKeyword, slug }) {
  const internalLinks = await buildInternalLinks(slug);

  const currentDate = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  const prompt = `
You are a world-class SEO content strategist and pet industry expert writing for FurryFable.com.

TOPIC: "${title}"
PRIMARY KEYWORD: "${primaryKeyword}"
DATE: ${currentDate}
WEBSITE: https://www.furryfable.com
NICHE: Premium Dogs & Cats products and care
TARGET AUDIENCE: Pet parents in USA & Canada (25-55, premium segment)

═══════════════════════════════════════
SECTION 1: ADVANCED SEO REQUIREMENTS
═══════════════════════════════════════

1. KEYWORD OPTIMIZATION:
   - Use "${primaryKeyword}" in the first 100 words naturally
   - Include 3-5 LSI (Latent Semantic Indexing) keywords related to "${primaryKeyword}"
   - Use long-tail variations throughout (e.g., "best [keyword] for dogs", "how to [keyword] for cats")
   - Include question-based subheadings that match search queries (People Also Ask format)

2. CONTENT STRUCTURE (Critical for Featured Snippets):
   - Start with a compelling hook paragraph (2-3 sentences max)
   - Include a "Quick Answer" box right after the intro — a 2-3 sentence direct answer to the main query
   - Use H3 for main sections, H4 for subsections (NOT h1 or h2 — the page title already uses those)
   - Include numbered lists and bullet points for scannability
   - Add a comparison table where relevant (HTML <table> with proper headers)
   - Content length: 1800-2500 words (comprehensive but focused)

3. INTERNAL LINKING (USE THESE EXISTING BLOG POSTS):
${internalLinks || "No existing blogs available yet."}

   Rules:
   - Link to 3-5 of these existing blogs naturally within the content
   - Use descriptive anchor text (not "click here")
   - Place links where they add genuine value to the reader

4. COLLECTION LINKS (Link to product pages naturally):
   - Pet Toys: https://www.furryfable.com/collections/pet-toys
   - Dog Toys: https://www.furryfable.com/collections/dog-toys
   - Cat Toys: https://www.furryfable.com/collections/cat-toys
   - Water Bottles & Feeders: https://www.furryfable.com/collections/pet-water-bottle
   - Pet Apparel: https://www.furryfable.com/collections/pet-apparels
   - Harness & Leash: https://www.furryfable.com/collections/harness-and-leash
   - Pet Outdoor Supplies: https://www.furryfable.com/collections/pet-outdoor-supplies
   - Safety & High-Tech Gear: https://www.furryfable.com/collections/safety-high-tech-gear
   - Training & Control Gear: https://www.furryfable.com/collections/training-control-gear
   - Comfort & Anxiety Solutions: https://www.furryfable.com/collections/comfort-luxury-anxiety-solutions

   Rules: Link to 3-5 collections naturally. ALWAYS link the most relevant collection for the topic.
   Example: "A quality <a href='https://www.furryfable.com/collections/harness-and-leash'>no-pull harness</a> can make walks safer."
   CRITICAL: Every blog MUST include at least one strong CTA linking to a relevant product collection.

═══════════════════════════════════════
SECTION 2: GEO (Generative Engine Optimization)
═══════════════════════════════════════
Optimize for AI engines (ChatGPT, Gemini, Perplexity, Claude) to cite this content:

1. ENTITY CLARITY: Start key paragraphs with clear, definitive statements.
   BAD: "There are many options for dog beds."
   GOOD: "Orthopedic dog beds use memory foam to support joints, making them ideal for senior dogs over 7 years."

2. CITATION-READY FORMAT: Write paragraphs that AI can directly quote:
   - Lead with the fact/answer, then explain
   - Include specific numbers, ranges, or data points
   - Use authoritative language ("According to veterinary guidelines...", "The ASPCA recommends...")

3. FAQ SECTION: Include 5 FAQ questions at the bottom in this exact format:
   <div class="faq-section">
   <h3>Frequently Asked Questions</h3>
   <div class="faq-item">
   <h4>Q: [Question matching a real search query]?</h4>
   <p>A: [Direct, concise answer in 2-3 sentences]</p>
   </div>
   </div>

4. STRUCTURED DEFINITIONS: When introducing concepts, use clear definitions:
   "[Term] is [definition]. This means [practical implication for pet owners]."

5. COMPARISON/LIST FORMAT: AI engines love structured comparisons:
   - "Top 5 [topic] for [audience]"
   - Numbered recommendations with pros/cons

═══════════════════════════════════════
SECTION 3: E-E-A-T SIGNALS
═══════════════════════════════════════
1. Show EXPERIENCE: Include practical tips that show hands-on pet care knowledge
2. Show EXPERTISE: Reference veterinary science, pet behavior research
3. Show AUTHORITY: Cite real organizations (AKC, APPA, ASPCA, AVMA)
4. Show TRUST: Include disclaimers where medical advice is mentioned ("Always consult your veterinarian")

═══════════════════════════════════════
SECTION 4: CONTENT RULES
═══════════════════════════════════════
1. FACTUAL GROUNDING: Use real ${currentYear} pet industry trends. Reference AKC, APPA, ASPCA general guidance.
2. NO HALLUCINATIONS: Never invent specific statistics. Use general trends instead.
3. TONE: Professional, warm, authoritative. Premium feel for USA/Canada pet parents.
4. NO markdown. Output VALID HTML only (h3, h4, p, ul, ol, li, table, a, strong, em, div). NEVER use h1 or h2 tags — the page template already handles those.
5. NO emojis in the article body.
6. Include a strong CTA at the end linking to relevant FurryFable collections.

═══════════════════════════════════════
SECTION 5: SCHEMA MARKUP (APPEND AT END)
═══════════════════════════════════════
After the article HTML, append this JSON-LD schema (fill in the values):

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${title}",
  "description": "[Generate a 150-char description]",
  "author": {
    "@type": "Organization",
    "name": "FurryFable",
    "url": "https://www.furryfable.com"
  },
  "publisher": {
    "@type": "Organization",
    "name": "FurryFable",
    "url": "https://www.furryfable.com"
  },
  "datePublished": "${currentDate}",
  "dateModified": "${currentDate}",
  "mainEntityOfPage": "https://www.furryfable.com/blogs/blog/${slug || '[slug]'}"
}
</script>

Also append FAQPage schema for the FAQ section:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[FAQ question 1]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[FAQ answer 1]"
      }
    }
    // ... repeat for all 5 FAQs
  ]
}
</script>

OUTPUT: Valid HTML only. Start with the article content, end with the schema scripts.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192
      }
    }
  );

  let html = res.data.candidates[0].content.parts[0].text;

  // Clean markdown wrappers if Gemini adds them
  html = html.replace(/```html\s*/gi, "").replace(/```\s*$/gi, "").trim();

  return html;
}

export function saveBlogHTML(slug, html) {
  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
  const filePath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}
