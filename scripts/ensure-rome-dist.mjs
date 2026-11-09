import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sdkDistDir = path.join(rootDir, "node_modules", "@rome-protocol", "sdk", "dist");
const vendorDistDir = path.join(rootDir, "vendor", "rome-sdk-dist");

if (!fs.existsSync(path.join(sdkDistDir, "index.js")) && fs.existsSync(vendorDistDir)) {
  fs.mkdirSync(sdkDistDir, { recursive: true });
  fs.cpSync(vendorDistDir, sdkDistDir, { recursive: true });
  console.log("[postinstall] Populated @rome-protocol/sdk/dist from vendor/rome-sdk-dist");
}
