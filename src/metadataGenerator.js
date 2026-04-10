import axios from "axios";

export async function generateMetadata(blogContent) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an advanced SEO and GEO metadata specialist for FurryFable.com (premium pet brand).

From the blog content below, generate comprehensive metadata optimized for:
- Google Search (traditional SEO)
- AI engines like ChatGPT, Gemini, Perplexity, Claude (GEO)
- Social sharing (Open Graph)

Respond ONLY in valid JSON:
{
  "excerpt": "Compelling excerpt, max 160 chars, includes primary keyword",
  "metaDescription": "Click-worthy meta description, max 155 chars, includes primary keyword and value proposition",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"],
  "ogTitle": "Open Graph title optimized for social sharing (max 60 chars)",
  "ogDescription": "Social sharing description that drives clicks (max 200 chars)",
  "focusKeyword": "The single most important keyword phrase from this article",
  "relatedKeywords": ["keyword2", "keyword3", "keyword4"],
  "targetAudience": "Brief description of who this article serves"
}

Rules:
- Tags should include a mix of broad and long-tail keywords
- Include 8 tags (not 5) for maximum discoverability
- Meta description MUST include a call-to-action element
- Focus keyword should be the exact phrase someone would search on Google

Blog content:
${blogContent.slice(0, 10000)}
`;

  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3 }
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini Metadata Generator");

  try {
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Invalid JSON from Gemini: ${text}`);
  }
}
