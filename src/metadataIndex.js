import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { generateMetadata } from "./metadataGenerator.js";
import { updateShopifyMetadata } from "./shopifyMetadataPublisher.js";

console.log("Starting blog metadata automation…");

// --- GOOGLE SHEETS SETUP ---
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = "Sheet1!A:F"; // adjust if your sheet name differs

// --- FETCH SHEET DATA ---
const response = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: RANGE
});

const rows = response.data.values;
const headers = rows[0];
const dataRows = rows.slice(1);

// Map column indexes
const colIndex = header =>
  headers.findIndex(h => h.toLowerCase() === header.toLowerCase());

const statusCol = colIndex("Status");
const slugCol = colIndex("Slug");

if (statusCol === -1 || slugCol === -1) {
  throw new Error("Required columns (Status, Slug) not found in sheet");
}

// --- FIND LATEST PUBLISHED BLOG ---
const publishedRows = dataRows.filter(
  r => r[statusCol] === "PUBLISHED" && r[slugCol]
);

if (publishedRows.length === 0) {
  console.log("No published blogs found. Exiting safely.");
  process.exit(0);
}

const latestRow = publishedRows[publishedRows.length - 1];
const blogSlug = latestRow[slugCol];

console.log(`Target blog slug: ${blogSlug}`);

// --- READ BLOG CONTENT FROM REPO ---
const blogPath = path.join("blog", `blog-${blogSlug}.md`);

if (!fs.existsSync(blogPath)) {
  throw new Error(`Blog file not found: ${blogPath}`);
}

const blogContent = fs.readFileSync(blogPath, "utf-8");

// --- GENERATE METADATA ---
const metadata = await generateMetadata(blogContent);
console.log("Generated metadata:", metadata);

// --- UPDATE SHOPIFY ---
await updateShopifyMetadata(blogSlug, metadata);

console.log("Shopify metadata update completed successfully.");
