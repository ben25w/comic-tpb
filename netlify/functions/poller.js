const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

exports.handler = async (event) => {
    let browser;
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

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new'
        });

        for (const s of series) {
            console.log(`🔍 Checking: "${s.name}"`);
            
            try {
                const result = await searchGetcomics(s.name, browser);

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

        console.log('✓ Poller completed');
        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error('❌ FATAL:', err.message);
        return { statusCode: 500, body: err.message };
    } finally {
        if (browser) await browser.close();
    }
};

async function searchGetcomics(seriesName, browser) {
    const searchUrl = `https://getcomics.org/?s=${encodeURIComponent(seriesName + ' tpb')}`;
    
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const results = await page.evaluate(() => {
            const items = [];
            const headings = document.querySelectorAll('h2 a, h3 a');
            for (let i = 0; i < Math.min(headings.length, 20); i++) {
                items.push({
                    title: headings[i].textContent.trim(),
                    link: headings[i].href
                });
            }
            return items;
        });

        await page.close();

        for (const { title, link } of results) {
            if (/\btpb\b|trade\s*paperback|vol\.?\s*\d+|hardcover|deluxe|collection|omnibus/i.test(title) 
                && !/\s#\d+\s*\(/i.test(title)) {
                return { found: true, tpb: { title, link } };
            }
        }

        return { found: false };
    } catch (err) {
        console.error(`Search error for "${seriesName}":`, err.message);
        return { found: false };
    }
}
