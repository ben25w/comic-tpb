const https = require('https');
const { JSDOM } = require('jsdom');

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
    console.log('Searching:', searchUrl);
    
    try {
        const html = await fetchUrl(searchUrl);
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Get all h2 and h3 elements (these are the result titles)
        const resultHeadings = doc.querySelectorAll('h2 a, h3 a');
        
        for (const link of resultHeadings) {
            const title = link.textContent?.trim() || '';
            const href = link.getAttribute('href') || '';
            
            console.log(`Checking result: ${title}`);
            
            // Match TPB, Trade Paperback, Volume, Vol., Hardcover, Deluxe, or Comic (but exclude single issues)
            // Exclude if it contains #1, #2, etc (single issues)
            if (/\btpb\b|trade\s*paperback|vol(?:ume)?\.?\s*\d|hardcover|deluxe|collection|omnibus/i.test(title) 
                && !/\s#\d+\s*\(/i.test(title)) {
                
                console.log(`✓ Found matching TPB: ${title} at ${href}`);
                return {
                    found: true,
                    tpb: { 
                        title: title, 
                        link: href 
                    }
                };
            }
        }

        console.log(`No TPB found for "${seriesName}"`);
        return { found: false };
    } catch (err) {
        console.error('Search error:', err.message);
        return { found: false, error: err.message };
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 15000);

        https.get(url, 
            { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 15000
            }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
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
