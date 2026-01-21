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
        console.error('Error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ found: false, error: err.message }) };
    }
};

async function searchGetcomics(seriesName) {
    const url = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    const token = process.env.BROWSERLESS_TOKEN;

    if (!token) {
        return { found: false, error: 'No token' };
    }

    try {
        const res = await axios.post(
            'https://chrome.browserless.io/content?token=' + token,
            { url }
        );

        const html = res.data;
        const regex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const title = match[2].trim();
            if (/tpb|trade.*paperback|vol\d|hardcover|deluxe|omnibus/i.test(title) && !/\s#\d+\s*\(/.test(title)) {
                return { found: true, tpb: { title, link: match[1] } };
            }
        }
        return { found: false };
    } catch (err) {
        console.error('Browserless error:', err.message);
        return { found: false, error: err.message };
    }
}
