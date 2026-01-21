const { createClient } = require('@supabase/supabase-js');
const https = require('https');

exports.handler = async (event) => {
    try {
        console.log('⏰ POLLER STARTED');
        
        if (!process.env.SUPABASE_URL) {
            console.error('❌ SUPABASE_URL not set');
            return { statusCode: 500, body: 'Missing SUPABASE_URL' };
        }
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
            return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_ROLE_KEY' };
        }

        const db = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        console.log('✓ Supabase connected');

        const { data: series, error: seriesError } = await db.from('series').select('*');

        if (seriesError) {
            console.error('❌ Error fetching series:', seriesError);
            return { statusCode: 500, body: JSON.stringify(seriesError) };
        }

        console.log(`📋 Found ${series.length} series`);

        for (const s of series) {
            console.log(`\n🔍 Checking: "${s.name}"`);
            
            try {
                const result = await searchGetcomics(s.name);
                console.log(`  Result:`, result);

                if (result.found && result.tpb) {
                    console.log(`  ✓ TPB found: ${result.tpb.title}`);
                    
                    const { data: existing } = await db
                        .from('tpbs')
                        .select('id')
                        .eq('series_id', s.id)
                        .eq('title', result.tpb.title);

                    if (!existing || existing.length === 0) {
                        const { error: insertError } = await db.from('tpbs').insert([{
                            series_id: s.id,
                            title: result.tpb.title,
                            link: result.tpb.link,
                            release_date: new Date().toISOString()
                        }]);

                        if (insertError) {
                            console.error(`  ❌ Insert error:`, insertError);
                        } else {
                            console.log(`  ✓ Inserted`);
                            await db.from('dismissed').delete().eq('series_id', s.id);
                        }
                    } else {
                        console.log(`  ℹ️  Already known`);
                    }
                } else {
                    console.log(`  ⊘ No TPB found`);
                }
            } catch (err) {
                console.error(`  ⚠️  Error: ${err.message}`);
            }

            await db.from('series').update({ last_poll: new Date().toISOString() }).eq('id', s.id);
        }

        console.log('\n✓ Poller completed');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('❌ FATAL ERROR:', err);
        return { statusCode: 500, body: err.message };
    }
};

async function searchGetcomics(seriesName) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    const html = await fetchUrl(searchUrl);
    const headingRegex = /<h[2-4]>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
    
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
        const title = match[2].trim();
        const link = match[1];
        
        const isTpb = /\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title);
        const isSingleIssue = /\s#\d+\s*\(/i.test(title);
        
        if (isTpb && !isSingleIssue) {
            return { found: true, tpb: { title, link } };
        }
    }

    return { found: false };
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, 
            { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        ).on('error', reject);
    });
}
