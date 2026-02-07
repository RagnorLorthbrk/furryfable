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
const RANGE = "blogs!A:F";

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: RANGE
});

const rows = res.data.values;
const headers = rows[0];
const dataRows = rows.slice(1);

const col = name =>
  headers.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());

const dateCol = col("Date");
const statusCol = col("Status");
const slugCol = col("Slug");

// ---------- FILTER PUBLISHED ----------
const published = dataRows.filter(
  r => r[statusCol] === "PUBLISHED" && r[dateCol] && r[slugCol]
);

// ---------- LATEST DATE ----------
const latestDate = published.map(r => r[dateCol]).sort().reverse()[0];
console.log(`Latest published date: ${latestDate}`);

const targets = published.filter(r => r[dateCol] === latestDate);
console.log(`Blogs to process: ${targets.length}`);

// ---------- LOAD BLOG FILES ----------
const blogDir = path.resolve("blog");
const blogFiles = fs.readdirSync(blogDir);

// ---------- PROCESS EACH ----------
for (const row of targets) {
  const slug = row[slugCol];
  console.log(`\nProcessing blog: ${slug}`);

  const blogFile = blogFiles.find(f => f.includes(slug));
  if (!blogFile) {
    console.warn(`No markdown file found for slug: ${slug}`);
    continue;
  }

  const blogContent = fs.readFileSync(
    path.join(blogDir, blogFile),
    "utf-8"
  );

  const metadata = await generateMetadata(blogContent);
  console.log("Generated metadata:", metadata);

  await updateShopifyMetadata(slug, metadata);
}

console.log("\nMetadata automation completed.");
