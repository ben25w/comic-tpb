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
        console.log(`Searching for: ${seriesName}`);
        
        // Use Browserless to bypass Cloudflare
        const browserlessUrl = `https://chrome.browserless.io/content?token=${process.env.BROWSERLESS_TOKEN}`;
        
        const response = await axios.post(browserlessUrl, {
            url: searchUrl,
            waitForSelector: 'h2 a'
        });

        const html = response.data;
        console.log(`Got content, length: ${html.length}`);

        const headingRegex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        while ((match = headingRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2].trim();
            
            const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                console.log(`✓ Found: ${title}`);
                return { found: true, tpb: { title, link } };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Error: ${err.message}`);
        return { found: false, error: err.message };
    }
}
