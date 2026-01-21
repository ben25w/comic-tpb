const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const { JSDOM } = require('jsdom');

exports.handler = async (event) => {
    console.log('⏰ Poller started at', new Date().toISOString());

    // Check env vars exist
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Missing SUPABASE env vars');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Missing environment variables' })
        };
    }

    const db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const { data: series, error: seriesError } = await db
            .from('series')
            .select('*');

        if (seriesError) throw seriesError;

        console.log(`📋 Found ${series.length} series to check`);

        for (const s of series) {
            console.log(`🔍 Checking: ${s.name}...`);
            
            try {
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
                    } else {
                        console.log(`ℹ️  TPB already known: ${result.tpb.title}`);
                    }
                } else {
                    console.log(`⊘ No TPB found for ${s.name}`);
                }
            } catch (err) {
                console.error(`⚠️  Error checking ${s.name}:`, err.message);
            }

            // Update last_poll timestamp
            await db.from('series').update({ last_poll: new Date().toISOString() }).eq('id', s.id);
        }

        console.log('✓ Poller completed successfully');
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, checked: series.length })
        };
    } catch (err) {
        console.error('❌ Poller error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const html = await fetchUrl(searchUrl);
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const articles = doc.querySelectorAll('article.item');
        
        for (const article of articles) {
            const titleEl = article.querySelector('h2 a');
            const title = titleEl?.textContent?.trim() || '';
            const link = titleEl?.getAttribute('href') || '';
            
            // Match TPB, Trade Paperback, Volume, Vol., or similar
            if (/\btpb\b|trade\s*paperback|vol(?:ume)?\.?|hardcover|deluxe/i.test(title)) {
                return {
                    found: true,
                    tpb: { title, link }
                };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Error searching getcomics for "${seriesName}":`, err.message);
        return { found: false };
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, 
            { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
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
