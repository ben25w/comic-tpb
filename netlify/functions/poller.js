const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

exports.handler = async (event) => {
    try {
        console.log('⏰ POLLER STARTED');
        
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ Missing Supabase env vars');
            return { statusCode: 500, body: 'Missing env vars' };
        }

        if (!process.env.BROWSERLESS_TOKEN) {
            console.error('❌ Missing BROWSERLESS_TOKEN');
            return { statusCode: 500, body: 'Missing BROWSERLESS_TOKEN' };
        }

        const db = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: series } = await db.from('series').select('*');
        console.log(`📋 Found ${series.length} series`);

        for (const s of series) {
            console.log(`🔍 Checking: "${s.name}"`);
            
            try {
                const result = await searchGetcomics(s.name);

                if (result.found && result.tpb) {
                    console.log(`  ✓ Found: ${result.tpb.title}`);
                    
                    const { data: existing } = await db
                        .from('tpbs')
                        .select('id')
                        .eq('series_id', s.id)
                        .eq('title', result.tpb.title);

                    if (!existing || existing.length === 0) {
                        await db.from('tpbs').insert([{
                            series_id: s.id,
                            title: result.tpb.title,
                            link: result.tpb.link,
                            release_date: new Date().toISOString()
                        }]);
                        console.log(`  ✓ Inserted`);
                        await db.from('dismissed').delete().eq('series_id', s.id);
                    } else {
                        console.log(`  ℹ️  Already in DB`);
                    }
                } else {
                    console.log(`  ⊘ No TPB found`);
                }
            } catch (err) {
                console.error(`  ⚠️  Error: ${err.message}`);
            }

            await db.from('series').update({ last_poll: new Date().toISOString() }).eq('id', s.id);
        }

        console.log('✓ Completed');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('❌ ERROR:', err.message);
        return { statusCode: 500, body: err.message };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const browserlessUrl = `https://chrome.browserless.io/content?token=${process.env.BROWSERLESS_TOKEN}`;
        
        const response = await axios.post(browserlessUrl, {
            url: searchUrl,
            waitForSelector: 'h2 a'
        });

        const html = response.data;
        const headingRegex = /<h[2-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        while ((match = headingRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2].trim();
            
            if (/\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title) 
                && !/\s#\d+\s*\(/i.test(title)) {
                return { found: true, tpb: { title, link } };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Search error: ${err.message}`);
        return { found: false };
    }
}
