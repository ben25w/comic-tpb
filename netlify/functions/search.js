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
        
        const token = process.env.BROWSERLESS_TOKEN;
        console.log(`Token set: ${token ? 'yes' : 'NO'}`);
        
        if (!token) {
            return { found: false, error: 'BROWSERLESS_TOKEN not set' };
        }

        // Correct Browserless API endpoint
        const browserlessUrl = `https://chrome.browserless.io/content`;
        
        console.log(`Calling Browserless...`);
        const response = await axios.post(
            browserlessUrl,
            {
                url: searchUrl,
                waitForSelector: 'h2 a',
            },
            {
                params: { token: token },
                timeout: 30000
            }
        );

        const html = response.data;
        console.log(`Got HTML: ${html.length} bytes`);

        const headingRegex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        let count = 0;
        while ((match = headingRegex.exec(html)) !== null) {
            count++;
            const link = match[1];
            const title = match[2].trim();
            
            console.log(`[${count}] ${title.substring(0, 50)}`);
            
            const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                console.log(`✓ MATCH: ${title}`);
                return { found: true, tpb: { title, link } };
            }
        }

        console.log(`No TPB match in ${count} results`);
        return { found: false };
    } catch (err) {
        console.error(`Fetch error: ${err.message}`);
        console.error(`Status: ${err.response?.status}`);
        console.error(`Data: ${err.response?.data}`);
        return { found: false, error: err.message };
    }
}
