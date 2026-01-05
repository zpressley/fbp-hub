## Webhooks

```javascript
//const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1352753984682852393/IWpnzKNaIu5bsq4YqC3n6ElI78lQcvZgbf7Io4TGQ5AFBmdZx3nk-U_ePn4Ye9Zf-zAo'; 
// This is for alerts in the Auction Portal

function createOnEditTrigger() {
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}

function handleEdit(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();
  const editedValue = e.value || '';
  const timestamp = new Date().toLocaleString();

  if (sheet.getName() !== 'Weekly Auctions') return;
  if (row < 2 || row > 13) return;

  const fullPlayerCell = sheet.getRange(row, 5).getValue(); // Column E
  const playerName = extractPlayerName(fullPlayerCell);

  // If cell is cleared
  if (editedValue === '') {
    const msg = `❌ Cell **${e.range.getA1Notation()}** was cleared`;
    postToDiscord(msg);
    return;
  }

  // ORIGINATING BID (Column E)
  if (col === 5) {
    const team = sheet.getRange(row, 2).getValue(); // Column B = team abbreviation
    const bRefLink = `https://www.baseball-reference.com/search/search.fcgi?search=${encodeURIComponent(playerName)}`;

    const msg = `📣 **Originating Bid Posted**

🏷️ **Team:** ${team}  
🕒 **Time:** ${timestamp}  
🧢 **Player:** [${playerName}](${bRefLink})  

📝 **Input:** "${editedValue}" (Cell: ${e.range.getA1Notation()})`;

    postToDiscord(msg);
    return;
  }

  // CHALLENGING BID (Columns G-R)
  if (col >= 7 && col <= 18) {
    const team = sheet.getRange(1, col).getValue(); // Row 1 = challenging team abbreviation

    const msg = `⚔️ **Challenging Bid Placed** 

🏷️ **Team:** ${team}  
💰 **Bid:** $${editedValue}  
🧢 **Player:** ${playerName}  

📍 **Cell:** ${e.range.getA1Notation()}`;

    postToDiscord(msg);
    return;
  }
}

function extractPlayerName(fullName) {
  const idx = fullName.indexOf(' (');
  return idx !== -1 ? fullName.slice(0, idx).trim() : fullName.trim();
}

function postToDiscord(message) {
  const payload = { content: message };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
}

function createDailyTrigger() {
  ScriptApp.newTrigger('dailyAuctionSummary')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
}



```

### Alerts to Discord: 

```javascript

// 🔔 1. Monday 3PM — Open Alert
function sendAuctionOpenAlert() {
  const message = "@everyone 🟢 **Auction Window is Now Open!**\nYou can now place your Originating Bids in the Weekly Auction Portal.";
  postToDiscord(message);
}

// 🔔 2. Tues/Wed/Thurs/Fri 9AM — Daily Summary
function sendDailySummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Weekly Auctions');
  if (!sheet) return;

  const lastRow = 13;
  const challengeCols = { start: 7, end: 18 };
  let summary = "**📊 Daily Auction Summary**\n";
  let messages = [];

  for (let row = 2; row <= lastRow; row++) {
    let fullPlayerName = sheet.getRange(row, 5).getValue();
    if (!fullPlayerName) continue;

    const playerName = extractPlayerName(fullPlayerName);
    const teamAbbrev = sheet.getRange(row, 2).getValue();
    const bRefLink = `https://www.baseball-reference.com/search/search.fcgi?search=${encodeURIComponent(playerName)}`;
    const linkedPlayer = `[${playerName}](${bRefLink})\u200B`;  // Zero-width space to suppress preview

    // Find highest challenging bid
    let maxBid = 0;
    let maxBidTeam = null;
    for (let col = challengeCols.start; col <= challengeCols.end; col++) {
      const bidVal = parseFloat((sheet.getRange(row, col).getValue() || '').toString().replace('$', '')) || 0;
      if (bidVal > maxBid) {
        maxBid = bidVal;
        maxBidTeam = sheet.getRange(1, col).getValue();
      }
    }

    let entry = `\n🧢 **Player:** ${linkedPlayer}\n📌 **Originating Team:** ${teamAbbrev}\n`;
    entry += maxBid > 0 ? `⚔️ **High Challenge:** $${maxBid} by ${maxBidTeam}\n` : `🚫 No Challenges Yet\n`;
    entry += `──────────────────────\n`;

    if ((summary + entry).length > 2000) {
      messages.push(summary);
      summary = "**📊 Weekly Auction Summary (cont'd)**\n";
    }

    summary += entry;
  }

  if (summary.length > 30) messages.push(summary);
  messages.forEach(msg => postToDiscord(msg));
}

// 🔔 3. Tuesday 11PM — OB Closed
function sendOBWindowClosedAlert() {
  const message = "@everyone 🛑 **Originating Bid Window is Now Closed!**\nYou may no longer place OBs for this week.";
  postToDiscord(message);
}

// 🔔 4. Friday 9PM — Challenge Closed
function sendChallengeClosedAlert() {
  const message = "@everyone ⛔ **Challenge Bid Window is Now Closed!**\nFinal bids are locked until resolution.";
  postToDiscord(message);
}

// 🔔 5. Saturday 9AM — Weekly Summary / Resolutions
function sendWeeklySummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Weekly Auctions');
  if (!sheet) return;

  const challengeCols = { start: 7, end: 18 };
  let msgWinners = "**🏁 Weekly Auction Results**\n";
  let msgQuestions = "**❓ Do You Want to Match?**\n";

  for (let row = 2; row <= 13; row++) {
    const fullPlayer = sheet.getRange(row, 5).getValue();
    const team = sheet.getRange(row, 2).getValue();
    if (!fullPlayer) continue;

    const player = extractPlayerName(fullPlayer);
    const bRefLink = `https://www.baseball-reference.com/search/search.fcgi?search=${encodeURIComponent(player)}`;
    const linkedPlayer = `[${player}](${bRefLink})\u200B`;

    let maxBid = 0;
    let maxTeam = null;

    for (let col = challengeCols.start; col <= challengeCols.end; col++) {
      const bid = parseFloat((sheet.getRange(row, col).getValue() || '').toString().replace('$', '')) || 0;
      if (bid > maxBid) {
        maxBid = bid;
        maxTeam = sheet.getRange(1, col).getValue();
      }
    }

    if (maxBid === 0) {
      msgWinners += `✅ **${team} wins** ${linkedPlayer} — no challengers.\n`;
    } else {
      msgQuestions += `🔔 **${team}**, do you want to match the high bid of **$${maxBid}** by **${maxTeam}** for ${linkedPlayer}?\n`;
    }
  }

  postToDiscord(msgWinners);
  postToDiscord(msgQuestions);
}

// Utility: Extract "First Last" from "First Last (TEAM - POS)"
function extractPlayerName(fullName) {
  const idx = fullName.indexOf(' (');
  return idx !== -1 ? fullName.slice(0, idx).trim() : fullName.trim();
}

// Utility: Post to Discord
function postToDiscord(message) {
  const payload = { content: message };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
}



```