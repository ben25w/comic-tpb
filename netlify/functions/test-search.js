const https = require('https');

exports.handler = async (event) => {
    console.log('🧪 TEST SEARCH STARTED');
    
    try {
        const html = await fetchUrl('https://getcomics.org/?s=batman+tpb');
        console.log('✓ HTML fetched, length:', html.length);
        
        // Check if HTML contains expected patterns
        const hasHeadings = /<h[2-4]>/i.test(html);
        const hasLinks = /<a\s+href=/i.test(html);
        const hasTPB = /tpb|trade paperback/i.test(html);
        
        console.log('HTML has h2/h3/h4 tags:', hasHeadings);
        console.log('HTML has links:', hasLinks);
        console.log('HTML contains "TPB":', hasTPB);
        
        // Find first 5 headings with links
        const headingRegex = /<h[2-4]>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        let match;
        let count = 0;
        const results = [];
        
        while ((match = headingRegex.exec(html)) !== null && count < 5) {
            results.push({
                title: match[2].trim(),
                link: match[1]
            });
            count++;
        }
        
        console.log('Found headings:', count);
        results.forEach(r => console.log('  -', r.title));
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                htmlLength: html.length,
                hasHeadings,
                hasLinks,
                hasTPB,
                foundHeadings: count,
                results
            })
        };
    } catch (err) {
        console.error('❌ TEST ERROR:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: err.message,
                stack: err.stack
            })
        };
    }
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, 
            { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        ).on('error', reject);
    });
}
