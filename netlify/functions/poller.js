const { createClient } = require('@supabase/supabase-js');
const https = require('https');

exports.handler = async (event) => {
    console.log('⏰ Poller started at', new Date().toISOString());

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
            console.log(`🔍 Checking: "${s.name}"...`);
            
            try {
                const result = await searchGetcomics(s.name);

                if (result.found) {
                    const { data: existing } = await db
                        .from('tpbs')
                        .select('*')
                        .eq('series_id', s.id)
                        .eq('title', result.tpb.title);

                    if (!existing || existing.length === 0) {
                        console.log(`✓ NEW TPB: ${result.tpb.title}`);
                        
                        const { error: insertError } = await db.from('tpbs').insert([{
                            series_id: s.id,
                            title: result.tpb.title,
                            link: result.tpb.link,
                            release_date: new Date().toISOString()
                        }]);

                        if (insertError) {
                            console.error(`Error inserting TPB: ${insertError.message}`);
                        }

                        // Clear dismissals since there's a new TPB
                        await db.from('dismissed').delete().eq('series_id', s.id);
                    } else {
                        console.log(`ℹ️  TPB already known: ${result.tpb.title}`);
                    }
                } else {
                    console.log(`⊘ No TPB found for "${s.name}"`);
                }
            } catch (err) {
                console.error(`⚠️  Error checking "${s.name}": ${err.message}`);
            }

            // Always update last_poll
            const { error: updateError } = await db.from('series').update({ last_poll: new Date().toISOString() }).eq('id', s.id);
            if (updateError) {
                console.error(`Error updating last_poll: ${updateError.message}`);
            }
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
        const headingRegex = /<h[2-4]>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>\s*<\/h[2-4]>/gi;
        
        let match;
        while ((match = headingRegex.exec(html)) !== null) {
            const title = match[2].trim();
            const link = match[1];
            
            const isTpb = /\btpb\b|trade\s*paperback|vol(?:ume)?\.?\s*\d|hardcover|deluxe|collection|omnibus/i.test(title);
            const isSingleIssue = /\s#\d+\s*\(/i.test(title);
            
            if (isTpb && !isSingleIssue) {
                return {
                    found: true,
                    tpb: { title, link }
                };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Error searching for "${seriesName}": ${err.message}`);
        return { found: false };
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 15000);

        https.get(url, 
            { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                timeout: 15000
            }, 
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            }
        ).on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
