/**
 * Sitemap Generator for StarGuide
 * Generates sitemap.xml with all character pages and view pages
 * Run: node scripts/generate-sitemap.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://starguide-bay.vercel.app';
const TODAY = new Date().toISOString().split('T')[0];

// Get character IDs from the characters directory
function getCharacterIds() {
  const charactersDir = join(__dirname, '../src/data/characters');
  const files = readdirSync(charactersDir);

  return files
    .filter(f => f.endsWith('.ts'))
    .map(f => f.replace('.ts', ''));
}

function generateSitemap() {
  const characterIds = getCharacterIds();

  console.log(`Found ${characterIds.length} characters`);

  const entries = [
    // Home page - highest priority
    { loc: '/', lastmod: TODAY, changefreq: 'daily', priority: '1.0' },

    // View pages - high priority
    { loc: '/best-teams', lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
    { loc: '/pull-advisor', lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
    { loc: '/banner-advisor', lastmod: TODAY, changefreq: 'daily', priority: '0.9' },

    // Character pages - medium-high priority
    ...characterIds.map(id => ({
      loc: `/character/${id}`,
      lastmod: TODAY,
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url>
    <loc>${BASE_URL}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return xml;
}

// Run
const sitemap = generateSitemap();
const outputPath = join(__dirname, '../public/sitemap.xml');
writeFileSync(outputPath, sitemap);

console.log(`Generated sitemap.xml with ${sitemap.split('<url>').length - 1} URLs`);
console.log(`Output: ${outputPath}`);
