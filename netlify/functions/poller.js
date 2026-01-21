const { createClient } = require('@supabase/supabase-js');
const cloudscraper = require('cloudscraper');

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

        console.log('✓ Supabase connected');

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
                        const { error: insertErr } = await db.from('tpbs').insert([{
                            series_id: s.id,
                            title: result.tpb.title,
                            link: result.tpb.link,
                            release_date: new Date().toISOString()
                        }]);
                        
                        if (insertErr) {
                            console.error(`  ❌ Insert failed:`, insertErr);
                        } else {
                            console.log(`  ✓ Inserted`);
                            await db.from('dismissed').delete().eq('series_id', s.id);
                        }
                    } else {
                        console.log(`  ℹ️  Already in DB`);
                    }
                } else {
                    console.log(`  ⊘ No TPB found`);
                }
            } catch (err) {
                console.error(`  ⚠️  Error: ${err.message}`);
            }

            const { error: updateErr } = await db.from('series').update({ last_poll: new Date().toISOString() }).eq('id', s.id);
            if (updateErr) {
                console.error(`  ❌ Update failed:`, updateErr);
            }
        }

        console.log('✓ Poller completed');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('❌ FATAL:', err.message);
        return { statusCode: 500, body: err.message };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const html = await cloudscraper.get(searchUrl);
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
        console.error(`Search failed for "${seriesName}":`, err.message);
        return { found: false };
    }
}
