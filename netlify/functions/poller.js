const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const { JSDOM } = require('jsdom');

const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    console.log('⏰ Poller started at', new Date().toISOString());

    try {
        const { data: series } = await db.from('series').select('*');

        for (const s of series) {
            console.log(`🔍 Checking ${s.name}...`);
            
            const result = await searchGetcomics(s.name);

            if (result.found) {
                // Check if TPB already exists
                const { data: existing } = await db
                    .from('tpbs')
                    .select('*')
                    .eq('series_id', s.id)
                    .eq('title', result.tpb.title);

                if (!existing || existing.length === 0) {
                    console.log(`✓ New TPB found: ${result.tpb.title}`);
                    
                    await db.from('tpbs').insert([{
                        series_id: s.id,
                        title: result.tpb.title,
                        link: result.tpb.link,
                        release_date: new Date().toISOString()
                    }]);

                    // Clear old dismissals for this series (new TPB found)
                    await db.from('dismissed').delete().eq('series_id', s.id);
                }
            }

            // Update last_poll
            await db.from('series').update({ last_poll: new Date() }).eq('id', s.id);
        }

        console.log('✓ Poller completed');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('Poller error:', err);
        return { statusCode: 500, body: err.message };
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
        
        if (/tpb|trade\s*paperback|vol(?:ume)?/i.test(title)) {
            return {
                found: true,
                tpb: { title: title.trim(), link }
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
