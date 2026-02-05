import axios from "axios";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
  throw new Error("❌ Missing Shopify credentials");
}

const BASE_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

export async function publishBlogToShopify({ title, html, slug, images }) {
  const articleRes = await axios.post(
    `${BASE_URL}/blogs.json`,
    {
      blog: { title: "Blog" }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      }
    }
  );

  const blogId = articleRes.data.blog.id;

  const res = await axios.post(
    `${BASE_URL}/blogs/${blogId}/articles.json`,
    {
      article: {
        title,
        body_html: html,
        handle: slug,
        published: true
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      }
    }
  );

  return {
    adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.replace(
      ".myshopify.com",
      ""
    )}/content/articles/${res.data.article.id}`
  };
}
