import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "netlify-site");
const instagramUrl = "https://www.instagram.com/rx8_real_estate_leasing/";

function renderStaticHtml(html) {
  return html
    .replace(/{{\s*url_for\('static', filename='style\.css', v='[^']*'\)\s*}}/g, "/static/style.css")
    .replace(/{{\s*url_for\('static', filename='app\.js', v='[^']*'\)\s*}}/g, "/static/app.js")
    .replace(/{{\s*contact\.email\s*}}/g, "")
    .replace(/{{\s*contact\.form_url\s*}}/g, "")
    .replace(/{{\s*contact\.instagram\s*}}/g, instagramUrl);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "static"), join(output, "static"), { recursive: true });

const indexHtml = await readFile(join(root, "templates", "index.html"), "utf8");
await writeFile(join(output, "index.html"), renderStaticHtml(indexHtml), "utf8");

const successHtml = await readFile(join(root, "templates", "success.html"), "utf8");
await writeFile(join(output, "success.html"), renderStaticHtml(successHtml), "utf8");
