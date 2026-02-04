import axios from "axios";
import slugify from "slugify";

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Gemini response did not contain JSON");
  }
  return JSON.parse(match[0]);
}

export async function generateTopic() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing at runtime");
  }

  const prompt = `
You are an SEO strategist for a premium pet products brand.

Website: https://www.furryfable.com
Audience: USA and Canada
Niche: dogs and cats only

Generate ONE blog topic with strong organic ranking potential.

STRICT OUTPUT RULES:
- Return ONLY valid JSON
- No markdown
- No explanations
- No backticks

JSON format:
{
  "title": "string",
  "primary_keyword": "string",
  "image_theme": "string"
}
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    }
  );

  const rawText =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error("Empty response from Gemini");
  }

  const data = extractJSON(rawText);

  return {
    date: new Date().toISOString().split("T")[0],
    title: data.title.trim(),
    primaryKeyword: data.primary_keyword.trim(),
    slug: slugify(data.title, { lower: true, strict: true }),
    imageTheme: data.image_theme.trim()
  };
}
