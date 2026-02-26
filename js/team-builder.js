/* ════════════════════════════════════════════════════════════════════════
   FBP TEAM BUILDER — Core Logic
   ════════════════════════════════════════════════════════════════════════ */

// ── Contract definitions ──────────────────────────────────────────────────
const CONTRACT_DATA = {
  'TC R':    { cost:5,   tier:'TC', next:'TC 1',    ilDiscount:0,  ratEligible:false, ilEligible:false },
  'TC BC 1': { cost:5,   tier:'TC', next:'TC BC 2', ilDiscount:0,  ratEligible:false, ilEligible:false },
  'TC BC 2': { cost:5,   tier:'TC', next:'TC 1',    ilDiscount:0,  ratEligible:false, ilEligible:false },
  'TC 1':    { cost:15,  tier:'TC', next:'TC 2',    ilDiscount:10, ratEligible:false, ilEligible:true  },
  'TC 2':    { cost:25,  tier:'TC', next:'VC 1',    ilDiscount:10, ratEligible:false, ilEligible:true  },
  'VC 1':    { cost:35,  tier:'VC', next:'VC 2',    ilDiscount:15, ratEligible:true,  ilEligible:true  },
  'VC 2':    { cost:55,  tier:'VC', next:'FC 1',    ilDiscount:15, ratEligible:true,  ilEligible:true  },
  'FC 1':    { cost:85,  tier:'FC', next:'FC 2+',   ilDiscount:35, ratEligible:true,  ilEligible:true  },
  'FC 2+':   { cost:125, tier:'FC', next:'FC 2+',   ilDiscount:35, ratEligible:true,  ilEligible:true  },
};

// RaT reduces one full tier step (cannot go to TC)
const RAT_REDUCE = {
  'FC 2+': 'FC 1',
  'FC 1':  'VC 2',
  'VC 2':  'VC 1',
  'VC 1':  null,   // cannot reduce to TC
};

const BASE_YEAR = 2026;

function contractInfo(c) {
  return CONTRACT_DATA[c] || { cost:0, tier:'?', next:c, ilDiscount:0, ratEligible:false, ilEligible:false };
}

// Apply RaT N times, return effective contract for display (cost only, player still progresses normally)
function applyRaT(contract, ratCount) {
  let c = contract;
  for (let i = 0; i < ratCount; i++) {
    const reduced = RAT_REDUCE[c];
    if (!reduced) break;
    c = reduced;
  }
  return c;
}

// Advance contract one season (what it costs NEXT year if kept, after normal progression)
function advanceContract(contract) {
  return contractInfo(contract).next;
}

// Get contract N seasons in the future (baseline progression, no RaT in future years)
function futureContract(contract, yearsAhead) {
  let c = contract;
  for (let i = 0; i < yearsAhead; i++) c = advanceContract(c);
  return c;
}

// Effective cost this season (with IL and RaT applied)
function effectiveCost(contract, ilOn, ratCount) {
  const info = contractInfo(contract);
  if (!info) return 0;
  const ratContract = applyRaT(contract, ratCount);
  const ratCost = contractInfo(ratContract).cost;
  const ilDisc = (ilOn && info.ilEligible) ? info.ilDiscount : 0;
  return Math.max(0, ratCost - ilDisc);
}

// Contract tier CSS class
function tierClass(contract) {
  if (!contract) return 'ct-tc';
  if (contract.startsWith('FC')) return 'ct-fc';
  if (contract.startsWith('VC')) return 'ct-vc';
  if (contract === 'BC') return 'ct-bc';
  if (contract === 'PC') return 'ct-pc';
  if (contract === 'DC') return 'ct-dc';
  return 'ct-tc';
}

function costColorClass(contract) {
  if (!contract) return 'zero';
  if (contract.startsWith('FC')) return 'fc';
  if (contract.startsWith('VC')) return 'vc';
  if (contract.startsWith('TC')) return 'tc';
  return '';
}

// KAP tax bracket calculation
function getKAPTaxBrackets(taxableSpend) {
  const brackets = [
    { lo:421, hi:435, rounds:[4,5,6,7,8] },
    { lo:401, hi:420, rounds:[5,6,7] },
    { lo:376, hi:400, rounds:[6,7,8] },
    { lo:351, hi:375, rounds:[7,8,9] },
    { lo:326, hi:350, rounds:[8,9,10] },
  ];
  for (const b of brackets) {
    if (taxableSpend >= b.lo) return b.rounds;
  }
  return [];
}

// ── Prospect graduation logic ────────────────────────────────────────────
const PROSPECT_COSTS = { DC:5, PC:10, BC:20 };
const PROSPECT_RENEWAL = { DC:5, PC:10, BC:0 }; // BC free if top100

function prospectGradContract(padChoice) {
  // DC/PC grads → TC R; BC grads → TC BC 1
  return padChoice === 'BC' ? 'TC BC 1' : 'TC R';
}

function prospectAnnualCost(padChoice, isTop100, isDebutYear) {
  const base = PROSPECT_COSTS[padChoice] || 10;
  const debutExtra = (padChoice === 'DC' && isDebutYear) ? 10 : 0; // DC→PC costs $10 extra on debut
  return base + debutExtra;
}

// ── App State ─────────────────────────────────────────────────────────────
let state = {
  team: '',
  viewYear: 0,
  keepers: [],    // { id, name, pos, contract, il, ratCount, dropped, simulated }
  prospects: [],  // { id, name, pos, padChoice, isTop100, gradYear, dropped, simulated, isDebut }
  budget: {
    bracket: 'consolation',
    seasonRollover: 0,
    padRollover: 0,
    consolBonus: 0,
    elimBonus: 0,
    ratBudget: 0,
  }
};

let _id = 1;
function uid() { return _id++; }

// ── Budget computations ──────────────────────────────────────────────────
function getPADBudget(yearOffset = 0) {
  if (yearOffset > 0) {
    // Future years: assume consolation base, no extra bonuses (placeholder)
    return 120 + state.budget.seasonRollover;
  }
  const base = { championship:100, consolation:120, elimination:140 }[state.budget.bracket] || 120;
  return base + state.budget.seasonRollover + state.budget.elimBonus;
}

function getKAPBudget(yearOffset = 0) {
  if (yearOffset > 0) {
    return 375 + state.budget.seasonRollover;
  }
  return 375 + state.budget.seasonRollover + state.budget.padRollover + parseInt(state.budget.consolBonus || 0);
}

function getKAPTaxableSpend(yearOffset = 0) {
  // For projected years, assume same keepers progressed + no RaT
  const keepers = getActiveKeepers();
  let total = 0;
  keepers.forEach(k => {
    const contract = yearOffset === 0 ? k.contract : futureContract(k.contract, yearOffset);
    const cost = yearOffset === 0
      ? effectiveCost(k.contract, k.il, k.ratCount)
      : contractInfo(contract).cost;
    total += cost;
  });
  // Add prospect graduation costs for that year
  getActiveProspects().forEach(p => {
    if (parseInt(p.gradYear) === yearOffset) {
      // graduated prospect doesn't cost KAP in that year, costs TC R KAP next year
    }
    // Prospects that graduated before this year now cost keeper salary
    if (parseInt(p.gradYear) < yearOffset && parseInt(p.gradYear) >= 0) {
      const seasonsAfterGrad = yearOffset - parseInt(p.gradYear);
      const gradContract = prospectGradContract(p.padChoice);
      const contract = futureContract(gradContract, seasonsAfterGrad);
      total += contractInfo(contract).cost;
    }
  });
  // Add RaT cost as tax-free (subtract it back to get taxable only)
  // Taxable = keeper salaries + buy-ins (RaT is tax-free)
  return total;
}

function getActiveKeepers() { return state.keepers.filter(k => !k.dropped); }
function getActiveProspects() { return state.prospects.filter(p => !p.dropped); }

// KAP spend for a given year (taxable portion = salaries + buy-ins, RaT is separate)
function getKAPSpend(yearOffset = 0) {
  let salaries = 0;
  getActiveKeepers().forEach(k => {
    const contract = yearOffset === 0 ? k.contract : futureContract(k.contract, yearOffset);
    const cost = yearOffset === 0
      ? effectiveCost(k.contract, k.il, k.ratCount)
      : contractInfo(contract).cost;
    salaries += cost;
  });
  // Add graduated prospects' keeper costs for years after graduation
  getActiveProspects().forEach(p => {
    const grad = parseInt(p.gradYear);
    if (grad >= 0 && grad < yearOffset) {
      const seasonsAfterGrad = yearOffset - grad;
      const gradContract = prospectGradContract(p.padChoice);
      const c = futureContract(gradContract, seasonsAfterGrad);
      salaries += contractInfo(c).cost;
    }
  });
  const ratCost = yearOffset === 0 ? state.budget.ratBudget * 75 : 0;
  return salaries + ratCost;
}

function getPADSpend(yearOffset = 0) {
  let total = 0;
  getActiveProspects().forEach(p => {
    const base = PROSPECT_COSTS[p.padChoice] || 10;
    if (yearOffset === 0) {
      // Current year: pay PAD cost + any debut upgrade
      const debutExtra = (p.padChoice === 'DC' && p.isDebut) ? 10 : 0;
      total += base + debutExtra;
    } else {
      // Future years: renewal cost (BC free if top100, DC/PC renew at same cost)
      const grad = parseInt(p.gradYear);
      if (grad > yearOffset) {
        // Still a prospect
        if (p.padChoice === 'BC' && p.isTop100) {
          total += 0; // free renewal
        } else {
          total += base;
        }
      }
    }
  });
  return total;
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  renderBudget();
  renderOverviewCards();
  renderKeepers();
  renderProspects();
  saveToLocal();
}

function renderBudget() {
  const yr = state.viewYear;
  const kapBudget = getKAPBudget(yr);
  const padBudget = getPADBudget(yr);
  const kapSpend = getKAPSpend(yr);
  const padSpend = getPADSpend(yr);
  const taxableSpend = kapSpend - (yr === 0 ? state.budget.ratBudget * 75 : 0);
  const taxRounds = getKAPTaxBrackets(taxableSpend);
  const kapLeft = kapBudget - kapSpend;

  document.getElementById('bKapBudget').textContent = `$${kapBudget}`;
  document.getElementById('bKapSub').textContent = yr === 0
    ? `$375 base${state.budget.padRollover > 0 ? ` +$${state.budget.padRollover} PAD roll` : ''}${state.budget.consolBonus > 0 ? ` +$${state.budget.consolBonus} bonus` : ''}${state.budget.seasonRollover > 0 ? ` +$${state.budget.seasonRollover} season roll` : ''}`
    : `projected ${BASE_YEAR + yr}`;

  document.getElementById('bKapSpent').textContent = `$${kapSpend}`;
  document.getElementById('bKapSpentSub').textContent = `${getActiveKeepers().length} keepers${yr === 0 && state.budget.ratBudget > 0 ? ` · $${state.budget.ratBudget * 75} RaT (tax-free)` : ''}`;

  const leftEl = document.getElementById('bKapLeft');
  leftEl.textContent = `$${kapLeft}`;
  leftEl.className = `b-val ${kapLeft < 0 ? 'red' : kapLeft < 50 ? 'amber' : 'green'}`;
  document.getElementById('bKapLeftSub').textContent = kapLeft < 0 ? '⚠️ Over budget!' : `rolls up to $100 to APA`;

  document.getElementById('bPadBudget').textContent = `$${padBudget}`;
  const bracketLabels = { championship:'championship', consolation:'consolation', elimination:'elimination' };
  document.getElementById('bPadSub').textContent = yr === 0
    ? `${bracketLabels[state.budget.bracket]} bracket · $${padSpend} used`
    : `projected ${BASE_YEAR + yr}`;

  // Tax brackets
  const taxEl = document.getElementById('taxBrackets');
  const noneEl = document.getElementById('taxNoneMsg');
  if (taxRounds.length === 0) {
    taxEl.innerHTML = '';
    noneEl.style.display = 'inline';
  } else {
    noneEl.style.display = 'none';
    const allRounds = [4,5,6,7,8,9,10];
    taxEl.innerHTML = allRounds.map(r => {
      const hit = taxRounds.includes(r);
      return `<span class="tax-badge ${hit ? 'hit' : 'safe'}">RD ${r}</span>`;
    }).join('');
  }

  // Meters
  const maxKap = 435;
  const kapPct = Math.min(100, (taxableSpend / maxKap) * 100);
  const padPct = Math.min(100, (padSpend / padBudget) * 100);
  document.getElementById('mKapFill').style.width = kapPct + '%';
  document.getElementById('mKapFill').className = `meter-fill ${taxableSpend > maxKap ? 'over' : 'kap'}`;
  document.getElementById('mKapText').textContent = `$${taxableSpend} taxable / $${maxKap} max`;
  document.getElementById('mPadFill').style.width = padPct + '%';
  document.getElementById('mPadText').textContent = `$${padSpend} / $${padBudget}`;
}

function renderOverviewCards() {
  const el = document.getElementById('overviewCards');
  el.innerHTML = [0,1,2,3].map(yr => {
    const kap = getKAPSpend(yr);
    const pad = getPADSpend(yr);
    const budget = getKAPBudget(yr);
    const left = budget - kap;
    const taxable = kap - (yr === 0 ? state.budget.ratBudget * 75 : 0);
    const tax = getKAPTaxBrackets(taxable);
    const keeperCount = getActiveKeepers().length + getActiveProspects().filter(p => parseInt(p.gradYear) < yr).length;
    const isActive = yr === state.viewYear;
    const taxStr = tax.length ? `Tax: RD ${tax.join(',')}` : '✅ No tax';
    const taxCls = tax.length ? 'red' : 'green';
    return `<div class="ov-card ${isActive ? 'active' : ''}" data-yr="${yr}" onclick="setViewYear(${yr})">
      <span class="ov-year">${BASE_YEAR + yr}</span>
      <span class="ov-kap">$${kap} KAP</span>
      <span class="ov-meta">$${left >= 0 ? left : 0} remaining · $${pad} PAD</span>
      <span class="ov-tax ${taxCls}">${taxStr}</span>
      <span class="ov-roster">${keeperCount} keepers</span>
    </div>`;
  }).join('');
}

function renderKeepers() {
  const yr = state.viewYear;
  const tbody = document.getElementById('keeperBody');
  const keepers = state.keepers;

  document.getElementById('keeperCount').textContent = getActiveKeepers().length;

  if (keepers.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><i class="fas fa-baseball-ball" style="margin-right:8px;color:var(--dimmer)"></i>No keepers yet. Load a team or add players manually.</td></tr>`;
    updateKeeperTotals();
    return;
  }

  tbody.innerHTML = keepers.map(k => {
    const info = contractInfo(k.contract);
    const ratContract = applyRaT(k.contract, k.ratCount);
    const cost = effectiveCost(k.contract, k.il, k.ratCount);
    const ratCost = contractInfo(ratContract).cost;
    const ilDisc = (k.il && info.ilEligible) ? info.ilDiscount : 0;

    // Future costs (no RaT or IL in future, normal progression)
    const future = [1,2,3].map(offset => {
      if (k.dropped) return '-';
      // Contract advances from this season's BASE contract (RaT doesn't affect future progression)
      const fc = futureContract(k.contract, offset);
      return `$${contractInfo(fc).cost}`;
    });

    const tierCls = tierClass(k.contract);
    const costCls = costColorClass(k.contract);
    const dropped = k.dropped;
    const simTag = k.simulated ? `<span class="status-badge sb-sim">+ sim</span>` : '';

    // Tool availability
    const canIL = info.ilEligible;
    const canRaT = info.ratEligible && RAT_REDUCE[k.contract];
    const ratApplied = k.ratCount > 0;
    const ratBtnLabel = ratApplied ? `RaT ×${k.ratCount}` : 'RaT';

    // Cost display with strikethrough if modified
    let costDisplay = '';
    if (k.ratCount > 0 || k.il) {
      const base = info.cost;
      const after = cost;
      const effectiveColor = costCls === 'fc' ? '#EF3E42' : costCls === 'vc' ? '#FFB612' : '#F5F5F5';
      costDisplay = `<span class="struck">$${base}</span><span class="effective" style="color:${effectiveColor}">$${after}</span>`;
    } else {
      costDisplay = `$${cost}`;
    }

    return `<tr class="${dropped ? 'dropped' : ''} ${k.simulated ? 'simulated' : ''}" data-id="${k.id}">
      <td><span class="td-pos">${k.pos}</span></td>
      <td class="td-name">${k.name} ${simTag}
        ${k.il ? `<small style="color:var(--blue)">IL (5wk inactive)</small>` : ''}
        ${k.ratCount > 0 ? `<small style="color:var(--amber)">RaT→${ratContract}</small>` : ''}
      </td>
      <td>
        ${k.simulated ? `
          <div class="contract-override-wrap">
            <div class="contract-original">
              ${k.originalContract && k.originalContract !== k.contract
                ? `<span class="orig-label">${k.originalContract}</span> <span style="font-size:.55rem;color:var(--amber)">overridden</span>`
                : `<span style="font-size:.62rem;color:var(--dimmer)">original: ${k.originalContract || k.contract}</span>`}
            </div>
            <select class="contract-inline-sel" onchange="updateKeeperContract(${k.id}, this.value)" ${dropped ? 'disabled' : ''}>
              ${['TC R','TC BC 1','TC BC 2','TC 1','TC 2','VC 1','VC 2','FC 1','FC 2+'].map(c =>
                `<option value="${c}" ${k.contract === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </div>
        ` : `<span class="td-contract ${tierCls}">${k.contract}</span>`}
      </td>
      <td class="td-cost ${costCls}">${dropped ? '—' : costDisplay}</td>
      <td>
        ${!dropped ? `<div class="tog-wrap">
          ${canIL ? `<button class="tog-btn tog-il ${k.il ? 'on' : ''}" onclick="toggleIL(${k.id})" title="${k.il ? 'Remove IL tag' : 'Apply IL tag'}">
            IL${k.il ? ' -$'+info.ilDiscount : ''}
          </button>` : `<span style="font-size:.6rem;color:var(--dimmer)">no IL</span>`}
          ${canRaT ? `<button class="tog-btn tog-rat ${ratApplied ? 'on' : ''}" onclick="cycleRaT(${k.id})" title="Each click adds one $75 RaT use">
            ${ratBtnLabel}<span class="rat-count">${ratApplied ? ' ×$75' : ''}</span>
          </button>` : ''}
        </div>` : ''}
      </td>
      ${future.map(f => `<td class="td-future ${dropped ? '' : 'highlight'}">${dropped ? '—' : f}</td>`).join('')}
      <td class="c">
        <button class="tog-btn tog-drop ${dropped ? 'on' : ''}" onclick="toggleDrop('keeper',${k.id})" title="${dropped ? 'Restore player' : 'Drop player'}">
          ${dropped ? 'Restore' : 'Drop'}
        </button>
      </td>
    </tr>`;
  }).join('');

  updateKeeperTotals();
}

function updateKeeperTotals() {
  const yr = state.viewYear;
  const active = getActiveKeepers();
  const cur = active.reduce((s, k) => {
    const c = yr === 0 ? effectiveCost(k.contract, k.il, k.ratCount) : contractInfo(futureContract(k.contract, yr)).cost;
    return s + c;
  }, 0);
  const t1 = active.reduce((s,k) => s + contractInfo(futureContract(k.contract, yr+1 > 3 ? 3 : yr+1 === 0 ? 1 : yr+1)).cost, 0);
  const t2 = active.reduce((s,k) => s + contractInfo(futureContract(k.contract, 2)).cost, 0);
  const t3 = active.reduce((s,k) => s + contractInfo(futureContract(k.contract, 3)).cost, 0);

  document.getElementById('keeperTotalCost').textContent = `$${cur}`;
  document.getElementById('keeperTotal1').textContent = `$${t1}`;
  document.getElementById('keeperTotal2').textContent = `$${t2}`;
  document.getElementById('keeperTotal3').textContent = `$${t3}`;
}

function renderProspects() {
  const tbody = document.getElementById('prospectBody');
  const prospects = state.prospects;

  document.getElementById('prospectCount').textContent = getActiveProspects().length;

  if (prospects.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><i class="fas fa-seedling" style="margin-right:8px;color:var(--dimmer)"></i>No farm system players. Load a team or add prospects manually.</td></tr>`;
    document.getElementById('prospectPadTotal').textContent = '$0';
    return;
  }

  tbody.innerHTML = prospects.map(p => {
    const dropped = p.dropped;
    const padCost = PROSPECT_COSTS[p.padChoice] || 10;
    const debutExtra = (p.padChoice === 'DC' && p.isDebut) ? 10 : 0;
    const totalPadCost = padCost + debutExtra;
    const gradYr = parseInt(p.gradYear);
    const gradContract = prospectGradContract(p.padChoice);
    const gradContractCss = tierClass(gradContract);
    const simTag = p.simulated ? `<span class="status-badge sb-sim">+ sim</span>` : '';

    // What KAP cost will this player contribute in their graduation year + beyond
    let kapNote = '';
    if (gradYr === 0) {
      kapNote = `$${contractInfo(gradContract).cost} (${gradContract})`;
    } else if (gradYr <= 3) {
      const fc = futureContract(gradContract, 0);
      kapNote = `$${contractInfo(fc).cost} in ${BASE_YEAR + gradYr}`;
    }

    // BC top100 renewal note
    const bcFree = (p.padChoice === 'BC' && p.isTop100) ? ' (free renewal)' : '';

    return `<tr class="${dropped ? 'dropped' : ''} ${p.simulated ? 'simulated' : ''}" data-id="${p.id}">
      <td><span class="td-pos">${p.pos}</span></td>
      <td class="td-name">${p.name} ${simTag}
        ${p.isDebut && p.padChoice === 'DC' ? `<small style="color:var(--amber)">debuts→PC +$10</small>` : ''}
        ${p.padChoice === 'BC' && p.isTop100 ? `<small style="color:var(--gold)">⭐ Top 100 free</small>` : ''}
      </td>
      <td><span class="td-contract ${tierClass(p.currentStatus || p.padChoice)}">${p.currentStatus || p.padChoice}</span></td>
      <td>
        ${!dropped ? `<div class="tog-wrap" style="gap:5px">
          <select class="pad-sel" onchange="updateProspectPad(${p.id}, this.value)">
            <option value="DC" ${p.padChoice==='DC'?'selected':''}>DC $5</option>
            <option value="PC" ${p.padChoice==='PC'?'selected':''}>PC $10</option>
            <option value="BC" ${p.padChoice==='BC'?'selected':''}>BC $20</option>
          </select>
          ${p.padChoice==='DC' ? `<label class="debut-flag"><input type="checkbox" ${p.isDebut?'checked':''} onchange="updateProspectDebut(${p.id},this.checked)"> Debut?</label>` : ''}
          ${p.padChoice==='BC' ? `<label class="bc-top100"><input type="checkbox" ${p.isTop100?'checked':''} onchange="updateProspectTop100(${p.id},this.checked)"> Top 100</label>` : ''}
        </div>` : '—'}
      </td>
      <td class="td-cost" style="color:var(--cyan)">${dropped ? '—' : `$${totalPadCost}${bcFree}`}</td>
      <td>
        ${!dropped ? `<select class="grad-sel" onchange="updateGradYear(${p.id}, this.value)">
          <option value="0" ${gradYr===0?'selected':''}>2026 (this yr)</option>
          <option value="1" ${gradYr===1?'selected':''}>2027</option>
          <option value="2" ${gradYr===2?'selected':''}>2028</option>
          <option value="3" ${gradYr===3?'selected':''}>2029+</option>
        </select>` : '—'}
      </td>
      <td>
        ${!dropped ? `<span class="td-contract ${gradContractCss}">${gradContract}</span>` : '—'}
      </td>
      <td class="td-future highlight" style="font-size:.75rem">
        ${dropped ? '—' : kapNote}
      </td>
      <td class="c">
        <button class="tog-btn tog-drop ${dropped?'on':''}" onclick="toggleDrop('prospect',${p.id})">
          ${dropped ? 'Restore' : 'Drop'}
        </button>
      </td>
    </tr>`;
  }).join('');

  // PAD total
  const padTotal = getActiveProspects().reduce((s, p) => {
    return s + PROSPECT_COSTS[p.padChoice] + (p.padChoice === 'DC' && p.isDebut ? 10 : 0);
  }, 0);
  document.getElementById('prospectPadTotal').textContent = `$${padTotal}`;
}

// ── State mutations ───────────────────────────────────────────────────────
function toggleIL(id) {
  const k = state.keepers.find(k => k.id === id);
  if (!k) return;
  k.il = !k.il;
  render();
}

function cycleRaT(id) {
  const k = state.keepers.find(k => k.id === id);
  if (!k) return;
  const info = contractInfo(k.contract);
  if (!info.ratEligible) return;
  // Check how many times RaT can be applied
  let maxRaT = 0;
  let c = k.contract;
  while (RAT_REDUCE[c]) { c = RAT_REDUCE[c]; maxRaT++; }
  k.ratCount = (k.ratCount + 1) % (maxRaT + 1);
  render();
}

function toggleDrop(type, id) {
  const arr = type === 'keeper' ? state.keepers : state.prospects;
  const item = arr.find(i => i.id === id);
  if (item) { item.dropped = !item.dropped; render(); }
}

function updateProspectPad(id, val) {
  const p = state.prospects.find(p => p.id === id);
  if (p) { p.padChoice = val; render(); }
}

function updateProspectDebut(id, val) {
  const p = state.prospects.find(p => p.id === id);
  if (p) { p.isDebut = val; render(); }
}

function updateProspectTop100(id, val) {
  const p = state.prospects.find(p => p.id === id);
  if (p) { p.isTop100 = val; render(); }
}

function updateGradYear(id, val) {
  const p = state.prospects.find(p => p.id === id);
  if (p) { p.gradYear = parseInt(val); render(); }
}

function setViewYear(yr) {
  state.viewYear = yr;
  document.querySelectorAll('.s-tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.yr) === yr));
  render();
}

// ── Normalize contract strings from combined_players.json ─────────────────
// Data uses "FC 2" without the '+' — CONTRACT_DATA key is "FC 2+"
function normalizeContract(raw) {
  if (raw === 'FC 2') return 'FC 2+';
  return CONTRACT_DATA[raw] ? raw : raw;
}

// ── Load team from data ────────────────────────────────────────────────────
async function loadTeam(abbr) {
  if (!abbr) return;
  state.team = abbr;
  state.keepers = [];
  state.prospects = [];

  try {
    const res = await fetch('./data/combined_players.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load players');
    const players = await res.json();

    // Match by manager abbreviation OR franchise name
    const managersRes = await fetch('./config/managers.json', { cache: 'no-store' }).catch(() => null);
    let teamName = abbr;
    if (managersRes?.ok) {
      const mgrs = await managersRes.json();
      teamName = mgrs.teams?.[abbr]?.name || abbr;
    }

    const teamPlayers = players.filter(p =>
      p.FBP_Team === abbr || p.manager === abbr || p.manager === teamName
    );

    teamPlayers.forEach(p => {
      if (p.player_type === 'MLB') {
        // Normalize years_simple: "TC 1" → "TC 1", "FC 2" → "FC 2+"
        const raw = (p.years_simple || '').trim();
        const contract = normalizeContract(raw);
        if (!CONTRACT_DATA[contract]) return; // skip unrecognized
        state.keepers.push({
          id: uid(), name: p.name, pos: p.position || '?',
          contract, originalContract: contract,
          il: false, ratCount: 0, dropped: false, simulated: false
        });
      } else if (p.player_type === 'Farm') {
        // Map contract_type to PAD choice
        const ct = (p.contract_type || '').toLowerCase();
        let padChoice = 'PC';
        if (ct.includes('blue chip')) padChoice = 'BC';
        else if (ct.includes('development')) padChoice = 'DC';
        else if (ct.includes('purchased')) padChoice = 'PC';
        state.prospects.push({
          id: uid(), name: p.name, pos: p.position || '?',
          currentStatus: padChoice, padChoice,
          isTop100: false, isDebut: false, gradYear: 1,
          dropped: false, simulated: false
        });
      }
    });

    // Sort keepers by cost desc
    state.keepers.sort((a,b) => contractInfo(b.contract).cost - contractInfo(a.contract).cost);
  } catch (e) {
    console.warn('Could not load team data:', e);
    // Load demo data for preview
    loadDemoData(abbr);
  }
  render();
}

function loadDemoData(abbr) {
  // Demo keepers for testing
  const demoKeepers = [
    { contract:'FC 2+', name:'Ronald Acuña Jr.', pos:'OF' },
    { contract:'FC 1',  name:'Yordan Alvarez',   pos:'DH' },
    { contract:'VC 2',  name:'Trea Turner',      pos:'SS' },
    { contract:'VC 1',  name:'Spencer Strider',  pos:'SP' },
    { contract:'TC 2',  name:'Jackson Chourio',  pos:'OF' },
    { contract:'TC 1',  name:'Corbin Carroll',   pos:'OF' },
    { contract:'TC R',  name:'Jackson Holliday', pos:'SS' },
  ];
  const demoProspects = [
    { padChoice:'BC', name:'Wyatt Langford',  pos:'OF', gradYear:1 },
    { padChoice:'PC', name:'Chase Burns',     pos:'SP', gradYear:0 },
    { padChoice:'DC', name:'Walker Jenkins',  pos:'OF', gradYear:2 },
  ];
  state.keepers = demoKeepers.map(k => ({ id:uid(), ...k, originalContract:k.contract, il:false, ratCount:0, dropped:false, simulated:false }));
  state.prospects = demoProspects.map(p => ({ id:uid(), ...p, currentStatus:p.padChoice, isTop100:false, isDebut:false, dropped:false, simulated:false }));
}

// ── Add player modal ──────────────────────────────────────────────────────
let modalMode = 'keeper';


// ── Add Player Modal: scenario quick-picks & contract sync ───────────────
function syncProjectedContract() {
  const orig = document.getElementById('addContract').value;
  const proj = document.getElementById('addProjectedContract');
  proj.value = orig;
  updateProjPreview();

}

/* setScenario removed */

function updateProjPreview() {
  const orig = document.getElementById('addContract').value;
  const proj = document.getElementById('addProjectedContract').value;
  const cost = CONTRACT_DATA[proj]?.cost ?? 0;

  const previewColor = {'TC R':'#F5F5F5','TC BC 1':'#F5F5F5','TC BC 2':'#F5F5F5','TC 1':'#F5F5F5','TC 2':'#F5F5F5','VC 1':'#FFB612','VC 2':'#FFB612','FC 1':'#EF3E42','FC 2+':'#EF3E42'}[proj] || '#F5F5F5';
  const previewEl = document.getElementById('projCostPreview');
  if (previewEl) { previewEl.textContent = `$${cost} KAP`; previewEl.style.color = previewColor; }
  const changed = proj !== orig;
  const changedEl = document.getElementById('projContractChanged');
  if (changedEl) changedEl.style.display = changed ? 'inline' : 'none';

  const noteEl = document.getElementById('projContractNote');
  if (noteEl) {
    if (!changed) {
      noteEl.textContent = 'Matches current contract. Future projections use this as the baseline.';
    } else {
      const origCost = CONTRACT_DATA[orig]?.cost ?? 0;
      const diff = cost - origCost;
      const diffStr = diff === 0 ? 'same cost' : diff > 0 ? `$${diff} more` : `$${Math.abs(diff)} less`;
      noteEl.textContent = `Overrides actual contract (${orig} $${origCost}) → projecting as ${proj} $${cost} — ${diffStr} per season. Future years progress from ${proj}.`;
    }
  }
}

// ── Inline contract override for simulated keepers in the table ───────────
function updateKeeperContract(id, newContract) {
  const k = state.keepers.find(k => k.id === id);
  if (!k) return;
  k.contract = newContract;
  // Reset RaT if new contract makes it ineligible
  if (!CONTRACT_DATA[newContract]?.ratEligible) k.ratCount = 0;
  if (!CONTRACT_DATA[newContract]?.ilEligible) k.il = false;
  render();
}

document.getElementById('btnAddKeeper').addEventListener('click', () => openModal('keeper'));
document.getElementById('btnAddProspect').addEventListener('click', () => openModal('prospect'));

function openModal(mode) {
  modalMode = mode;
  document.getElementById('tabKeeper').classList.toggle('active', mode === 'keeper');
  document.getElementById('tabProspect').classList.toggle('active', mode === 'prospect');
  document.getElementById('formKeeper').style.display = mode === 'keeper' ? 'block' : 'none';
  document.getElementById('formProspect').style.display = mode === 'prospect' ? 'block' : 'none';
  document.getElementById('modalTitleText').textContent = mode === 'keeper' ? 'Add Simulated Player' : 'Add Simulated Prospect';
  // Reset keeper form state
  if (mode === 'keeper') {
    document.getElementById('addContract').value = 'VC 1';
    document.getElementById('addProjectedContract').value = 'VC 1';

    updateProjPreview();
  }
  document.getElementById('addModal').classList.add('open');
}

document.getElementById('tabKeeper').addEventListener('click', () => {
  modalMode = 'keeper';
  document.getElementById('tabKeeper').classList.add('active');
  document.getElementById('tabProspect').classList.remove('active');
  document.getElementById('formKeeper').style.display = 'block';
  document.getElementById('formProspect').style.display = 'none';
});

document.getElementById('tabProspect').addEventListener('click', () => {
  modalMode = 'prospect';
  document.getElementById('tabKeeper').classList.remove('active');
  document.getElementById('tabProspect').classList.add('active');
  document.getElementById('formKeeper').style.display = 'none';
  document.getElementById('formProspect').style.display = 'block';
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('addModal').addEventListener('click', e => { if (e.target.id === 'addModal') closeModal(); });

function closeModal() {
  document.getElementById('addModal').classList.remove('open');
  document.getElementById('addName').value = '';
  document.getElementById('addPName').value = '';

}

document.getElementById('modalSubmit').addEventListener('click', () => {
  if (modalMode === 'keeper') {
    const name     = document.getElementById('addName').value.trim();
    const pos      = document.getElementById('addPos').value;
    const original = document.getElementById('addContract').value;
    const projected= document.getElementById('addProjectedContract').value;
    if (!name) { document.getElementById('addName').focus(); return; }
    state.keepers.push({
      id: uid(), name, pos,
      contract: projected,        // what drives all math
      originalContract: original, // what they actually hold (for display)
      il: false, ratCount: 0, dropped: false, simulated: true
    });
  } else {
    const name = document.getElementById('addPName').value.trim();
    const pos  = document.getElementById('addPPos').value;
    const pad  = document.getElementById('addPContract').value;
    const grad = parseInt(document.getElementById('addPGrad').value);
    if (!name) { document.getElementById('addPName').focus(); return; }
    state.prospects.push({ id:uid(), name, pos, currentStatus:pad, padChoice:pad, isTop100:false, isDebut:false, gradYear:grad, dropped:false, simulated:true });
  }
  closeModal();
  render();
});

// ── Budget settings ──────────────────────────────────────────────────────
document.getElementById('budgetSettingsBtn').addEventListener('click', () => {
  document.getElementById('budgetSettingsPanel').classList.toggle('open');
});

['bsBracket','bsSeasonRoll','bsPadRoll','bsConsolBonus','bsElimBonus','bsRatBudget'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', e => {
    const val = isNaN(e.target.value) ? e.target.value : parseInt(e.target.value) || 0;
    const key = { bsBracket:'bracket', bsSeasonRoll:'seasonRollover', bsPadRoll:'padRollover',
                  bsConsolBonus:'consolBonus', bsElimBonus:'elimBonus', bsRatBudget:'ratBudget' }[id];
    state.budget[key] = val;
    render();
  });
});

// ── Season tabs ──────────────────────────────────────────────────────────
document.getElementById('seasonTabs').addEventListener('click', e => {
  const tab = e.target.closest('.s-tab');
  if (!tab) return;
  setViewYear(parseInt(tab.dataset.yr));
});

// ── Team select ──────────────────────────────────────────────────────────
document.getElementById('teamSelect').addEventListener('change', e => {
  loadTeam(e.target.value);
});

// ── Reset ────────────────────────────────────────────────────────────────
document.getElementById('btnReset').addEventListener('click', () => {
  // Reset all modifications but keep players
  state.keepers.forEach(k => { k.il = false; k.ratCount = 0; k.dropped = false; });
  state.keepers = state.keepers.filter(k => !k.simulated);
  state.prospects.forEach(p => { p.dropped = false; p.isDebut = false; p.isTop100 = false; p.gradYear = 1; });
  state.prospects = state.prospects.filter(p => !p.simulated);
  state.budget = { bracket: document.getElementById('bsBracket').value, seasonRollover:0, padRollover:0, consolBonus:0, elimBonus:0, ratBudget:0 };
  document.getElementById('bsSeasonRoll').value = 0;
  document.getElementById('bsPadRoll').value = 0;
  document.getElementById('bsConsolBonus').value = 0;
  document.getElementById('bsElimBonus').value = 0;
  document.getElementById('bsRatBudget').value = 0;
  render();
});

// ── LocalStorage persistence ──────────────────────────────────────────────
const TB_SCHEMA_VERSION = 2; // bump when CONTRACT_DATA keys change

function saveToLocal() {
  try { localStorage.setItem('fbp_teambuilder', JSON.stringify({ state, timestamp: Date.now(), version: TB_SCHEMA_VERSION })); } catch(e) {}
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem('fbp_teambuilder');
    if (!raw) return false;
    const { state: saved, timestamp, version } = JSON.parse(raw);
    // Discard stale schema (e.g. old dash-format contracts)
    if ((version || 0) < TB_SCHEMA_VERSION) { localStorage.removeItem('fbp_teambuilder'); return false; }
    // Only restore if saved within 7 days
    if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return false;
    state = saved;
    // Restore UI
    if (state.team) document.getElementById('teamSelect').value = state.team;
    if (state.budget) {
      document.getElementById('bsBracket').value = state.budget.bracket || 'consolation';
      document.getElementById('bsSeasonRoll').value = state.budget.seasonRollover || 0;
      document.getElementById('bsPadRoll').value = state.budget.padRollover || 0;
      document.getElementById('bsConsolBonus').value = state.budget.consolBonus || 0;
      document.getElementById('bsElimBonus').value = state.budget.elimBonus || 0;
      document.getElementById('bsRatBudget').value = state.budget.ratBudget || 0;
    }
    return true;
  } catch(e) { return false; }
}

// ── Init ─────────────────────────────────────────────────────────────────
(function init() {
  // Try to restore from auth (logged-in team)
  if (typeof authManager !== 'undefined') {
    try {
      const team = authManager.getTeam?.();
      if (team?.abbreviation) {
        document.getElementById('teamSelect').value = team.abbreviation;
        state.team = team.abbreviation;
      }
    } catch(e) {}
  }

  if (!loadFromLocal()) {
    // Load team from data if authenticated, otherwise demo
    if (state.team) {
      loadTeam(state.team);
      return; // loadTeam calls render()
    } else {
      loadDemoData('WIZ');
    }
  }

  render();
})();
