import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { generateMetadata } from "./metadataGenerator.js";

console.log("Starting blog metadata automation…");

// Detect newly added blog
const diff = execSync("git diff --name-only HEAD~1", { encoding: "utf-8" });
const blogFiles = diff
  .split("\n")
  .filter(f => f.startsWith("blog/") && f.endsWith(".md"));

if (blogFiles.length === 0) {
  console.log("No new blog detected. Exiting safely.");
  process.exit(0);
}

if (blogFiles.length > 1) {
  console.error("Multiple blogs detected. Aborting for safety.");
  process.exit(1);
}

const blogPath = blogFiles[0];
console.log(`Detected blog: ${blogPath}`);

// Read blog content
const blogContent = fs.readFileSync(
  path.resolve(blogPath),
  "utf-8"
);

// Generate metadata via Gemini
const metadata = await generateMetadata(blogContent);

console.log("Generated metadata:");
console.log(metadata);

// TEMP STOP POINT
// We are NOT touching Shopify yet
console.log("Metadata generation complete. Shopify step coming next.");
