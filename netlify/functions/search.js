const axios = require('axios');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { series } = JSON.parse(event.body);
        if (!series) {
            return { statusCode: 400, body: JSON.stringify({ error: 'series required', found: false }) };
        }

        console.log(`Searching for: ${series}`);
        const result = await searchGetcomics(series);
        
        return { 
            statusCode: 200, 
            body: JSON.stringify(result),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        console.error('Search error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: err.message, found: false }) };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        console.log(`Fetching: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
            },
            timeout: 30000,
            maxRedirects: 5
        });

        const html = response.data;
        console.log(`Got HTML: ${html.length} bytes`);

        // Check if we got Cloudflare challenge
        if (html.includes('Just a moment') || html.includes('cf_challenge')) {
            console.log('⚠️ Cloudflare challenge detected');
            return { found: false, error: 'Cloudflare blocked request' };
        }

        // Look for heading patterns
        const headingRegex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        let checked = 0;
        while ((match = headingRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2].trim();
            checked++;
            
            console.log(`[${checked}] ${title}`);
            
            const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                console.log(`✓ FOUND: ${title}`);
                return { found: true, tpb: { title, link } };
            }
        }

        console.log(`Checked ${checked} results, no TPB matched`);
        return { found: false };
    } catch (err) {
        console.error(`Fetch error: ${err.message}`);
        if (err.response?.status === 403) {
            return { found: false, error: 'Blocked by Cloudflare (403)' };
        }
        return { found: false, error: err.message };
    }
}
