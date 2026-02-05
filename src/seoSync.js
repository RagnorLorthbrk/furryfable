import axios from "axios";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION,
  OPENAI_API_KEY
} = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
  throw new Error("❌ Missing Shopify credentials");
}

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

async function getLatestArticle() {
  const res = await shopify.get("/articles.json?limit=1");
  return res.data.articles[0];
}

async function generateSEO(article) {
  const prompt = `
Generate SEO data for a Shopify blog post.

Title: ${article.title}
Content excerpt: ${article.body_html.replace(/<[^>]+>/g, "").slice(0, 800)}

Return JSON only:
{
  "seo_title": "",
  "meta_description": "",
  "tags": ["", ""],
  "image_alt": "",
  "internal_links": ["homepage", "blogs"]
}
`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );

  return JSON.parse(res.data.choices[0].message.content);
}

async function updateArticle(article, seo) {
  await shopify.put(`/articles/${article.id}.json`, {
    article: {
      id: article.id,
      title: article.title,
      tags: seo.tags.join(", "),
      image: {
        alt: seo.image_alt
      },
      metafields: [
        {
          namespace: "seo",
          key: "title",
          type: "single_line_text_field",
          value: seo.seo_title
        },
        {
          namespace: "seo",
          key: "description",
          type: "single_line_text_field",
          value: seo.meta_description
        }
      ]
    }
  });
}

(async function main() {
  console.log("🔍 SEO Sync started");

  const article = await getLatestArticle();
  if (!article) {
    console.log("No article found");
    return;
  }

  const seo = await generateSEO(article);
  await updateArticle(article, seo);

  console.log("✅ SEO updated for:", article.title);
})();
