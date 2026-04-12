import axios from "axios";

const CJ_API_KEY = process.env.CJ_API_KEY;
const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

if (!CJ_API_KEY) {
  throw new Error("CJ_API_KEY is required");
}

const cj = axios.create({
  baseURL: CJ_BASE_URL,
  headers: { "Content-Type": "application/json" }
});

let cachedToken = null;

export async function getAccessToken() {
  if (cachedToken) return cachedToken;

  console.log("Requesting CJ access token...");
  const res = await axios.post(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    apiKey: CJ_API_KEY
  }, { headers: { "Content-Type": "application/json" } });

  if (res.data.result && res.data.data?.accessToken) {
    cachedToken = res.data.data.accessToken;
    cj.defaults.headers.common["CJ-Access-Token"] = cachedToken;
    console.log("CJ access token obtained successfully");
    return cachedToken;
  }

  console.warn("Token exchange response:", JSON.stringify(res.data));
  cachedToken = CJ_API_KEY;
  cj.defaults.headers.common["CJ-Access-Token"] = CJ_API_KEY;
  return CJ_API_KEY;
}

/**
 * CJ API call with 429 retry
 */
async function cjCall(fn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries) {
        const wait = (attempt + 1) * 10;
        console.log(`    ⏳ Rate limited. Waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Get full product details via CJ API
 */
export async function getProductDetails(pid) {
  const res = await cjCall(() =>
    cj.get("/product/query", {
      params: { pid, countryCode: "US", features: "enable_inventory" }
    })
  );

  if (!res.data.result) return null;
  return res.data.data;
}

/**
 * Scrape LIVE products from CJ website.
 *
 * The CJ website embeds product data as `window.PRODUCTSRES = {...}` in the HTML.
 * This is server-side rendered, so a simple HTTP GET can extract it.
 *
 * URL: /list/wholesale-pet-supplies-l-{categoryId}.html?from=US&shipTo=US&defaultArea=2
 * Data: window.PRODUCTSRES = { content: [{ productList: [...] }], totalPages, totalRecords }
 */
async function scrapeProductsFromWebsite(page = 1) {
  const searchUrl = `https://cjdropshipping.com/list/wholesale-pet-supplies-l-2409110611570657700.html?pageNum=${page}&from=US&shipTo=US&defaultArea=2`;

  const response = await axios.get(searchUrl, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    }
  });

  const html = typeof response.data === "string" ? response.data : "";

  // Extract window.PRODUCTSRES JSON from the HTML
  const match = html.match(/window\.PRODUCTSRES\s*=\s*(\{[\s\S]*?\})\s*\n/);
  if (!match) {
    console.log("    Could not find PRODUCTSRES in HTML");
    return { products: [], totalPages: 0 };
  }

  let productsData;
  try {
    productsData = JSON.parse(match[1]);
  } catch (e) {
    // The JSON might be cut off by newline. Try a more aggressive extraction
    const startIdx = html.indexOf('window.PRODUCTSRES=');
    if (startIdx === -1) {
      console.log("    Could not parse PRODUCTSRES JSON");
      return { products: [], totalPages: 0 };
    }

    // Find the matching closing brace
    const jsonStart = html.indexOf('{', startIdx);
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < html.length && i < jsonStart + 500000; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }

    try {
      productsData = JSON.parse(html.substring(jsonStart, jsonEnd));
    } catch (e2) {
      console.log("    Failed to parse PRODUCTSRES:", e2.message);
      return { products: [], totalPages: 0 };
    }
  }

  const totalPages = parseInt(productsData.totalPages) || 0;
  const productList = productsData.content?.[0]?.productList || [];

  const products = productList.map(p => ({
    pid: p.id,
    productNameEn: p.nameEn || p.name || "",
    sellPrice: p.sellPrice || p.nowPrice || "0",
    productImage: p.image || p.bigImage || "",
    listedNum: parseInt(p.listedNum) || 0,
    totalInventory: parseInt(p.totalInventory) || 0,
    warehouseInventory: parseInt(p.warehouseInventoryNum) || 0,
    variantKeyEn: p.variantKeyEn || "",
    categoryName: p.oneCategoryName || "",
    isFree: p.isFree,
    monthSold: parseInt(p.monthSold) || 0
  }));

  return { products, totalPages };
}

/**
 * MAIN: Browse CJ Pet Supplies category (US warehouse) from WEBSITE
 * Then get full details via API for products AI selects
 *
 * Flow:
 * 1. Scrape CJ website pages — extracts window.PRODUCTSRES (server-rendered data)
 * 2. Filter by price range and require images
 * 3. Return verified LIVE products for AI selection
 * 4. API is used later (during import) for full details, variants, images
 */
export async function searchPetProducts() {
  await getAccessToken();

  const allProducts = [];
  const seenIds = new Set();

  // Browse Pet Supplies category pages (US warehouse)
  console.log("  Step 1: Browsing CJ website Pet Supplies (US warehouse)...");

  const MAX_PAGES = 3; // 60 products per page = ~180 products
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      process.stdout.write(`    Page ${page}/${MAX_PAGES}... `);
      const { products, totalPages } = await scrapeProductsFromWebsite(page);

      let added = 0;
      for (const p of products) {
        if (!seenIds.has(p.pid) && p.productNameEn) {
          const price = parseFloat(p.sellPrice) || 0;
          // Only products in $1-$30 range with images
          if (price >= 1 && price <= 30 && p.productImage) {
            seenIds.add(p.pid);
            allProducts.push(p);
            added++;
          }
        }
      }

      console.log(`${products.length} products on page, ${added} qualified (total pages: ${totalPages})`);

      if (products.length === 0) break;

      // Delay between page requests
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }
  }

  console.log(`\n  Result: ${allProducts.length} live products from CJ website (US warehouse, $1-$30)`);
  return allProducts;
}
