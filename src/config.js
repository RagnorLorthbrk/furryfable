export const config = {
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    token: process.env.SHOPIFY_ADMIN_TOKEN,
    blogId: process.env.SHOPIFY_BLOG_ID
  },
  geminiKey: process.env.GEMINI_API_KEY,
  sheetId: process.env.GOOGLE_SHEET_ID
};
