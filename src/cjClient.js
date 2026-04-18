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
 * Get pet category IDs from CJ API
 */
async function getPetCategoryIds() {
  try {
    const res = await cjCall(() => cj.get("/product/getCategory"));
    if (!res.data.result) return [];

    const categories = res.data.data || [];
    const petCats = [];

    // Find all pet-related category IDs (all levels)
    for (const cat of categories) {
      const name = (cat.categoryFirstName || cat.categoryName || "").toLowerCase();
      if (name.includes("pet")) {
        petCats.push({ id: cat.categoryId, name: cat.categoryFirstName || cat.categoryName });

        // Get subcategories too
        if (cat.categorySecond) {
          for (const sub of cat.categorySecond) {
            petCats.push({ id: sub.categoryId, name: sub.categorySecondName || sub.categoryName });
            if (sub.categoryThird) {
              for (const third of sub.categoryThird) {
                petCats.push({ id: third.categoryId, name: third.categoryName });
              }
            }
          }
        }
      }
    }

    return petCats;
  } catch (err) {
    console.log("    Could not fetch categories:", err.message);
    return [];
  }
}

// ═══════════════════════════════════════
// METHOD 1: Website scraping (most reliable)
// Extracts window.PRODUCTSRES from CJ HTML
// ═══════════════════════════════════════

async function scrapeProductsFromWebsite(page = 1) {
  const searchUrl = `https://cjdropshipping.com/list/wholesale-pet-supplies-l-2409110611570657700.html?pageNum=${page}&from=US&shipTo=US&defaultArea=2`;

  const response = await axios.get(searchUrl, {
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache"
    }
  });

  const html = typeof response.data === "string" ? response.data : "";
  console.log(`    HTML length: ${html.length}`);

  // Find PRODUCTSRES in any format
  let startIdx = -1;
  for (const pattern of ['PRODUCTSRES={', 'PRODUCTSRES ={', 'PRODUCTSRES= {', 'PRODUCTSRES = {']) {
    startIdx = html.indexOf(pattern);
    if (startIdx !== -1) break;
  }

  if (startIdx === -1) {
    // Debug: check if PRODUCTSRES exists at all
    const anyIdx = html.indexOf('PRODUCTSRES');
    if (anyIdx !== -1) {
      console.log("    PRODUCTSRES found but format unknown:", html.substring(anyIdx, anyIdx + 80));
    } else {
      console.log("    PRODUCTSRES not found in HTML at all");
      // Check if we got a login page, error page, or different content
      if (html.includes('login') || html.includes('Login')) {
        console.log("    ⚠️ CJ returned a login page — may need cookies");
      }
      if (html.includes('Cloudflare') || html.includes('cf-')) {
        console.log("    ⚠️ Blocked by Cloudflare protection");
      }
      // Log a sample of what we got
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) console.log("    Page title:", titleMatch[1]);
    }
    return [];
  }

  // Find JSON start and count braces to find end
  const jsonStart = html.indexOf('{', startIdx);
  let depth = 0;
  let jsonEnd = jsonStart;
  for (let i = jsonStart; i < html.length && i < jsonStart + 2000000; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
  }

  try {
    const rawJson = html.substring(jsonStart, jsonEnd).replace(/:undefined/g, ':null');
    const data = JSON.parse(rawJson);
    const list = data.content?.[0]?.productList || [];

    return list.map(p => ({
      pid: p.id,
      productNameEn: p.nameEn || p.name || "",
      sellPrice: String(p.sellPrice || p.nowPrice || "0"),
      productImage: p.image || p.bigImage || "",
      listedNum: parseInt(p.listedNum) || 0,
      categoryName: p.oneCategoryName || p.twoCategoryName || ""
    }));
  } catch (e) {
    console.log("    JSON parse failed:", e.message);
    console.log("    Preview:", html.substring(jsonStart, jsonStart + 200));
    return [];
  }
}

// ═══════════════════════════════════════
// METHOD 2: /product/listV2 — CJ confirmed: returns only LIVE products, no saleStatus needed
// Correct params per CJ support: page, size, sort=asc, orderBy=2, countryCode=US
// ═══════════════════════════════════════

async function searchAPIv2(keyword, categoryId, page = 1) {
  const base = { page, size: 50, sort: "asc", orderBy: 2, countryCode: "US" };
  const paramSets = [
    // Try 1: Exactly what CJ support showed — no keyword, just US (returns all live US products)
    { ...base },
    // Try 2: keyword + US (correct sort params)
    { ...base, keyWord: keyword },
    // Try 3: categoryId + US
    { ...base, categoryId },
    // Try 4: keyword only, no country filter
    { page, size: 50, sort: "asc", orderBy: 2, keyWord: keyword },
  ];

  for (let i = 0; i < paramSets.length; i++) {
    try {
      const res = await cjCall(() =>
        cj.get("/product/listV2", { params: paramSets[i] })
      );
      if (res.data.result) {
        const list = res.data.data?.list || [];
        if (list.length > 0) {
          console.log(`    listV2 param set ${i + 1} returned ${list.length} products`);
          return list;
        }
        console.log(`    listV2 param set ${i + 1}: 0 results`);
      } else {
        console.log(`    listV2 param set ${i + 1} failed: ${res.data.message}`);
      }
    } catch (err) {
      if (err.response?.status === 429) throw err;
      console.log(`    listV2 param set ${i + 1} error: ${err.response?.status} ${err.response?.data?.message || err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return [];
}

async function searchAPI(categoryId, keyword, page = 1) {
  const params = {
    pageNum: page,
    pageSize: 200,
    countryCode: "US",
    sort: "desc",
    orderBy: "listedNum"
  };

  if (categoryId) params.categoryId = categoryId;
  if (keyword) params.productNameEn = keyword;

  try {
    const res = await cjCall(() => cj.get("/product/list", { params }));
    if (res.data.result) {
      return res.data.data?.list || [];
    }
  } catch (err) {
    if (err.response?.status === 429) throw err;
  }
  return [];
}

// ═══════════════════════════════════════
// MAIN SEARCH
// ═══════════════════════════════════════

export async function searchPetProducts() {
  await getAccessToken();

  const allProducts = [];
  const seenIds = new Set();

  function addProducts(products) {
    let added = 0;
    for (const p of products) {
      const pid = p.pid || p.id;
      const name = p.productNameEn || p.nameEn || p.name || "";
      const price = parseFloat(p.sellPrice || p.nowPrice || 0);
      const image = p.productImage || p.image || p.bigImage || "";

      if (!pid || seenIds.has(pid) || !name) continue;
      if (price < 1 || price > 30) continue;

      seenIds.add(pid);
      allProducts.push({
        pid,
        productNameEn: name,
        sellPrice: String(price),
        productImage: image,
        listedNum: parseInt(p.listedNum) || 0
      });
      added++;
    }
    return added;
  }

  // ═══ METHOD 1: Website scraping (live products only) ═══
  console.log("  Method 1: Scraping CJ website (US warehouse pet supplies)...");
  try {
    for (let page = 1; page <= 5; page++) {
      process.stdout.write(`    Page ${page}/5... `);
      const products = await scrapeProductsFromWebsite(page);
      const added = addProducts(products);
      console.log(`${products.length} scraped, ${added} new (total: ${allProducts.length})`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch (err) {
    console.log(`    Scraping failed: ${err.message}`);
  }

  if (allProducts.length >= 20) {
    console.log(`\n  ✅ Found ${allProducts.length} live products via website`);
    return allProducts;
  }

  // ═══ METHOD 2: listV2 (CJ confirmed: returns only LIVE products) ═══
  console.log(`\n  Method 2: /product/listV2 (live products only, countryCode=US)...`);
  const PET_CAT_ID = "2409110611570657700";
  for (let page = 1; page <= 5; page++) {
    try {
      process.stdout.write(`    Page ${page}/5... `);
      const products = await searchAPIv2("pet", PET_CAT_ID, page);
      const added = addProducts(products);
      console.log(`${products.length} returned, ${added} new (total: ${allProducts.length})`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`failed: ${err.message}`);
      if (err.response?.status === 429) await new Promise(r => setTimeout(r, 15000));
      break;
    }
  }

  if (allProducts.length >= 20) {
    console.log(`\n  ✅ Found ${allProducts.length} live products via listV2`);
    return allProducts;
  }

  // ═══ METHOD 3: V1 API fallback (may include removed products — last resort) ═══
  console.log(`\n  Method 3 (fallback): API /product/list — pet supplies category...`);
  for (let page = 1; page <= 5; page++) {
    try {
      process.stdout.write(`    Page ${page}/5... `);
      const products = await searchAPI(PET_CAT_ID, null, page);
      const added = addProducts(products);
      console.log(`${products.length} returned, ${added} new (total: ${allProducts.length})`);
      if (products.length === 0) break;
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log(`failed: ${err.message}`);
      if (err.response?.status === 429) await new Promise(r => setTimeout(r, 15000));
      break;
    }
  }

  return allProducts;
}
