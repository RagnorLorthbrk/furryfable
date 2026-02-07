import fs from "fs";
import path from "path";
import { generateMetadata } from "./metadataGenerator.js";

console.log("Starting blog metadata automation…");

// Locate latest blog file
const blogDir = path.resolve("blog");

const blogFiles = fs
  .readdirSync(blogDir)
  .filter(f => f.endsWith(".md"))
  .map(f => ({
    file: f,
    time: fs.statSync(path.join(blogDir, f)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time);

if (blogFiles.length === 0) {
  console.log("No blog files found. Exiting safely.");
  process.exit(0);
}

const blogPath = path.join("blog", blogFiles[0].file);
console.log(`Using latest blog: ${blogPath}`);

// Read blog content
const blogContent = fs.readFileSync(blogPath, "utf-8");

// Generate metadata
const metadata = await generateMetadata(blogContent);

console.log("Generated metadata:");
console.log(metadata);

// STOP HERE FOR NOW
console.log("Metadata generation complete. Shopify update next.");
