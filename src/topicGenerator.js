import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "models/gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing in topicGenerator");
}

/**
 * Generate a NEW blog topic when sheet is empty
 * Focus: USA & Canada, Dogs & Cats, SEO-driven
 */
export async function generateNewTopic() {
  const prompt = `
You are an SEO strategist for a premium pet products brand.

Website: https://www.furryfable.com
Target markets: USA & Canada
Niche: Dogs and Cats only

Task:
Generate ONE high-intent blog topic with strong organic ranking potential.

Rules:
- Topic must solve a real pet owner problem
- Informational or commercial-intent SEO topic
- Avoid brand names
- Avoid fluff or generic topics
- Think SERP-first

Respond ONLY in valid JSON.
No markdown. No explanations.

Format:
{
  "title": "string"
}
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    }
  );

  const raw = res.data.candidates[0].content.parts[0].text;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("❌ Failed to parse topic JSON from Gemini");
  }

  if (!parsed.title) {
    throw new Error("❌ Gemini did not return a title");
  }

  return parsed.title;
}
