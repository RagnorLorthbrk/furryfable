import axios from "axios";

export async function updateShopifyMetadata(slug, metadata) {
  const {
    SHOPIFY_STORE_DOMAIN,
    SHOPIFY_ACCESS_TOKEN,
    SHOPIFY_API_VERSION
  } = process.env;

  const baseUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  // 1. Get all articles
  const res = await axios.get(`${baseUrl}/articles.json?limit=250`, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
    }
  });

  const article = res.data.articles.find(a => a.handle === slug);
  if (!article) {
    console.warn(`Shopify article not found for slug: ${slug}`);
    return;
  }

  // 2. Update correct fields
  await axios.put(
    `${baseUrl}/articles/${article.id}.json`,
    {
      article: {
        id: article.id,
        excerpt_html: metadata.excerpt,
        tags: metadata.tags.join(", "),
        metafields: [
          {
            namespace: "global",
            key: "description_tag",
            type: "single_line_text_field",
            value: metadata.metaDescription
          }
        ]
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  console.log(`Updated Shopify metadata for: ${slug}`);
}
