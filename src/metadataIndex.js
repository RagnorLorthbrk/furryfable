import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { generateMetadata } from "./metadataGenerator.js";
import { updateShopifyMetadata } from "./shopifyMetadataPublisher.js";

console.log("Starting blog metadata automation…");

// ---------- GOOGLE SHEETS ----------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = "Sheet1!A:F"; // adjust if your sheet name differs

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: RANGE
});

const rows = res.data.values;
if (!rows || rows.length < 2) {
  console.log("Sheet is empty. Exiting safely.");
  process.exit(0);
}

const headers = rows[0];
const dataRows = rows.slice(1);

const col = name =>
  headers.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());

const dateCol = col("Date");
const statusCol = col("Status");
const slugCol = col("Slug");

if (dateCol === -1 || statusCol === -1 || slugCol === -1) {
  throw new Error("Required columns (Date, Status, Slug) not found");
}

// ---------- FILTER PUBLISHED ----------
const published = dataRows.filter(
  r => r[statusCol] === "PUBLISHED" && r[dateCol] && r[slugCol]
);

if (published.length === 0) {
  console.log("No published blogs found. Exiting safely.");
  process.exit(0);
}

// ---------- FIND LATEST DATE ----------
const latestDate = published
  .map(r => r[dateCol])
  .sort()
  .reverse()[0];

console.log(`Latest published date: ${latestDate}`);

// ---------- ALL BLOGS ON LATEST DATE ----------
const targets = published.filter(r => r[dateCol] === latestDate);

console.log(`Blogs to process: ${targets.length}`);

// ---------- PROCESS EACH BLOG ----------
for (const row of targets) {
  const slug = row[slugCol];
  const blogPath = path.join("blog", `blog-${slug}.md`);

  console.log(`\nProcessing blog: ${slug}`);

  if (!fs.existsSync(blogPath)) {
    console.warn(`Blog file not found: ${blogPath}. Skipping.`);
    continue;
  }

  try {
    const blogContent = fs.readFileSync(blogPath, "utf-8");

    const metadata = await generateMetadata(blogContent);

    console.log("Generated metadata:", metadata);

    await updateShopifyMetadata(slug, metadata);

    console.log(`Shopify metadata updated for: ${slug}`);
  } catch (err) {
    console.error(`Failed for blog ${slug}:`, err.message);
    // continue with next blog
  }
}

console.log("\nMetadata automation completed.");
