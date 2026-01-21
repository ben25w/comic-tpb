const puppeteer = require('puppeteer');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let browser;
    try {
        const { series } = JSON.parse(event.body);
        if (!series) {
            return { statusCode: 400, body: JSON.stringify({ error: 'series required', found: false }) };
        }

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const result = await searchGetcomics(series, browser);
        
        return { 
            statusCode: 200, 
            body: JSON.stringify(result),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        console.error('Search error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message, found: false }) };
    } finally {
        if (browser) await browser.close();
    }
};

async function searchGetcomics(seriesName, browser) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract titles and links from the page
        const results = await page.evaluate(() => {
            const items = [];
            const headings = document.querySelectorAll('h2 a, h3 a');
            
            for (let i = 0; i < Math.min(headings.length, 20); i++) {
                const title = headings[i].textContent.trim();
                const link = headings[i].href;
                items.push({ title, link });
            }
            return items;
        });

        await page.close();

        // Filter for TPBs
        for (const { title, link } of results) {
            const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                return { found: true, tpb: { title, link } };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Error searching for "${seriesName}":`, err.message);
        return { found: false, error: err.message };
    }
}
