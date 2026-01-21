const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

exports.handler = async (event) => {
    try {
        console.log('⏰ POLLER STARTED');
        
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ Missing Supabase env vars');
            return { statusCode: 500, body: 'Missing env vars' };
        }

        const db = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: series } = await db.from('series').select('*');
        console.log(`📋 Found ${series.length} series`);

        for (const s of series) {
            console.log(`\n🔍 Checking: "${s.name}"`);
            
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
                        console.log(`  ✓ Inserted into DB`);
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

        console.log('\n✓ Poller completed successfully');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
        return { statusCode: 500, body: err.message };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            timeout: 30000,
            maxRedirects: 5
        });

        const html = response.data;

        if (html.includes('Just a moment') || html.includes('cf_challenge')) {
            console.log('  ⚠️ Cloudflare challenge');
            return { found: false };
        }

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
        console.error(`  Search error: ${err.message}`);
        return { found: false };
    }
}
