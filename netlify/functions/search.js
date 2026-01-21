const https = require('https');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    try {
        const { series } = JSON.parse(event.body);
        if (!series) {
            return { statusCode: 400, body: JSON.stringify({ error: 'series required', found: false }) };
        }

        const result = await searchGetcomics(series);
        return { 
            statusCode: 200, 
            body: JSON.stringify(result),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        console.error('Search error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message, found: false }) };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    const html = await fetchUrl(searchUrl);
    
    const headingRegex = /<h[2-4]>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
    
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
        const title = match[2].trim();
        const link = match[1];
        
        if (/\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title) 
            && !/\s#\d+\s*\(/i.test(title)) {
            return { found: true, tpb: { title, link } };
        }
    }

    return { found: false };
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, 
            { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        ).on('error', reject);
    });
}
