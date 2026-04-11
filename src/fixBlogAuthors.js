import axios from "axios";

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

async function fixAllBlogAuthors() {
  console.log("Fetching all blog articles...");

  // Get all blogs first
  const blogsRes = await shopify.get("/blogs.json");
  const blogs = blogsRes.data.blogs;

  let totalFixed = 0;

  for (const blog of blogs) {
    console.log(`\nBlog: ${blog.title} (ID: ${blog.id})`);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const articlesRes = await shopify.get(`/blogs/${blog.id}/articles.json`, {
        params: { limit: 50, page }
      });

      const articles = articlesRes.data.articles;
      if (articles.length === 0) {
        hasMore = false;
        break;
      }

      for (const article of articles) {
        if (article.author !== "FurryFable Team") {
          console.log(`  Fixing: "${article.title}" (was: "${article.author}")`);
          await shopify.put(`/blogs/${blog.id}/articles/${article.id}.json`, {
            article: {
              id: article.id,
              author: "FurryFable Team"
            }
          });
          totalFixed++;
        }
      }

      page++;
      if (articles.length < 50) hasMore = false;
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} articles.`);
}

fixAllBlogAuthors().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
