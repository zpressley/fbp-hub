// js/auction.js
// New Prospect Auction Portal controller wired to auction_current.json

(function () {
    const DATA_PATH = window.FBPHub?.config?.dataPath || './data/';

    async function fetchJSON(path) {
        try {
            let res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error('Failed to fetch', path, err);
            return null;
        }
    }

    async function loadAuctionState() {
        return fetchJSON(`${DATA_PATH}auction_current.json`);
    }

    function getUserTeam() {
        if (typeof authManager === 'undefined') return null;
        if (!authManager.isAuthenticated()) return null;
        return authManager.getTeam(); // { abbreviation, name }
    }

    function getUserWB(teamAbbr) {
        const wiz = window.FBPHub?.data?.wizbucks || {};
        if (!teamAbbr) return null;
        return wiz[teamAbbr] ?? wiz[teamAbbr.toUpperCase()] ?? null;
    }

    function renderPhase(auctionState) {
        const titleEl = document.getElementById('auctionPhaseTitle');
        const subtitleEl = document.getElementById('auctionPhaseSubtitle');
        const countdownEl = document.getElementById('auctionPhaseCountdown');

        if (!auctionState) {
            if (titleEl) titleEl.textContent = 'Auction data not available yet.';
            if (subtitleEl) subtitleEl.textContent = '';
            if (countdownEl) countdownEl.textContent = '';
            return;
        }

        const phase = auctionState.phase || 'off_week';
        let title = '';
        let subtitle = '';

        switch (phase) {
            case 'ob_window':
                title = 'Originating Bid Window Open';
                subtitle = 'Mon 3pm – Tue 11:59pm (US Eastern).';
                break;
            case 'cb_window':
                title = 'Challenge Bid Window Open';
                subtitle = 'Wed 12:00am – Fri 9:00pm (US Eastern).';
                break;
            case 'ob_final':
                title = 'OB Match / Forfeit Window';
                subtitle = 'OB managers may Match or Forfeit on Saturday.';
                break;
            case 'processing':
                title = 'Auction Processing';
                subtitle = 'Results are being finalized (Sunday).';
                break;
            case 'off_week':
            default:
                title = 'No auction this week – Off week';
                subtitle = '';
                break;
        }

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
        if (countdownEl) countdownEl.textContent = '';
    }

    function renderWizbucks(auctionState) {
        const team = getUserTeam();
        const guestMsg = document.getElementById('wizbucksGuestMessage');
        const stats = document.getElementById('wizbucksStats');

        if (!team) {
            if (guestMsg) guestMsg.classList.remove('hidden');
            if (stats) stats.classList.add('hidden');
            return;
        }

        const wbVal = getUserWB(team.abbreviation) ?? 0;
        const bids = auctionState?.bids || [];

        let committed = 0;
        const byProspect = {};
        for (const b of bids) {
            const pid = String(b.prospect_id);
            const amt = Number(b.amount) || 0;
            const t = b.team;
            const current = byProspect[pid];
            if (!current || amt > current.amount || (amt === current.amount && t === team.abbreviation)) {
                byProspect[pid] = { amount: amt, team: t };
            }
        }
        for (const entry of Object.values(byProspect)) {
            if (entry.team === team.abbreviation) {
                committed += entry.amount;
            }
        }

        const total = Number(wbVal) || 0;
        const available = total - committed;

        if (guestMsg) guestMsg.classList.add('hidden');
        if (stats) stats.classList.remove('hidden');

        const wbTeam = document.getElementById('wbTeam');
        const wbTotal = document.getElementById('wbTotal');
        const wbCommitted = document.getElementById('wbCommitted');
        const wbAvailable = document.getElementById('wbAvailable');

        if (wbTeam) wbTeam.textContent = `${team.abbreviation} – ${team.name}`;
        if (wbTotal) wbTotal.textContent = `$${total}`;
        if (wbCommitted) wbCommitted.textContent = `$${committed}`;
        if (wbAvailable) wbAvailable.textContent = `$${available}`;
    }

    function renderUserBids(auctionState) {
        const container = document.getElementById('userBidsContainer');
        if (!container) return;

        const team = getUserTeam();
        if (!auctionState || !team) {
            container.innerHTML = '<p class="text-gray">Login to see your active bids.</p>';
            return;
        }

        const bids = auctionState.bids || [];
        const myBids = bids.filter(b => b.team === team.abbreviation);

        if (!myBids.length) {
            container.innerHTML = '<p class="text-gray">You have no bids this week.</p>';
            return;
        }

        const lines = myBids
            .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
            .map(b => {
                const typeLabel = b.type === 'OB' ? 'Originating' : 'Challenge';
                return (
                    `<div class="mb-md">` +
                    `<strong>${typeLabel}:</strong> Prospect <code>${b.prospect_id}</code> for $${b.amount} WB` +
                    `</div>`
                );
            })
            .join('');

        container.innerHTML = lines;
    }

    function renderProspects(auctionState) {
        const grid = document.getElementById('prospectsGrid');
        if (!grid) return;

        if (!auctionState) {
            grid.innerHTML = '<p class="text-gray">Auction data not available.</p>';
            return;
        }

        const players = window.FBPHub?.data?.players || [];
        const bids = auctionState.bids || [];

        const eligible = players.filter(p => p.player_type === 'Farm' && !p.manager);

        if (!eligible.length) {
            grid.innerHTML = '<p class="text-gray">No eligible prospects this week.</p>';
            return;
        }

        const bidByProspect = {};
        for (const b of bids) {
            const pid = String(b.prospect_id);
            const amt = Number(b.amount) || 0;
            const t = b.team;
            const current = bidByProspect[pid];
            if (!current || amt > current.amount) {
                bidByProspect[pid] = { amount: amt, team: t, type: b.type };
            }
        }

        const phase = auctionState.phase || 'off_week';
        const canBid = typeof authManager !== 'undefined' && authManager.isAuthenticated() && phase !== 'off_week' && phase !== 'processing';

        const rows = eligible.slice(0, 200).map(p => {
            const pid = String(p.id || p.name);
            const current = bidByProspect[pid];
            const bidText = current
                ? `$${current.amount} by ${current.team} (${current.type})`
                : 'No bids yet';
            const button = canBid
                ? `<button class="btn btn-secondary" data-prospect-id="${pid}" data-prospect-name="${p.name}">Place Bid</button>`
                : '';
            return `
                <div class="mb-md">
                    <div><strong>${p.name}</strong> ${window.createPositionBadge ? window.createPositionBadge(p.position) : ''}</div>
                    <div class="text-gray">Current: ${bidText}</div>
                    ${button}
                </div>
            `;
        }).join('');

        grid.innerHTML = rows;

        if (canBid) {
            grid.querySelectorAll('button[data-prospect-id]').forEach(btn => {
                btn.addEventListener('click', () => openBidModal(btn.dataset.prospectId, btn.dataset.prospectName));
            });
        }
    }

    function openBidModal(prospectId, prospectName) {
        if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        const modal = document.getElementById('bidModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.innerHTML = `
            <div class="card" style="max-width: 480px; margin: 40px auto; position: relative;">
                <button id="bidModalClose" class="btn-outline" style="position:absolute; top:8px; right:8px; padding:4px 8px;">✕</button>
                <h3>Place Bid</h3>
                <p><strong>Prospect:</strong> ${prospectName || prospectId}</p>
                <label>Bid Type</label>
                <select id="bidTypeInput">
                    <option value="OB">Originating Bid (OB)</option>
                    <option value="CB">Challenge Bid (CB)</option>
                </select>
                <label class="mt-md">Amount (WB)</label>
                <input type="number" id="bidAmountInput" min="5" step="5" />
                <button id="bidSubmit" class="btn btn-primary mt-md">Submit Bid</button>
                <p id="bidError" class="text-danger mt-md"></p>
            </div>
        `;

        document.getElementById('bidModalClose').onclick = () => modal.classList.add('hidden');
        document.getElementById('bidSubmit').onclick = () => submitBid(prospectId);
    }

    async function submitBid(prospectId) {
        const session = authManager.getSession();
        const token = session?.token;
        const amountInput = document.getElementById('bidAmountInput');
        const typeInput = document.getElementById('bidTypeInput');
        const errorEl = document.getElementById('bidError');

        const amount = Number(amountInput?.value || 0);
        const bidType = typeInput?.value || 'OB';

        if (!amount || amount <= 0) {
            if (errorEl) errorEl.textContent = 'Enter a valid bid amount.';
            return;
        }

        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/auction/bid`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prospectId,
                    amount,
                    bidType,
                }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || body.detail || `HTTP ${res.status}`);
            }

            const modal = document.getElementById('bidModal');
            if (modal) modal.classList.add('hidden');
            window.showToast('Bid submitted! It may take up to a minute to appear.');
        } catch (err) {
            console.error('Bid failed', err);
            if (errorEl) errorEl.textContent = String(err.message || err);
        }
    }

    async function refreshAuction() {
        const state = await loadAuctionState();
        renderPhase(state);
        renderWizbucks(state);
        renderUserBids(state);
        renderProspects(state);
    }

    window.initAuctionPage = function initAuctionPage() {
        refreshAuction();
        setInterval(refreshAuction, 30000);
    };
})();
