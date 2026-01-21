const https = require('https');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { series } = JSON.parse(event.body);
        
        if (!series) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'series parameter required' })
            };
        }

        const result = await searchGetcomics(series);
        console.log(`Search result for "${series}":`, result);

        return {
            statusCode: 200,
            body: JSON.stringify(result),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        console.error('Search error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message, found: false })
        };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    console.log('🔗 Searching URL:', searchUrl);
    
    try {
        const html = await fetchUrl(searchUrl);
        console.log('📄 HTML length:', html.length);
        
        // Look for patterns in the raw HTML
        // GetComics uses <h2><a href="...">Title</a></h2> structure
        const headingRegex = /<h[2-4]>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        const matches = [];
        
        while ((match = headingRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2].trim();
            matches.push({ title, link });
            console.log(`Found heading: ${title}`);
        }
        
        console.log(`📊 Total headings found: ${matches.length}`);
        
        // Filter for TPBs
        for (const { title, link } of matches) {
            // Match TPB, Trade Paperback, Vol., Deluxe, Hardcover, Collection, Omnibus
            // But exclude single issues like "#1 (" or "#12 ("
            const isTpb = /\btpb\b|trade\s*paperback|vol(?:ume)?\.?\s*\d|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            console.log(`Checking: "${title}" - TPB:${isTpb}, SingleIssue:${isSingleIssue}`);
            
            if (isTpb && !isSingleIssue) {
                console.log(`✓ MATCH FOUND: ${title}`);
                return {
                    found: true,
                    tpb: { 
                        title: title, 
                        link: link 
                    }
                };
            }
        }

        console.log(`⊘ No TPB found for "${seriesName}"`);
        return { found: false };
    } catch (err) {
        console.error('Search error:', err.message);
        return { found: false, error: err.message };
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout after 15s'));
        }, 15000);

        https.get(url, 
            { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://getcomics.org/'
                },
                timeout: 15000
            }, 
            (res) => {
                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                });
                res.on('end', () => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            }
        ).on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
