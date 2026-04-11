import axios from "axios";
import { google } from "googleapis";
import { searchPetProducts, getProductDetails, isProductAvailable } from "./cjClient.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

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
// COLLECTION MAPPING
// ═══════════════════════════════════════
const COLLECTION_MAP = {
  "pet-toys": null,
  "dog-toys": null,
  "cat-toys": null,
  "pet-water-bottle": null,
  "pet-apparels": null,
  "harness-and-leash": null,
  "pet-outdoor-supplies": null,
  "safety-high-tech-gear": null,
  "training-control-gear": null,
  "comfort-luxury-anxiety-solutions": null
};

async function loadCollections() {
  try {
    const res = await shopify.get("/custom_collections.json", { params: { limit: 250 } });
    const collections = res.data.custom_collections || [];

    for (const col of collections) {
      if (COLLECTION_MAP.hasOwnProperty(col.handle)) {
        COLLECTION_MAP[col.handle] = col.id;
      }
    }

    // Also check smart collections
    const smartRes = await shopify.get("/smart_collections.json", { params: { limit: 250 } });
    for (const col of smartRes.data.smart_collections || []) {
      if (COLLECTION_MAP.hasOwnProperty(col.handle)) {
        COLLECTION_MAP[col.handle] = col.id;
      }
    }

    console.log("Loaded collections:", Object.entries(COLLECTION_MAP).filter(([,v]) => v).map(([k]) => k).join(", "));
  } catch (err) {
    console.warn("Could not load collections:", err.message);
  }
}

// ═══════════════════════════════════════
// GET EXISTING PRODUCTS TO AVOID DUPLICATES
// ═══════════════════════════════════════
async function getExistingProductTitles() {
  const titles = new Set();
  let url = "/products.json?limit=250&fields=title";

  while (url) {
    try {
      const res = await shopify.get(url);
      const products = res.data.products || [];
      products.forEach(p => titles.add(p.title.toLowerCase().trim()));

      // Cursor-based pagination via Link header
      const linkHeader = res.headers?.link || "";
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        // Extract path from full URL
        const nextUrl = new URL(nextMatch[1]);
        url = nextUrl.pathname.replace(`/admin/api/${SHOPIFY_API_VERSION}`, "") + nextUrl.search;
      } else {
        url = null;
      }
    } catch (err) {
      console.warn("Error fetching products:", err.message);
      url = null;
    }
  }

  return titles;
}

// ═══════════════════════════════════════
// AI PRODUCT SELECTOR
// ═══════════════════════════════════════
async function selectBestProducts(cjProducts, existingTitles) {
  // Filter products with reasonable pricing and data
  const candidates = cjProducts.filter(p => {
    const price = parseFloat(p.sellPrice || 0);
    return price >= 1 && price <= 30 && p.productNameEn;
  });

  if (candidates.length === 0) return [];

  const productSummaries = candidates.slice(0, 80).map((p, i) => ({
    index: i,
    name: p.productNameEn,
    price: p.sellPrice,
    image: p.productImage,
    pid: p.pid
  }));

  const existingList = [...existingTitles].join("\n- ");

  const prompt = `
You are a product curator for FurryFable.com — a premium pet accessories store for dogs and cats.

EXISTING PRODUCTS IN STORE (DO NOT PICK DUPLICATES OR VERY SIMILAR):
- ${existingList}

CANDIDATE PRODUCTS FROM SUPPLIER:
${JSON.stringify(productSummaries, null, 2)}

YOUR TASK: Select the TOP 5 products to add to the store. ALL products below are verified IN-STOCK and available on CJ Dropshipping.

SELECTION CRITERIA:
1. HIGH DEMAND: Products pet parents actively search for and buy
2. VISUAL APPEAL: Products that photograph well and look premium
3. NOT DUPLICATE: Must not overlap with existing store products
4. GOOD MARGIN: CJ price should allow healthy markup at 2x
5. USA TRENDING: Products that are trending in the US pet market
6. FITS BRAND: Matches FurryFable's premium pet brand positioning
7. SOLVES A PROBLEM: Products that solve real pet parent pain points sell best

CATEGORY ASSIGNMENT (assign each product to exactly ONE):
- pet-toys (general pet toys)
- dog-toys (dog-specific toys)
- cat-toys (cat-specific toys)
- pet-water-bottle (feeders, water bottles, bowls)
- pet-apparels (clothing, sweaters, jackets, costumes)
- harness-and-leash (harnesses, leashes, collars)
- pet-outdoor-supplies (car seats, backpacks, outdoor gear)
- safety-high-tech-gear (AirTag collars, safety items, tech)
- training-control-gear (muzzles, training aids, anxiety vests)
- comfort-luxury-anxiety-solutions (calming products, beds, mats)

IMPORTANT: Only select REAL PET PRODUCTS. Do NOT select:
- Car toys, RC cars, robot toys, children's toys
- Furniture, shoe racks, storage items
- Phone accessories, car accessories
- Anything not directly for dogs or cats

Return JSON array of exactly 5 selected products:
[
  {
    "index": 0,
    "reason": "why this product will sell well",
    "collection": "harness-and-leash",
    "seoTitle": "Premium SEO-optimized product title (include 'for Dogs' or 'for Cats', max 70 chars)",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  }
]

Rules:
- No markdown, only valid JSON
- Pick products that COMPLEMENT existing catalog, don't duplicate
- Prefer products with clear pet appeal
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 }
    }
  );

  const text = res.data.candidates[0].content.parts[0].text;
  const selections = JSON.parse(text.replace(/```json|```/g, "").trim());

  return selections.map(sel => ({
    ...sel,
    product: candidates[sel.index]
  }));
}

// ═══════════════════════════════════════
// GENERATE SEO PRODUCT DESCRIPTION
// ═══════════════════════════════════════
async function generateProductDescription(product, seoTitle, collection) {
  const prompt = `
Write a premium Shopify product description for FurryFable.com.

Product: ${seoTitle}
Original name: ${product.productNameEn}
Category: ${collection}
Price will be: $${(parseFloat(product.sellPrice) * 2).toFixed(2)}

Write in HTML format. Include:
1. A bold opening benefit statement
2. "Key Benefits" section with 5-6 bullet points
3. "Why Pet Parents Love It" section (2-3 paragraphs, warm tone)
4. "Size Guide" section if applicable (use generic S/M/L/XL sizing)
5. "Specifications" section with material, dimensions (estimate based on product type)
6. "What's Included" section
7. A closing note from FurryFable about quality

TONE: Warm, premium, trustworthy. Like talking to a pet parent friend.
NO markdown. Valid HTML only (h2, h3, p, ul, li, strong, em).
NO emojis in the description.
Do NOT mention CJ Dropshipping, China, or any supplier.
`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
    }
  );

  let html = res.data.candidates[0].content.parts[0].text;
  html = html.replace(/```html|```/g, "").trim();
  return html;
}

// ═══════════════════════════════════════
// CREATE PRODUCT ON SHOPIFY (DRAFT)
// ═══════════════════════════════════════
async function createShopifyProduct(product, selection) {
  // Parse price — CJ sometimes returns ranges like "15.88 -- 21.25"
  const priceStr = String(product.sellPrice || "0");
  const cjPrice = parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
  const storePrice = (cjPrice * 2).toFixed(2);
  const compareAtPrice = (cjPrice * 3).toFixed(2); // 3x for "Save 33%" badge

  console.log(`  Generating description for: ${selection.seoTitle}`);
  const description = await generateProductDescription(product, selection.seoTitle, selection.collection);

  // Get full product details for variants and images (use cached if available)
  const details = product._cachedDetails || await getProductDetails(product.pid);

  // Build images array
  // Collect image URLs for later upload
  const imageUrls = [];
  if (details?.productImage) {
    imageUrls.push(details.productImage);
  }
  if (details?.productImageSet) {
    for (const img of details.productImageSet.slice(0, 9)) {
      if (img && !imageUrls.includes(img)) {
        imageUrls.push(img);
      }
    }
  }

  // Build variants from CJ product
  // Shopify requires unique option1 values — deduplicate by appending index
  const variants = [];
  const seenOptions = new Map(); // track option name occurrences

  if (details?.variants && details.variants.length > 0) {
    // Log first variant's full structure to debug field names
    console.log("  DEBUG first CJ variant keys:", Object.keys(details.variants[0]).join(", "));
    console.log("  DEBUG first CJ variant data:", JSON.stringify(details.variants[0]).substring(0, 600));
    if (details.variants.length > 1) {
      console.log("  DEBUG second CJ variant data:", JSON.stringify(details.variants[1]).substring(0, 600));
    }

    // Helper: check if a string is just dimension data like "long=880,width=130,height=76"
    const isDimensionString = (s) => /^(long|width|height|length|weight|size)=/i.test(s);

    // Helper: parse dimension string to readable format
    const parseDimensions = (s) => {
      const parts = s.split(",").map(p => {
        const [key, val] = p.split("=");
        if (!val) return p;
        const mm = parseFloat(val);
        if (isNaN(mm)) return `${key}: ${val}`;
        // Convert mm to cm for readability
        return mm >= 10 ? `${(mm / 10).toFixed(0)}cm` : `${mm}mm`;
      });
      return parts.join(" × ");
    };

    // Helper: extract color from variant image URL
    const extractColorFromImage = (imgUrl) => {
      if (!imgUrl) return null;
      const colors = ["red", "blue", "black", "white", "pink", "green", "grey", "gray",
        "brown", "yellow", "purple", "orange", "beige", "navy", "khaki", "coffee",
        "wine", "camel", "apricot", "ivory", "cream", "teal", "coral", "mint",
        "lavender", "olive", "burgundy", "charcoal", "tan", "gold", "silver"];
      const urlLower = imgUrl.toLowerCase();
      for (const color of colors) {
        if (urlLower.includes(color)) return color.charAt(0).toUpperCase() + color.slice(1);
      }
      return null;
    };

    // First pass: analyze what differentiates variants
    const allProperties = details.variants.map(v => v.variantProperty || "");
    const allNames = details.variants.map(v => v.variantNameEn || v.variantName || "");
    const allSame = (arr) => arr.every(x => x === arr[0]);

    // If all properties are the same dimension string, they're useless for differentiation
    const propertiesAreDimensions = allProperties.length > 0 && allProperties.every(p => isDimensionString(p));
    const propertiesAllSame = allSame(allProperties);

    for (const v of details.variants) {
      const vPrice = parseFloat(String(v.variantSellPrice || v.sellPrice || cjPrice).replace(/[^0-9.]/g, "")) || cjPrice;

      let optionParts = [];

      // 1. Try explicit color field first
      if (v.variantColor && v.variantColor.trim()) {
        optionParts.push(v.variantColor.trim());
      }

      // 2. Try explicit size field
      if (v.variantSize && v.variantSize.trim()) {
        optionParts.push(v.variantSize.trim());
      }

      // 3. Try name fields (skip if it's just "Default" or same for all variants)
      if (optionParts.length === 0) {
        const name = (v.variantNameEn || v.variantName || "").trim();
        if (name && name.toLowerCase() !== "default" && (!allSame(allNames) || allNames.length === 1)) {
          optionParts.push(name);
        }
      }

      // 4. Try property field — but only if NOT dimension-only data, and varies between variants
      if (optionParts.length === 0 && v.variantProperty && v.variantProperty.trim()) {
        const prop = v.variantProperty.trim();
        if (!isDimensionString(prop)) {
          optionParts.push(prop);
        } else if (!propertiesAllSame) {
          // Dimensions differ between variants — convert to readable format
          optionParts.push(parseDimensions(prop));
        }
        // If dimensions are all the same, skip them entirely
      }

      // 5. Try variantStandard, variantAttr, variantUnit
      if (optionParts.length === 0) {
        for (const field of [v.variantStandard, v.variantAttr, v.variantUnit]) {
          if (field && typeof field === "string" && field.trim() && !isDimensionString(field.trim())) {
            optionParts.push(field.trim());
            break;
          }
        }
      }

      // 6. Try to extract color from variant image URL
      if (optionParts.length === 0 && v.variantImage) {
        const colorFromImg = extractColorFromImage(v.variantImage);
        if (colorFromImg) {
          optionParts.push(colorFromImg);
        }
      }

      // 7. Last resort: use SKU suffix or variant index
      if (optionParts.length === 0) {
        const sku = v.variantSku || "";
        const skuSuffix = sku.split("-").pop() || sku.split("_").pop() || "";
        if (skuSuffix && skuSuffix.length < 20 && skuSuffix !== sku) {
          optionParts.push(`Style ${skuSuffix}`);
        } else {
          optionParts.push(`Style ${variants.length + 1}`);
        }
      }

      let optionName = optionParts.join(" / ");

      // Ensure uniqueness — if duplicate, append counter
      const count = seenOptions.get(optionName) || 0;
      seenOptions.set(optionName, count + 1);
      if (count > 0) {
        optionName = `${optionName} #${count + 1}`;
      }

      variants.push({
        option1: optionName.substring(0, 255),
        price: (vPrice * 2).toFixed(2),
        compare_at_price: (vPrice * 3).toFixed(2),
        sku: (v.variantSku || `FF-${product.pid}-${v.vid || "DEF"}`).substring(0, 255),
        weight: parseFloat(v.variantWeight) || 0.5,
        weight_unit: "kg",
        requires_shipping: true
      });
    }

    // Log what variant names we built
    console.log(`  Variant names: ${variants.map(v => v.option1).join(", ")}`);
  } else {
    variants.push({
      option1: "Default",
      price: storePrice,
      compare_at_price: compareAtPrice,
      sku: `FF-${product.pid}`,
      weight: 0.5,
      weight_unit: "kg",
      requires_shipping: true
    });
  }

  // Limit to 100 variants (Shopify max)
  const finalVariants = variants.slice(0, 100);

  // Determine option name based on variant names
  let optionTitle = "Style";
  const allOptions = finalVariants.map(v => v.option1.toLowerCase()).join(" ");
  if (/\b(xs|s|m|l|xl|xxl|small|medium|large)\b/.test(allOptions)) {
    optionTitle = "Size";
  } else if (/\b(red|blue|black|white|pink|green|grey|gray|brown|yellow|purple)\b/.test(allOptions)) {
    optionTitle = "Color";
  }

  // Create product WITHOUT images first (images added after)
  const productData = {
    product: {
      title: selection.seoTitle.substring(0, 255),
      body_html: description,
      vendor: "FurryFable",
      product_type: selection.collection.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      tags: selection.tags.join(", "),
      status: "draft",
      options: [{ name: optionTitle }],
      variants: finalVariants
    }
  };

  const res = await shopify.post("/products.json", productData);
  const newProduct = res.data.product;

  // Download CJ images and upload as base64 to Shopify CDN
  let uploadedImages = 0;
  for (const imgUrl of imageUrls.slice(0, 10)) {
    try {
      // Download image from CJ
      const imgResponse = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 15000
      });

      const base64 = Buffer.from(imgResponse.data).toString("base64");
      const ext = imgUrl.split(".").pop()?.split("?")[0] || "jpg";
      const filename = `furryfable-${product.pid}-${uploadedImages + 1}.${ext}`;

      // Upload as base64 to Shopify (bypasses URL validation entirely)
      await shopify.post(`/products/${newProduct.id}/images.json`, {
        image: {
          attachment: base64,
          filename: filename,
          alt: selection.seoTitle,
          position: uploadedImages + 1
        }
      });

      uploadedImages++;
      console.log(`  Image ${uploadedImages} uploaded`);
    } catch (imgErr) {
      console.warn(`  Image upload failed: ${imgErr.message}`);
    }
  }
  console.log(`  Total images: ${uploadedImages}/${imageUrls.length}`);

  // Add to collection
  const collectionId = COLLECTION_MAP[selection.collection];
  if (collectionId) {
    try {
      await shopify.post("/collects.json", {
        collect: {
          product_id: newProduct.id,
          collection_id: collectionId
        }
      });
      console.log(`  Added to collection: ${selection.collection}`);
    } catch (err) {
      console.warn(`  Could not add to collection: ${err.message}`);
    }
  }

  // Set SEO meta description
  try {
    await shopify.post(`/products/${newProduct.id}/metafields.json`, {
      metafield: {
        namespace: "global",
        key: "description_tag",
        value: `Shop ${selection.seoTitle} at FurryFable. Free USA shipping, premium quality, hassle-free returns. Perfect for your furry friend.`,
        type: "single_line_text_field"
      }
    });
  } catch (err) {
    console.warn(`  Meta description failed: ${err.message}`);
  }

  return newProduct;
}

// ═══════════════════════════════════════
// LOG TO GOOGLE SHEETS
// ═══════════════════════════════════════
async function ensureProductSheet() {
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ProductImports!A1"
    });
    console.log("ProductImports sheet exists:", existing.data?.values?.[0]?.[0] || "(empty)");
  } catch (err) {
    console.log("ProductImports sheet not found, creating...", err.message);
    try {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "ProductImports" } } }]
        }
      });
      console.log("ProductImports sheet created");
    } catch (createErr) {
      // Sheet might already exist with a different case or issue
      console.warn("Could not create ProductImports sheet:", createErr.message);
    }

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: "ProductImports!A1:L1",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            "Date", "CJ PID", "CJ Product Name", "CJ Price",
            "Store Title", "Store Price", "Compare At Price",
            "Collection", "Status", "CJ Link", "Store Link", "Selection Reason"
          ]]
        }
      });
      console.log("ProductImports headers written");
    } catch (headerErr) {
      console.warn("Could not write headers:", headerErr.message);
    }
  }
}

async function logProductToSheet(product, selection, shopifyProduct) {
  const cjPrice = parseFloat(product.sellPrice);
  const storePrice = (cjPrice * 2).toFixed(2);
  const compareAt = (cjPrice * 3).toFixed(2);

  const row = [
    new Date().toISOString().split("T")[0],
    product.pid,
    product.productNameEn,
    `$${cjPrice.toFixed(2)}`,
    selection.seoTitle,
    `$${storePrice}`,
    `$${compareAt}`,
    selection.collection,
    "DRAFT",
    `https://cjdropshipping.com/product/${product.pid}`,
    `https://www.furryfable.com/products/${shopifyProduct.handle}`,
    selection.reason
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "ProductImports!A:L",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

// ═══════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════
async function main() {
  console.log("=== FurryFable CJ Product Importer ===\n");

  // Load existing data
  console.log("Loading existing store data...");
  const [existingTitles] = await Promise.all([
    getExistingProductTitles(),
    loadCollections(),
    ensureProductSheet()
  ]);
  console.log(`Existing products: ${existingTitles.size}`);

  // Search CJ for pet products
  console.log("\nSearching CJ Dropshipping (USA warehouse)...");
  const cjProducts = await searchPetProducts();

  if (cjProducts.length === 0) {
    console.log("No verified products found. Exiting.");
    return;
  }

  // AI selects the best 5 products — ALL products are pre-validated as available
  console.log("\nAI selecting best 5 from verified products...");
  const selections = await selectBestProducts(cjProducts, existingTitles);
  console.log(`AI selected ${selections.length} products\n`);

  // Import each selected product — no need to re-validate, already confirmed available
  let imported = 0;

  for (const sel of selections) {
    try {
      console.log(`\n[${imported + 1}/5] Importing: ${sel.seoTitle}`);
      console.log(`  CJ PID: ${sel.product.pid}`);
      console.log(`  CJ Price: $${sel.product.sellPrice} -> Store: $${(parseFloat(sel.product.sellPrice) * 2).toFixed(2)}`);
      console.log(`  Collection: ${sel.collection}`);
      console.log(`  Reason: ${sel.reason}`);

      const shopifyProduct = await createShopifyProduct(sel.product, sel);

      try {
        await logProductToSheet(sel.product, sel, shopifyProduct);
        console.log(`  📊 Logged to Google Sheets`);
      } catch (sheetErr) {
        console.warn(`  ⚠️ Sheet logging failed: ${sheetErr.message}`);
      }

      console.log(`  ✅ Created as DRAFT: ${shopifyProduct.handle}`);
      console.log(`  Admin: https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.split('.')[0]}/products/${shopifyProduct.id}`);

      imported++;

      // Rate limit between imports
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}`);
      if (err.response) {
        console.error(`  Status: ${err.response.status}`);
        console.error(`  Shopify says: ${JSON.stringify(err.response.data)}`);
      }
    }
  }

  console.log(`\n=== Import Complete: ${imported}/${selections.length} products added as DRAFT ===`);
  console.log("Review them in Shopify Admin -> Products -> Drafts");

  // Verify sheet data was written
  try {
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ProductImports!A:B"
    });
    const rows = sheetData.data.values || [];
    console.log(`\n📊 ProductImports sheet has ${rows.length} rows (including header)`);
    if (rows.length > 1) {
      console.log(`📊 Latest entry: ${rows[rows.length - 1][0]} - ${rows[rows.length - 1][1]}`);
    }
  } catch (verifyErr) {
    console.warn(`⚠️ Could not verify sheet data: ${verifyErr.message}`);
  }

  // GitHub Actions masks secrets in logs — print sheet URL in a way that won't be masked
  console.log(`\n📊 Go to Google Sheets → look for the "ProductImports" tab`);
  console.log(`📊 Direct link: https://docs.google.com/spreadsheets/d/` + SPREADSHEET_ID + `/edit`);
  console.log(`📊 (Note: If the link above shows *** GitHub Actions is masking the secret. Copy the GOOGLE_SHEET_ID from your GitHub Secrets and open: https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit)`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  if (err.response) {
    console.error("Status:", err.response.status);
    console.error("Data:", JSON.stringify(err.response.data));
    console.error("URL:", err.config?.url);
  }
  process.exit(1);
});
