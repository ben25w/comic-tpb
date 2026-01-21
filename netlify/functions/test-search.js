const https = require('https');

exports.handler = async (event) => {
    try {
        const html = await fetchUrl('https://getcomics.org/?s=batman+tpb');
        
        // Find sections with "TPB" or headings
        const tpbSection = html.substring(
            html.indexOf('Batman') - 500,
            html.indexOf('Batman') + 500
        );

        // Try different regex patterns
        const patterns = {
            pattern1: /<h[2-4][^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/g,
            pattern2: /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*TPB[^<]*)<\/a>/g,
            pattern3: /<h[1-6][^>]*>([^<]*TPB[^<]*)<\/h[1-6]>/g,
            pattern4: />\s*([^<]*Batman[^<]*TPB[^<]*)\s*</g,
        };

        const results = {};
        for (const [name, regex] of Object.entries(patterns)) {
            const matches = [];
            let match;
            const tempRegex = new RegExp(regex.source, 'gi');
            while ((match = tempRegex.exec(html)) !== null && matches.length < 2) {
                matches.push(match[0].substring(0, 100));
            }
            results[name] = matches;
        }

        // Get raw section around first TPB mention
        const tpbIndex = html.indexOf('TPB');
        const section = html.substring(
            Math.max(0, tpbIndex - 300),
            Math.min(html.length, tpbIndex + 300)
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                htmlLength: html.length,
                patterns: results,
                sectionAroundTPB: section
            }, null, 2)
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }, null, 2)
        };
    }
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, 
            { 
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        ).on('error', reject);
    });
}
