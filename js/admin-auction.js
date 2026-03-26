/**
 * FBP Hub - Admin Auction Tools
 * Manage auction bids from the admin portal.
 */

let AUCTION_ADMIN_STATE = {
    bids: [],
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getAuctionAdminToken() {
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    return session?.token || null;
}

function getAuctionAdminUser() {
    if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.adminUser) {
        return ADMIN_STATE.adminUser;
    }
    const user = typeof authManager !== 'undefined' ? authManager.getUser() : null;
    return user?.username || 'admin';
}

function populateAuctionAdminTeams() {
    const select = document.getElementById('auctionAdminTeam');
    if (!select) return;

    const managers = (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.managers) ? ADMIN_STATE.managers : {};
    const teams = Object.keys(managers).sort();

    const options = ['<option value="">Select Team...</option>'];
    teams.forEach((abbr) => {
        const name = managers[abbr]?.name || abbr;
        options.push(`<option value="${escapeHtml(abbr)}">${escapeHtml(abbr)} - ${escapeHtml(name)}</option>`);
    });
    select.innerHTML = options.join('');
}

async function auctionAdminFetch(path, method = 'GET', body = null) {
    if (!AUTH_CONFIG?.workerUrl) {
        throw new Error('Worker URL is not configured.');
    }

    const token = getAuctionAdminToken();
    if (!token) {
        throw new Error('Your admin session has expired. Please log in again.');
    }

    const res = await fetch(`${AUTH_CONFIG.workerUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    let payload = {};
    try {
        payload = await res.json();
    } catch (err) {
        payload = {};
    }

    if (!res.ok) {
        const detail = payload?.detail || payload?.error || `Request failed (${res.status})`;
        throw new Error(detail);
    }

    return payload;
}

function renderAuctionAdminRows() {
    const rowsEl = document.getElementById('auctionAdminRows');
    if (!rowsEl) return;

    if (!AUCTION_ADMIN_STATE.bids.length) {
        rowsEl.innerHTML = '<tr><td colspan="8" class="auction-admin-empty">No bids found for this week.</td></tr>';
        return;
    }

    rowsEl.innerHTML = AUCTION_ADMIN_STATE.bids.map((bid) => {
        const bidId = escapeHtml(bid.bid_id || '');
        const team = escapeHtml(bid.team || '');
        const bidType = escapeHtml(bid.bid_type || '');
        const prospectName = escapeHtml(bid.prospect_name || bid.prospect_id || '');
        const prospectId = escapeHtml(bid.prospect_id || '');
        const amount = Number(bid.amount || 0);
        const date = escapeHtml(bid.date || '');

        return `
            <tr>
                <td><code>${bidId}</code></td>
                <td>${team}</td>
                <td>${bidType}</td>
                <td>${prospectName}</td>
                <td><code>${prospectId}</code></td>
                <td>$${amount}</td>
                <td>${date}</td>
                <td class="auction-admin-actions">
                    <button class="btn-sm btn-warning" onclick="promptAuctionBidAmountUpdate('${bidId}', ${amount})">
                        <i class="fas fa-pen"></i> Amount
                    </button>
                    <button class="btn-sm btn-danger" onclick="removeAuctionBidById('${bidId}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAuctionAdminMeta(data) {
    const weekEl = document.getElementById('auctionAdminWeek');
    const phaseEl = document.getElementById('auctionAdminPhase');
    const countEl = document.getElementById('auctionAdminCount');
    if (weekEl) weekEl.textContent = data?.week_start || '-';
    if (phaseEl) phaseEl.textContent = data?.phase || '-';
    if (countEl) countEl.textContent = String((data?.bids || []).length);
}

async function loadAuctionAdminBids() {
    try {
        const data = await auctionAdminFetch('/api/admin/auction/bids');
        AUCTION_ADMIN_STATE.bids = Array.isArray(data?.bids) ? data.bids : [];
        renderAuctionAdminMeta(data);
        renderAuctionAdminRows();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`Auction admin load failed: ${err.message}`, 'error');
        }
    }
}

async function submitAuctionAdminAddBid() {
    const team = (document.getElementById('auctionAdminTeam')?.value || '').trim().toUpperCase();
    const bidType = (document.getElementById('auctionAdminBidType')?.value || '').trim().toUpperCase();
    const prospectId = (document.getElementById('auctionAdminProspectId')?.value || '').trim();
    const amountRaw = document.getElementById('auctionAdminAmount')?.value;
    const amount = Number(amountRaw);

    if (!team || !prospectId || !Number.isFinite(amount) || amount <= 0) {
        if (typeof showToast === 'function') {
            showToast('Team, UPID, and positive amount are required.', 'error');
        }
        return;
    }

    try {
        await auctionAdminFetch('/api/admin/auction/bids/add', 'POST', {
            admin: getAuctionAdminUser(),
            team,
            prospect_id: prospectId,
            amount: Math.trunc(amount),
            bid_type: bidType,
        });
        if (typeof showToast === 'function') {
            showToast('Auction bid added.', 'success');
        }

        const form = document.getElementById('auctionAdminAddForm');
        if (form) form.reset();
        populateAuctionAdminTeams();
        await loadAuctionAdminBids();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`Add bid failed: ${err.message}`, 'error');
        }
    }
}

async function removeAuctionBidById(bidId) {
    if (!bidId) return;
    const confirmed = window.confirm(`Remove bid ${bidId}?`);
    if (!confirmed) return;

    try {
        await auctionAdminFetch('/api/admin/auction/bids/remove', 'POST', {
            admin: getAuctionAdminUser(),
            bid_id: bidId,
        });
        if (typeof showToast === 'function') {
            showToast('Auction bid removed.', 'success');
        }
        await loadAuctionAdminBids();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`Remove bid failed: ${err.message}`, 'error');
        }
    }
}

async function promptAuctionBidAmountUpdate(bidId, currentAmount) {
    const next = window.prompt(`New amount for bid ${bidId}`, String(currentAmount || ''));
    if (next === null) return;

    const amount = Number(next);
    if (!Number.isFinite(amount) || amount <= 0) {
        if (typeof showToast === 'function') {
            showToast('Please enter a positive number.', 'error');
        }
        return;
    }

    try {
        await auctionAdminFetch('/api/admin/auction/bids/update-amount', 'POST', {
            admin: getAuctionAdminUser(),
            bid_id: bidId,
            amount: Math.trunc(amount),
        });
        if (typeof showToast === 'function') {
            showToast('Bid amount updated.', 'success');
        }
        await loadAuctionAdminBids();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`Update failed: ${err.message}`, 'error');
        }
    }
}

function initAuctionAdminTools() {
    populateAuctionAdminTeams();
}

window.initAuctionAdminTools = initAuctionAdminTools;
window.loadAuctionAdminBids = loadAuctionAdminBids;
window.submitAuctionAdminAddBid = submitAuctionAdminAddBid;
window.removeAuctionBidById = removeAuctionBidById;
window.promptAuctionBidAmountUpdate = promptAuctionBidAmountUpdate;
