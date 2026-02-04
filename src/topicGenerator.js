import axios from "axios";
import slugify from "slugify";

export async function generateTopic() {
  const prompt = `
You are an SEO strategist for a premium pet products brand.
Website: https://www.furryfable.com

Generate ONE blog topic that:
- Targets USA & Canada search intent
- Focuses on dogs or cats only
- Has strong organic ranking potential
- Is informational, not salesy
- Fits a premium pet lifestyle brand

Return STRICT JSON only in this format:
{
  "title": "",
  "primary_keyword": "",
  "image_theme": ""
}
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }]
    }
  );

  const text = res.data.candidates[0].content.parts[0].text.trim();
  const data = JSON.parse(text);

  return {
    date: new Date().toISOString().split("T")[0],
    title: data.title,
    primaryKeyword: data.primary_keyword,
    slug: slugify(data.title, { lower: true, strict: true }),
    imageTheme: data.image_theme
  };
}
