import axios from "axios";
import slugify from "slugify";

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in Gemini response");
  }
  return JSON.parse(match[0]);
}

export async function generateTopic() {
  const prompt = `
You are an SEO strategist for a premium pet products brand.

Website: https://www.furryfable.com
Audience: USA and Canada
Niche: dogs and cats only

Generate ONE blog topic with high organic ranking potential.

STRICT RULES:
- Respond with JSON only
- No markdown
- No explanation
- No backticks

Required JSON format:
{
  "title": "string",
  "primary_keyword": "string",
  "image_theme": "string"
}
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  const rawText = res.data.candidates[0].content.parts[0].text;

  const data = e
