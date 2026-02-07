import fs from "fs";
import path from "path";
import { generateMetadata } from "./metadataGenerator.js";

console.log("Starting blog metadata automation…");

// 1. Locate blog directory
const blogDir = path.resolve("blog");

if (!fs.existsSync(blogDir)) {
  console.log("Blog directory not found. Exiting safely.");
  process.exit(0);
}

// 2. Find latest blog file by modified time
const blogFiles = fs
  .readdirSync(blogDir)
  .filter(file => file.endsWith(".md"))
  .map(file => {
    const fullPath = path.join(blogDir, file);
    const stats = fs.statSync(fullPath);
    return {
      file,
      time: stats.mtime.getTime()
    };
  })
  .sort((a, b) => b.time - a.time);

if (blogFiles.length === 0) {
  console.log("No blog files found. Exiting safely.");
  process.exit(0);
}

// 3. Use most recent blog
const latestBlog = blogFiles[0].file;
const blogPath = path.join(blogDir, latestBlog);

console.log(`Using latest blog file: ${blogPath}`);

// 4. Read blog content
const blogContent = fs.readFileSync(blogPath, "utf-8");

// 5. Generate metadata via Gemini
const metadata = await generateMetadata(blogContent);

console.log("Generated metadata:");
console.log(metadata);

// STOP POINT — Shopify not wired yet
console.log("Metadata generation completed successfully.");
