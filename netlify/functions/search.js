const cloudscraper = require('cloudscraper');

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
        console.log(`Result:`, result);
        
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
        const html = await cloudscraper.get(searchUrl);
        console.log(`Got HTML, length: ${html.length}`);

        // Look for heading patterns
        const headingRegex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        let checked = 0;
        while ((match = headingRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2].trim();
            checked++;
            
            console.log(`Checking (${checked}): ${title}`);
            
            const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                console.log(`✓ MATCH: ${title}`);
                return { found: true, tpb: { title, link } };
            }
        }

        console.log(`Checked ${checked} headings, no TPB found`);
        return { found: false };
    } catch (err) {
        console.error(`Error:`, err.message);
        return { found: false, error: err.message };
    }
}
