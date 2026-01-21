const https = require('https');
const { JSDOM } = require('jsdom');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    try {
        const { series } = JSON.parse(event.body);
        const result = await searchGetcomics(series);

        return {
            statusCode: 200,
            body: JSON.stringify(result),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        console.error('Search error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    const html = await fetchUrl(searchUrl);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const articles = doc.querySelectorAll('article.item');
    
    for (const article of articles) {
        const title = article.querySelector('h2 a')?.textContent || '';
        const link = article.querySelector('h2 a')?.getAttribute('href') || '';
        
        // Check if title contains "TPB", "Trade Paperback", or "Volume"
        if (/tpb|trade\s*paperback|vol(?:ume)?/i.test(title)) {
            return {
                found: true,
                tpb: {
                    title: title.trim(),
                    link: link
                }
            };
        }
    }

    return { found: false };
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}
