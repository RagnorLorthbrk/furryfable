import axios from "axios";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

const api = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

// 1️⃣ Find article by handle
async function getArticleByHandle(handle) {
  const res = await api.get("/blogs.json?limit=250");
  const blogs = res.data.blogs;

  for (const blog of blogs) {
    const articlesRes = await api.get(
      `/blogs/${blog.id}/articles.json?limit=250`
    );

    const article = articlesRes.data.articles.find(
      a => a.handle === handle
    );

    if (article) return article;
  }

  return null;
}

// 2️⃣ Update article fields + SEO metafields
export async function updateShopifyMetadata(handle, metadata) {
  const article = await getArticleByHandle(handle);

  if (!article) {
    throw new Error(`Shopify article not found for handle: ${handle}`);
  }

  // ✅ Update excerpt + tags (ROOT FIELDS)
  await api.put(
    `/articles/${article.id}.json`,
    {
      article: {
        id: article.id,
        summary_html: metadata.excerpt,
        tags: metadata.tags.join(", ")
      }
    }
  );

  // ✅ Update SEO metafields
  await api.post(
    `/articles/${article.id}/metafields.json`,
    {
      metafield: {
        namespace: "global",
        key: "description_tag",
        value: metadata.metaDescription,
        type: "single_line_text_field"
      }
    }
  );

  await api.post(
    `/articles/${article.id}/metafields.json`,
    {
      metafield: {
        namespace: "global",
        key: "title_tag",
        value: article.title,
        type: "single_line_text_field"
      }
    }
  );
}
