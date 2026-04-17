import axios from "axios";
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;
const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN }
});
const theme = (await shopify.get("/themes.json")).data.themes.find(t => t.role === "main");
console.log("Theme:", theme.name, theme.id);

// Print snippets/price.liquid content
const priceAsset = (await shopify.get(`/themes/${theme.id}/assets.json`, {
  params: { "asset[key]": "snippets/price.liquid" }
})).data.asset;
console.log("\n=== snippets/price.liquid ===\n");
console.log(priceAsset.value);
