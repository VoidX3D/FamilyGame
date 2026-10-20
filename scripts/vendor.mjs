/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "web", "vendor");

const files = [
  ["node_modules/gsap/dist/gsap.min.js", "gsap.min.js"],
  ["node_modules/lenis/dist/lenis.min.js", "lenis.min.js"],
  ["node_modules/lenis/dist/lenis.css", "lenis.css"],
  ["node_modules/socket.io-client/dist/socket.io.min.js", "socket.io.min.js"],
];

await mkdir(outDir, { recursive: true });

for (const [from, to] of files) {
  const src = path.join(root, from);
  const dest = path.join(outDir, to);
  await stat(src);
  await copyFile(src, dest);
  console.log(`vendored ${to}`);
}
