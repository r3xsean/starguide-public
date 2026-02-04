export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Check if this is a profile URL
  const profileMatch = pathname.match(/^\/u\/([^/]+)\/?$/);

  const baseUrl = 'https://starguide-bay.vercel.app';

  // Fetch the static index.html from the CDN
  const indexUrl = `${baseUrl}/index.html`;
  const indexRes = await fetch(indexUrl);

  if (!indexRes.ok) {
    return new Response('Failed to load app', { status: 500 });
  }

  let html = await indexRes.text();

  // If it's a profile URL, inject custom OG tags
  if (profileMatch) {
    const username = profileMatch[1];
    const ogImageUrl = `${baseUrl}/api/og/${username}.png`;
    const profileUrl = `${baseUrl}/u/${username}`;
    const title = `${username}'s HSR Collection - StarGuide | Honkai Star Rail`;
    const description = `View ${username}'s Honkai Star Rail character collection, teams, and builds on StarGuide.`;

    // Inject OG meta tags
    const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${profileUrl}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="StarGuide">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImageUrl}">
    <link rel="canonical" href="${profileUrl}">`;

    html = html.replace('</head>', `${metaTags}\n  </head>`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600',
    },
  });
}
