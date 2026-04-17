import axios from "axios";
import { google } from "googleapis";
import { getAccessToken, getProductDetails } from "./cjClient.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const CJ_PRODUCT_URLS = process.env.CJ_PRODUCT_URLS || "";

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });

// ═══════════════════════════════════════
// EXTRACT PIDs FROM URLS
// ═══════════════════════════════════════
function extractPids(urlString) {
  return urlString
    .split(/[\n,]+/)
    .map(u => u.trim())
    .filter(Boolean)
    .map(u => {
      // Format 1: .../product/slug-p-GUID.html  →  GUID
      const guidMatch = u.match(/-p-([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})\.html/i);
      if (guidMatch) return guidMatch[1];
      // Format 2: .../product/1234567890  →  numeric PID
      const numericMatch = u.match(/\/product\/(\d+)/);
      if (numericMatch) return numericMatch[1];
      // Format 3: bare numeric PID or GUID
      if (/^\d+$/.test(u)) return u;
      if (/^[A-F0-9-]{36}$/i.test(u)) return u;
      return null;
    })
    .filter(Boolean);
}

// ═══════════════════════════════════════
// LOAD ALL SHOPIFY COLLECTIONS
// ═══════════════════════════════════════
async function loadAllCollections() {
  const collections = {};

  const [customRes, smartRes] = await Promise.all([
    shopify.get("/custom_collections.json?limit=250"),
    shopify.get("/smart_collections.json?limit=250")
  ]);

  for (const col of [...(customRes.data.custom_collections || []), ...(smartRes.data.smart_collections || [])]) {
    collections[col.handle] = { id: col.id, title: col.title, handle: col.handle };
  }

  return collections;
}

// ═══════════════════════════════════════
// CREATE A NEW COLLECTION IF NEEDED
// ═══════════════════════════════════════
async function ensureCollection(handle, title, allCollections) {
  if (allCollections[handle]) return allCollections[handle].id;

  console.log(`  Creating new collection: "${title}" (${handle})`);
  const res = await shopify.post("/custom_collections.json", {
    custom_collection: {
      title,
      handle,
      published: true
    }
  });
  const newCol = res.data.custom_collection;
  allCollections[handle] = { id: newCol.id, title: newCol.title, handle: newCol.handle };
  return newCol.id;
}

// ═══════════════════════════════════════
// AI: ANALYZE PRODUCT & ASSIGN COLLECTION
// ═══════════════════════════════════════
async function analyzeProduct(details, allCollections) {
  const existingCollections = Object.values(allCollections)
    .map(c => `- ${c.handle}: "${c.title}"`)
    .join("\n");

  const variantSummary = (details.variants || []).slice(0, 5).map(v =>
    `  ${v.variantNameEn || v.variantKey || "variant"}: $${v.variantSellPrice || v.sellPrice}`
  ).join("\n");

  const prompt = `You are a product curator for FurryFable.com — a premium pet accessories store for dogs and cats in the USA.

PRODUCT FROM SUPPLIER:
Name: ${details.productNameEn || details.productName || "Unknown"}
Category: ${details.categoryName || ""}
Description: ${(details.productRemark || "").slice(0, 300)}
Price range: $${details.sellPrice || "0"}
Sample variants:
${variantSummary || "  (no variants)"}

EXISTING SHOPIFY COLLECTIONS:
${existingCollections}

YOUR TASK: Analyze this product and return JSON with:
1. seoTitle: Premium SEO title for Shopify (max 70 chars, include "for Dogs" or "for Cats" if applicable)
2. collection: The handle of the BEST MATCHING existing collection above. ONLY create a new one if this product truly doesn't fit any existing collection.
3. collectionTitle: If using an existing collection, use its exact title. If creating a new one, provide a clean title (e.g. "Pet Grooming").
4. isNewCollection: true ONLY if you're creating a brand new collection
5. tags: Array of 8-10 relevant Shopify tags
6. productType: Short product type label (e.g. "Dog Toy", "Cat Harness")

RULES:
- Prefer existing collections. Be flexible — a grooming glove can go in "Pet Outdoor Supplies" or similar if there's no grooming collection.
- Only set isNewCollection: true if nothing even remotely fits.
- No markdown. Valid JSON only.

{
  "seoTitle": "...",
  "collection": "existing-handle-or-new-handle",
  "collectionTitle": "Exact or New Title",
  "isNewCollection": false,
  "tags": ["tag1", "tag2"],
  "productType": "Dog Toy"
}`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 }
    }
  );

  const text = res.data.candidates[0].content.parts[0].text;
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ═══════════════════════════════════════
// GENERATE PRODUCT DESCRIPTION
// ═══════════════════════════════════════
async function generateDescription(details, seoTitle, collection) {
  const lowestPrice = (details.variants || []).reduce((min, v) => {
    const p = parseFloat(v.variantSellPrice || v.sellPrice || 0);
    return p > 0 && p < min ? p : min;
  }, parseFloat(details.sellPrice || 0)) * 2;

  const prompt = `Write a premium Shopify product description for FurryFable.com.

Product: ${seoTitle}
Category: ${collection}
Starting price: $${lowestPrice.toFixed(2)}

Write in HTML format. Include:
1. A bold opening benefit statement
2. "Key Benefits" section with 5-6 bullet points
3. "Why Pet Parents Love It" section (2-3 paragraphs, warm tone)
4. "Size Guide" section if applicable (use generic S/M/L/XL sizing)
5. "Specifications" section with material, dimensions (estimate based on product type)
6. "What's Included" section
7. A closing note from FurryFable about quality

TONE: Warm, premium, trustworthy. Like talking to a pet parent friend.
NO markdown. Valid HTML only (h3, h4, p, ul, li, strong, em). NEVER use h1 or h2.
NO emojis.

CRITICAL — NEVER include:
- CJ Dropshipping, supplier, manufacturer, factory, wholesale, dropship, dropshipping
- China, Chinese, "ships from", warehouse, processing time, vendor
This is a FurryFable branded product. Write as if FurryFable makes it.`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
    }
  );

  let html = res.data.candidates[0].content.parts[0].text;
  html = html.replace(/```html|```/g, "").trim();

  // Safety: strip any dropshipping signals
  const dropshipPatterns = [
    /\bCJ\s*Dropshipping\b/gi, /\bCJDropshipping\b/gi, /\bdropship(ping)?\b/gi,
    /\bwholesale\b/gi, /\bsupplier\b/gi, /\bmanufacturer\b/gi,
    /\bships?\s+from\s+(china|warehouse|supplier)\b/gi,
    /\b(made\s+in|sourced\s+from)\s+china\b/gi,
    /\bprocessing\s+time\b/gi, /\bvendor\b/gi
  ];
  for (const p of dropshipPatterns) html = html.replace(p, "");

  return html;
}

// ═══════════════════════════════════════
// BUILD SHOPIFY VARIANTS FROM CJ DATA
// ═══════════════════════════════════════
function buildVariants(details) {
  const variants = [];
  const seenOptions = new Map();
  const fallbackPrice = parseFloat(details.sellPrice || 0);

  if (!details.variants || details.variants.length === 0) {
    return [{
      option1: "Default",
      price: (fallbackPrice * 2).toFixed(2),
      compare_at_price: (fallbackPrice * 3).toFixed(2),
      sku: `FF-${details.pid}`,
      weight: 0.5,
      weight_unit: "kg",
      requires_shipping: true
    }];
  }

  for (const v of details.variants) {
    const vPrice = parseFloat(String(v.variantSellPrice || v.sellPrice || fallbackPrice).replace(/[^0-9.]/g, "")) || fallbackPrice;

    let optionName = "";
    if (v.variantKey?.trim()) {
      optionName = v.variantKey.trim().replace(/-/g, " / ");
    } else if (v.variantNameEn?.trim()) {
      optionName = v.variantNameEn.trim();
    } else {
      const parts = [];
      if (v.variantColor?.trim()) parts.push(v.variantColor.trim());
      if (v.variantSize?.trim()) parts.push(v.variantSize.trim());
      if (parts.length > 0) optionName = parts.join(" / ");
    }
    if (!optionName && v.variantSku) {
      const skuParts = v.variantSku.split("-");
      const suffix = skuParts[skuParts.length - 1];
      if (suffix && suffix.length < 30 && !/^\d+$/.test(suffix)) optionName = suffix;
    }
    if (!optionName) optionName = `Style ${variants.length + 1}`;

    const count = seenOptions.get(optionName) || 0;
    seenOptions.set(optionName, count + 1);
    if (count > 0) optionName = `${optionName} #${count + 1}`;

    variants.push({
      option1: optionName.substring(0, 255),
      price: (vPrice * 2).toFixed(2),
      compare_at_price: (vPrice * 3).toFixed(2),
      sku: (v.variantSku || `FF-${details.pid}-${v.vid || "DEF"}`).substring(0, 255),
      weight: parseFloat(v.variantWeight) || 0.5,
      weight_unit: "kg",
      requires_shipping: true
    });
  }

  return variants.slice(0, 100);
}

// ═══════════════════════════════════════
// CREATE SHOPIFY PRODUCT
// ═══════════════════════════════════════
async function createShopifyProduct(details, analysis, description, collectionId) {
  const variants = buildVariants(details);

  const allOptions = variants.map(v => v.option1.toLowerCase()).join(" ");
  let optionTitle = "Style";
  if (/\b(xs|s|m|l|xl|xxl|small|medium|large)\b/.test(allOptions)) optionTitle = "Size";
  else if (/\b(red|blue|black|white|pink|green|grey|gray|brown|yellow|purple)\b/.test(allOptions)) optionTitle = "Color";

  const productData = {
    product: {
      title: analysis.seoTitle.substring(0, 255),
      body_html: description,
      vendor: "FurryFable",
      product_type: analysis.productType || analysis.collection.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      tags: analysis.tags.join(", "),
      status: "draft",
      options: [{ name: optionTitle }],
      variants
    }
  };

  const res = await shopify.post("/products.json", productData);
  const newProduct = res.data.product;

  // Upload images
  const imageUrls = [];
  if (details.productImage) imageUrls.push(details.productImage);
  if (details.productImageSet) {
    for (const img of details.productImageSet.slice(0, 9)) {
      if (img && !imageUrls.includes(img)) imageUrls.push(img);
    }
  }

  let uploadedImages = 0;
  for (const imgUrl of imageUrls.slice(0, 10)) {
    try {
      const imgResponse = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 15000 });
      const base64 = Buffer.from(imgResponse.data).toString("base64");
      const ext = imgUrl.split(".").pop()?.split("?")[0] || "jpg";
      await shopify.post(`/products/${newProduct.id}/images.json`, {
        image: {
          attachment: base64,
          filename: `furryfable-${details.pid}-${uploadedImages + 1}.${ext}`,
          alt: analysis.seoTitle,
          position: uploadedImages + 1
        }
      });
      uploadedImages++;
    } catch (err) {
      console.warn(`  Image upload failed: ${err.message}`);
    }
  }
  console.log(`  Images: ${uploadedImages}/${imageUrls.length} uploaded`);

  // Add to collection
  if (collectionId) {
    await shopify.post("/collects.json", {
      collect: { product_id: newProduct.id, collection_id: collectionId }
    });
    console.log(`  Added to collection: ${analysis.collection}`);
  }

  // SEO metafields
  const lowestPrice = Math.min(...variants.map(v => parseFloat(v.price)));
  for (const mf of [
    { key: "title_tag", value: analysis.seoTitle.substring(0, 60) },
    { key: "description_tag", value: `Shop ${analysis.seoTitle} at FurryFable. Free USA shipping, premium quality, hassle-free returns.` }
  ]) {
    try {
      await shopify.post(`/products/${newProduct.id}/metafields.json`, {
        metafield: { namespace: "global", ...mf, type: "single_line_text_field" }
      });
    } catch (_) {}
  }

  return newProduct;
}

// ═══════════════════════════════════════
// LOG TO GOOGLE SHEETS
// ═══════════════════════════════════════
async function logToSheet(details, analysis, shopifyProduct) {
  const lowestCjPrice = Math.min(
    ...(details.variants || []).map(v => parseFloat(v.variantSellPrice || v.sellPrice || details.sellPrice || 0)).filter(p => p > 0),
    parseFloat(details.sellPrice || 0)
  );

  const row = [
    new Date().toISOString().split("T")[0],
    details.pid,
    details.productNameEn || details.productName || "",
    `$${lowestCjPrice.toFixed(2)}`,
    analysis.seoTitle,
    `$${(lowestCjPrice * 2).toFixed(2)}`,
    `$${(lowestCjPrice * 3).toFixed(2)}`,
    analysis.collection,
    "DRAFT",
    `https://cjdropshipping.com/product/${details.pid}`,
    `https://www.furryfable.com/products/${shopifyProduct.handle}`,
    "Manual URL import"
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "ProductImports!A:L",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log("=== FurryFable CJ Import by URL ===\n");

  const pids = extractPids(CJ_PRODUCT_URLS);
  if (pids.length === 0) {
    console.error("No product URLs/PIDs provided. Set CJ_PRODUCT_URLS env var.");
    process.exit(1);
  }
  console.log(`PIDs to import: ${pids.join(", ")}\n`);

  await getAccessToken();

  console.log("Loading Shopify collections...");
  const allCollections = await loadAllCollections();
  console.log(`Found ${Object.keys(allCollections).length} existing collections:`);
  Object.values(allCollections).forEach(c => console.log(`  - ${c.handle}: "${c.title}"`));

  let imported = 0;

  for (let i = 0; i < pids.length; i++) {
    const pid = pids[i];
    console.log(`\n[${i + 1}/${pids.length}] Processing PID: ${pid}`);

    try {
      // Fetch product details
      console.log("  Fetching CJ product details...");
      const details = await getProductDetails(pid);
      if (!details) {
        console.log("  ⚠️ SKIPPED — product not found or removed on CJ");
        continue;
      }

      const variants = details.variants || [];
      const totalStock = variants.reduce((sum, v) => sum + (parseInt(v.variantStock) || 0), 0);
      if (variants.length > 0 && totalStock === 0) {
        console.log(`  ⚠️ SKIPPED — all variants out of stock`);
        continue;
      }

      console.log(`  ✓ Found: "${details.productNameEn || details.productName}"`);
      console.log(`  Variants: ${variants.length}, Stock: ${totalStock}`);

      // AI analysis
      console.log("  Analyzing with Gemini...");
      const analysis = await analyzeProduct(details, allCollections);
      console.log(`  SEO Title: ${analysis.seoTitle}`);
      console.log(`  Collection: ${analysis.collection} (${analysis.isNewCollection ? "NEW" : "existing"})`);
      console.log(`  Tags: ${analysis.tags.join(", ")}`);

      // Ensure collection exists
      const collectionId = await ensureCollection(analysis.collection, analysis.collectionTitle, allCollections);

      // Generate description
      console.log("  Generating description...");
      const description = await generateDescription(details, analysis.seoTitle, analysis.collectionTitle);

      // Create Shopify product
      console.log("  Creating Shopify product...");
      const shopifyProduct = await createShopifyProduct(details, analysis, description, collectionId);

      // Log to sheet
      try {
        await logToSheet(details, analysis, shopifyProduct);
        console.log("  Logged to Google Sheets");
      } catch (err) {
        console.warn(`  Sheet logging failed: ${err.message}`);
      }

      console.log(`  ✅ Done: https://www.furryfable.com/products/${shopifyProduct.handle}`);
      console.log(`  Admin: https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.split(".")[0]}/products/${shopifyProduct.id}`);
      imported++;

      // Rate limit
      if (i < pids.length - 1) await new Promise(r => setTimeout(r, 3000));

    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}`);
      if (err.response) {
        console.error(`  Status: ${err.response.status}`);
        console.error(`  Body: ${JSON.stringify(err.response.data)}`);
      }
    }
  }

  console.log(`\n=== Complete: ${imported}/${pids.length} products imported as DRAFT ===`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  if (err.response) {
    console.error("Status:", err.response.status);
    console.error("Data:", JSON.stringify(err.response.data));
  }
  process.exit(1);
});
