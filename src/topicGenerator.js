import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

/**
 * Always returns a VALID topic object
 */
export async function generateNewTopic() {
  const prompt = `
You are an SEO strategist for a pet brand.

Niche: Dogs and Cats only
Target: USA & Canada

Generate ONE blog topic.

Respond in STRICT JSON only with this structure:

{
  "title": "SEO optimized blog title",
  "primaryKeyword": "main keyword",
  "imageTheme": "short realistic image description"
}

Rules:
- title must be a full readable blog title
- no markdown
- no explanations
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

  // 🔒 HARD VALIDATION (this prevents future crashes)
  if (
    !topic.title ||
    typeof topic.title !== "string" ||
    topic.title.length < 10
  ) {
    throw new Error("❌ Invalid topic.title generated");
  }

  if (!topic.primaryKeyword) {
    throw new Error("❌ Invalid primaryKeyword generated");
  }

  if (!topic.imageTheme) {
    topic.imageTheme = "High quality lifestyle pet photo";
  }

  return {
    title: topic.title.trim(),
    primaryKeyword: topic.primaryKeyword.trim(),
    imageTheme: topic.imageTheme.trim()
  };
}
