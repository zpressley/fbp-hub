/**
 * Season dates page - renders config/season_dates.json (synced into data/).
 */

async function initSeasonDatesPage() {
    const container = document.getElementById('seasonDatesContainer');
    if (!container) return;

    try {
        if (typeof loadJSON !== 'function') {
            throw new Error('loadJSON helper not available');
        }

        const config = await loadJSON('season_dates.json');
        if (!config) {
            container.innerHTML = '<p>season_dates.json not found.</p>';
            return;
        }

        const auction = config.auction || {};

        const events = [
            { key: 'pad_open_date', label: 'PAD Opens' },
            { key: 'pad_date', label: 'Prospect Assignment Day' },
            { key: 'ppd_date', label: 'Prospect Draft' },
            { key: 'franchise_tag_date', label: 'Franchise Tag Deadline' },
            { key: 'trade_window_start', label: 'Trade Window Opens' },
            { key: 'trade_window_end', label: 'Trade Window Closes' },
            { key: 'kap_open_date', label: 'KAP Opens' },
            { key: 'keeper_deadline', label: 'Keeper Deadline' },
            { key: 'kap_end_date', label: 'KAP Deadline' },
            { key: 'keeper_draft', label: 'Keeper Draft' },
            { key: 'division_draft', label: 'Division Draft' },
            { key: 'week_1_start', label: 'Week 1 Starts' },
            { key: 'regular_season_end', label: 'Final Day of Regular Season' },
            { key: 'playoffs_end', label: 'Playoffs End' },
            // Auction milestones
            { key: 'start', label: 'Prospect Auction Start', from: 'auction' },
            { key: 'all_star_break_start', label: 'Auction Pauses – All-Star Break', from: 'auction' },
            { key: 'restart', label: 'Prospect Auction Restart', from: 'auction' },
            { key: 'playoffs_start', label: 'Auctions End for Playoffs', from: 'auction' }
        ];

        const rows = events
            .map(ev => {
                const source = ev.from === 'auction' ? auction : config;
                const iso = source && source[ev.key];
                if (!iso) return null;
                const d = new Date(iso + 'T00:00:00');
                if (Number.isNaN(d.getTime())) return null;
                return { name: ev.label, iso, date: d };
            })
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);

        if (!rows.length) {
            container.innerHTML = '<p>No season dates found in config.</p>';
            return;
        }

        const items = rows.map(r => {
            const display = typeof formatDate === 'function' ? formatDate(r.date) : r.iso;
            return `
                <div class="season-date-row">
                    <div class="season-date-name">${r.name}</div>
                    <div class="season-date-date">${display}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = items;
    } catch (err) {
        console.error('Failed to load season dates:', err);
        container.innerHTML = '<p>Failed to load season dates.</p>';
    }
}

window.initSeasonDatesPage = initSeasonDatesPage;
