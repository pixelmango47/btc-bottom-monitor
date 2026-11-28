/* BTC Value Monitor v9.1 */
(function () {
  "use strict";
  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function lin(v, z, f) { if (v == null || typeof v !== "number" || isNaN(v)) return null; return Math.max(0, Math.min(1, (v - z) / (f - z))) * 100; }
  function f2(v) { return v == null ? "—" : v.toFixed(2); }
  function usd(v) { return v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fd(s) { return +s.slice(8, 10) + " " + MON[+s.slice(5, 7) - 1]; }
  function fdy(s) { return fd(s) + " " + s.slice(0, 4); }
  function dnum(s) { return Date.parse(s + "T00:00:00Z"); }
  function addDays(s, n) { return new Date(dnum(s) + n * 864e5).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((dnum(b) - dnum(a)) / 864e5); }
  function todayCbr() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function sgn(v, d) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d == null ? 0 : d); }

  // ---------- model ----------
  // Value score: "Is BTC cheap?". Each signal scores 0-100 on a straight line from z (no signal) to f (full score = the level seen at past lows).
  // Small-cycle levels: for six signals whose reading at the low got less extreme at each of the 2015, 2018 and 2022 lows,
  // the full-score level moves by the per-cycle trend (fitted on those three lows). 2022-cycle levels = classic levels.
  // LV[k] = [z, f (classic), per-cycle shift]
  var LV = { mvrv: [1.5, 0.8, 0.0952], lth: [1.6, 0.8, 0.0827], balanced: [2.0, 1.0, 0.1197], mayer: [1.0, 0.6, 0.1249], addrLoss: [0.20, 0.55, -0.0591], sth: [1.1, 0.75, 0.1289] };
  var HALV = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];
  function epochOf(d) { var e = 0; for (var i = 0; i < HALV.length; i++) if (!d || d >= HALV[i]) e++; return e; }
  function fAt(k, date, mode) {
    var x = LV[k]; if (!x) return null;
    if ((mode || S.lv) !== "adj") return x[1];
    var sh = x[2] * (epochOf(date) - 3), cap = 0.5 * Math.abs(x[0] - x[1]);
    return x[1] + Math.max(-cap, Math.min(cap, sh));
  }
  function L2(r, k, date, mode) { return lin(r[k], LV[k][0], fAt(k, date, mode)); }
  function fmtLv(k, v) { return k === "addrLoss" ? Math.round(v * 100) + "%" : v.toFixed(2) + (k === "mvrv" || k === "mayer" ? "" : "×"); }
  // hits = past lows (2015, 2018, 2022) where the signal scored 70+ within 90 days; prec = share of its firing days within 30% of a two-year low (a random day: 6%); up = share of firing days with BTC higher one year later. Classic levels.
  var IND = [
    { k: "cvdd", w: 12, name: "Price vs CVDD", hits: "3 of 3", prec: 99, up: 100, full: "1.00×", what: "Price divided by CVDD, a floor price built from coin-days destroyed (how long coins sat before they moved).", why: "Price has touched this floor at every cycle low and rarely anywhere else.",
      score: function (r) { return lin(r.cvdd, 1.6, 1.0); }, read: function (r) { return f2(r.cvdd) + "×"; } },
    { k: "mvrv", w: 11, name: "MVRV", lv: "mvrv", hits: "3 of 3", prec: 47, up: 99, full: "0.80", what: "Market value divided by realized value: price against the average price at which all coins last moved.", why: "Below 1, the average holder is at a loss. Deep readings have only come near cycle lows.",
      score: function (r, d, m) { return L2(r, "mvrv", d, m); }, read: function (r) { return f2(r.mvrv); } },
    { k: "lth", w: 9, name: "Long-term holder cost", lv: "lth", hits: "3 of 3", prec: 47, up: 100, full: "0.80×", what: "Price divided by the average cost of coins held more than 155 days.", why: "When even patient holders are under water, the sellers who are left are few.",
      score: function (r, d, m) { return L2(r, "lth", d, m); }, read: function (r) { return f2(r.lth) + "×"; } },
    { k: "sopr", w: 8, name: "SOPR, 7-day (loss-taking)", hits: "2 of 2", prec: 51, up: 86, full: "−0.020", what: "Spent Output Profit Ratio minus 1, as a 7-day average: profit or loss on coins that moved.", why: "Below zero, holders sell at a loss. Deep, lasting loss-taking is what capitulation looks like.",
      score: function (r) { return lin(r.sopr7d, 0.01, -0.02); }, read: function (r) { return r.sopr7d == null ? "—" : (r.sopr7d >= 0 ? "+" : "−") + Math.abs(r.sopr7d).toFixed(3); } },
    { k: "w200", w: 8, name: "200-week average", hits: "2 of 3", prec: 49, up: 100, full: "0.85×", what: "Price divided by the 200-week moving average, the long-run trend line.", why: "Price has rarely stayed below this line for long. Time below it has been among the best times to buy.",
      score: function (r) { return lin(r.w200, 1.3, 0.85); }, read: function (r) { return f2(r.w200) + "×"; } },
    { k: "loss", w: 7, name: "Addresses in loss", lv: "addrLoss", hits: "3 of 3", prec: 31, up: 91, full: "55%", what: "Share of addresses that hold coins worth less than they paid.", why: "Shows how wide the pain is. Lows came when about half of all addresses were at a loss.",
      score: function (r, d, m) { return L2(r, "addrLoss", d, m); }, read: function (r) { return r.addrLoss == null ? "—" : (r.addrLoss * 100).toFixed(1) + "%"; } },
    { k: "bal", w: 6, name: "Balanced price", lv: "balanced", hits: "3 of 3", prec: 52, up: 99, full: "1.00×", what: "Price divided by the balanced price, a fair-value line made from realized price minus transfer price.", why: "Price has met this line at the deepest point of past bears.",
      score: function (r, d, m) { return L2(r, "balanced", d, m); }, read: function (r) { return f2(r.balanced) + "×"; } },
    { k: "lev", w: 6, name: "Leverage flush", hits: "no data", prec: null, up: null, full: "funding −5%/yr, OI −30%", what: "Futures funding rate (7-day) and how far open interest is below its 90-day high.", why: "Negative funding and a big fall in open interest show forced sellers are gone.",
      score: function (r) { var a = lin(r.funding7d, 10, -5), b = lin(r.oiDrawdown, 0, 30); if (a == null && b == null) return null; return ((a == null ? b : a) + (b == null ? a : b)) / 2; }, read: function (r) { return r.oiDrawdown == null ? "—" : "OI −" + r.oiDrawdown.toFixed(1) + "%"; } },
    { k: "pi", w: 6, name: "Pi Cycle bottom", hits: "3 of 3", prec: 42, up: 100, full: "0.95", what: "The 150-day exponential average against 0.745 × the 471-day average.", why: "A cross below has lined up with past lows within weeks.",
      score: function (r) { return lin(r.pi, 1.3, 0.95); }, read: function (r) { return f2(r.pi); } },
    { k: "time", w: 6, name: "Time since peak", hits: "3 of 3", prec: 36, up: 96, full: "365–420 days", what: "Days since the cycle's all-time high.", why: "Past lows came 364–406 days after the top. It is the only signal that does not use price.",
      score: function (r) { var d = r.daysSincePeak; if (d == null) return null; return d < 240 ? 0 : d < 365 ? (d - 240) / 125 * 100 : d <= 420 ? 100 : d < 600 ? 100 - (d - 420) / 180 * 70 : 30; }, read: function (r) { return r.daysSincePeak == null ? "—" : r.daysSincePeak + " d"; } },
    { k: "puell", w: 5, name: "Puell multiple", hits: "3 of 3", prec: 39, up: 91, full: "0.45", what: "Daily miner income against its 1-year average.", why: "Low values put miners under stress. When weak miners have sold, a big source of supply is gone.",
      score: function (r) { return lin(r.puell, 1.0, 0.45); }, read: function (r) { return f2(r.puell); } },
    { k: "sth", w: 5, name: "Short-term holder cost", lv: "sth", hits: "3 of 3", prec: 21, up: 56, full: "0.75×", what: "Price divided by the average cost of coins moved in the last 155 days.", why: "Below 1, recent buyers are under water. It also fires in normal corrections, so its weight is low.",
      score: function (r, d, m) { return L2(r, "sth", d, m); }, read: function (r) { return f2(r.sth) + "×"; } },
    { k: "fg", w: 3, name: "Fear & Greed, 7-day", hits: "2 of 2", prec: 19, up: 61, full: "10", what: "The Crypto Fear & Greed Index, 7-day average.", why: "Extreme fear comes at lows, but also in many corrections, so its weight is low.",
      score: function (r) { return lin(r.fg7d, 50, 10); }, read: function (r) { return r.fg7d == null ? "—" : r.fg7d.toFixed(0); } },
    { k: "hash", w: 3, name: "Hash ribbons", hits: "3 of 3", prec: 14, up: 86, full: "0–30 days after a recovery", what: "30-day against 60-day average hash rate. A recovery after miner capitulation is the signal.", why: "Recoveries came after past lows, but also many other times, so its weight is low.",
      score: function (r, date) { if (r.hashCapitulating === true) return 50; if (!r.hashLastRecovery) return r.hashCapitulating === false ? 0 : null; var d = daysBetween(r.hashLastRecovery, date); return d <= 30 ? 100 : d <= 60 ? 100 - (d - 30) / 30 * 100 : 0; }, read: function (r) { return r.hashCapitulating ? "capitulating" : (r.hashLastRecovery ? "rec. " + fd(r.hashLastRecovery) : "—"); } },
    { k: "mayer", w: 3, name: "Mayer multiple", lv: "mayer", hits: "3 of 3", prec: 39, up: 81, full: "0.60", what: "Price divided by the 200-day moving average.", why: "Deep readings mark oversold markets. It overlaps with the 200-week line, so its weight is low.",
      score: function (r, d, m) { return L2(r, "mayer", d, m); }, read: function (r) { return f2(r.mayer); } },
    { k: "rr", w: 2, name: "Reserve risk", hits: "3 of 3", prec: 21, up: 98, full: "0.0010", what: "Price against the confidence of long-term holders (how little they spend).", why: "Low values have meant good long-term value. It overlaps with MVRV, so its weight is low.",
      score: function (r) { return lin(r.reserveRisk, 0.004, 0.001); }, read: function (r) { return r.reserveRisk == null ? "—" : r.reserveRisk.toFixed(4); } }
  ];
  var CONF = [
    { k: "etf", name: "ETF net flow, 10 days", tip: "Net BTC bought by US spot ETFs over 10 days. Steady buying came back after past lows.", score: function (c) { return lin(c.etf10d, -20000, 20000); }, read: function (c) { return c.etf10d == null ? "—" : (c.etf10d >= 0 ? "+" : "−") + Math.abs(Math.round(c.etf10d)).toLocaleString("en-US") + " BTC"; } },
    { k: "cb", name: "Coinbase premium", tip: "The price gap between Coinbase (US buyers) and offshore exchanges. A positive premium shows US demand coming back.", score: function (c) { return lin(c.cbPremium, -0.2, 0.1); }, read: function (c) { return c.cbPremium == null ? "—" : (c.cbPremium >= 0 ? "+" : "−") + Math.abs(c.cbPremium).toFixed(2) + "%"; } },
    { k: "stable", name: "Stablecoin supply, 30 days", tip: "Change in total stablecoin supply over 30 days. Growth means new cash coming into crypto.", score: function (c) { return lin(c.stable30d, -5, 3); }, read: function (c) { return c.stable30d == null ? "—" : (c.stable30d >= 0 ? "+" : "−") + Math.abs(c.stable30d).toFixed(1) + "%"; } },
    { k: "usdtd", name: "USDT dominance, 30 days", tip: "Change in Tether's share of all crypto value over 30 days. A fall means money is moving from cash back into coins.", score: function (c) { return lin(c.usdtd30d, 8, -5); }, read: function (c) { return c.usdtd30d == null ? "—" : (c.usdtd30d >= 0 ? "+" : "−") + Math.abs(c.usdtd30d).toFixed(1) + "%"; } }
  ];
  // Value bands. Stats from the weekly backtest (mid-2013 to Nov 2025): share of weeks, % of weeks within 30% of that cycle's final low, median 1-year return, % higher 1 year later.
  var BANDS = [
    { lo: 0, hi: 19, name: "Not cheap" }, { lo: 20, hi: 39, name: "Fair value" }, { lo: 40, hi: 59, name: "Getting cheap" },
    { lo: 60, hi: 74, name: "Cheap" }, { lo: 75, hi: 89, name: "Very cheap" }, { lo: 90, hi: 100, name: "Extreme value" }
  ];
  var BSTATS = {
    classic: [[69.7, 0, 44, 59], [12.4, 0, 74, 77], [6.1, 2, 65, 82], [6.0, 36, 68, 100], [5.1, 82, 105, 100], [0.6, 100, 134, 100]],
    adj: [[71.7, 0, 43, 59], [12.1, 0, 64, 77], [5.8, 5, 80, 97], [6.6, 47, 83, 100], [3.4, 100, 121, 100], [0.3, 100, 134, 100]]
  };
  var BEARS = { adj: [4, 4, 4, 4, 3, 1], classic: [4, 4, 4, 3, 3, 1] };
  function bandIdx(s) { return s == null ? -1 : s < 20 ? 0 : s < 40 ? 1 : s < 60 ? 2 : s < 75 ? 3 : s < 90 ? 4 : 5; }
  function bandName(s) { var i = bandIdx(s); return i < 0 ? "—" : BANDS[i].name; }
  var CUTS = [0, 20, 40, 60, 75, 90, 101];

  // Bottom in?: signs that only show after a low. Weighted average x deep-value gate.
  // Gate: highest small-cycle value score since this cycle's top: below 60 -> x0.4, 60-74 -> x0.5, 75+ -> x1.
  var BI = [
    { k: "nolow", w: 25, name: "No new low", tip: "Days since the lowest price of this bear market (the intraday low on Bybit, BTC/USDT). Zero on the day of a new low. Full score at 120 days." },
    { k: "rise", w: 10, name: "Bounce from the low", tip: "Price against the lowest price of this bear market (intraday). Full score at 1.5× (50% above the low)." },
    { k: "sth", w: 20, name: "Above recent buyers' cost", tip: "Price against the short-term holder cost (coins moved in the last 155 days). Zero at 0.85×, full at 1.05×: recent buyers back in profit." },
    { k: "mayer", w: 15, name: "Above the 200-day average", tip: "Price against its 200-day average. Zero at 0.80×, full at 1.10×." },
    { k: "sopr", w: 10, name: "Selling at a profit", tip: "SOPR, 7-day. Zero at −0.005, full at +0.004: coins that move are sold at a profit again." },
    { k: "hash", w: 5, name: "Miners recovered", tip: "Hash ribbons. Full when hash rate recovered after the low (or within 30 days before it). Zero while miners capitulate. Half otherwise." }
  ];
  // Money flows (ETF net flow, Coinbase premium, stablecoin supply, USDT dominance) are shown on the card but not scored: no data before 2024, so they cannot be backtested.
  var BIB = [
    { lo: 0, hi: 24, name: "Not yet", lowIn: 12, weeks: 138, col: 1, cyc: "Mostly before the low, in all three bear markets (121 of 138 weekly readings)." },
    { lo: 25, hi: 49, name: "Early signs", lowIn: 31, weeks: 59, col: 2, cyc: "On both sides of the low, in all three bear markets." },
    { lo: 50, hi: 74, name: "Likely in", lowIn: 93, weeks: 30, col: 3, cyc: "After the low in 2015 and 2018. In 2022, two of its seven weeks came before the final (FTX) low." },
    { lo: 75, hi: 100, name: "Confirmed", lowIn: 100, weeks: 94, col: 5, cyc: "Only after the low, in all three bear markets." }
  ];
  function biIdx(s) { return s == null ? -1 : s < 25 ? 0 : s < 50 ? 1 : s < 75 ? 2 : 3; }
  function biName(s) { var i = biIdx(s); return i < 0 ? "—" : BIB[i].name; }
  function biCol(s) { var i = biIdx(s); return i < 0 ? css("--surf2") : css("--b" + BIB[i].col); }
  function gateOf(vmax) { return vmax == null ? 1 : vmax < 60 ? 0.4 : vmax < 75 ? 0.5 : 1; }
  function biComps(x) {
    // x: {p, low, dsl, sth, mayer, sopr, hcap, recAfterLow, flows}
    var c = {};
    c.nolow = lin(x.dsl, 0, 120);
    c.rise = x.low ? lin(x.p / x.low, 1.0, 1.5) : null;
    c.sth = lin(x.sth, 0.85, 1.05);
    c.mayer = lin(x.mayer, 0.8, 1.1);
    c.sopr = lin(x.sopr, -0.005, 0.004);
    c.hash = x.hcap === true ? 0 : x.recAfterLow == null ? null : x.recAfterLow ? 100 : 50;
    c.flows = x.flows == null ? null : x.flows;
    var sw = 0, ss = 0;
    BI.forEach(function (b) { var v = c[b.k]; if (v != null) { sw += b.w; ss += b.w * v; } });
    return { c: c, raw: sw ? ss / sw : null };
  }
  // Cycle tops (highest daily close, Coin Metrics) and final lows (lowest intraday price, Bitstamp BTC/USD)
  var CYCLES = [
    { id: "c14", name: "2014–15", short: "’15", top: "2013-12-04", low: "2015-01-14", topP: 1134.9, lowP: 152.40 },
    { id: "c18", name: "2017–18", short: "’18", top: "2017-12-16", low: "2018-12-15", topP: 19640.5, lowP: 3122.28 },
    { id: "c22", name: "2021–22", short: "’22", top: "2021-11-08", low: "2022-11-21", topP: 67541.8, lowP: 15479 },
    { id: "now", name: "Now", short: "Now", top: "2025-10-06", low: null, topP: 124824.45, lowP: null }
  ];
  var NOWC = CYCLES[3];

  function parts(doc, raw, mode) {
    var r = raw || (doc && doc.raw) || {}, date = doc && doc.date, p = {}, sw = 0, ss = 0;
    IND.forEach(function (d) { var s = null; try { s = d.score(r, date, mode); } catch (e) { s = null; } p[d.k] = s; if (s != null) { sw += d.w; ss += d.w * s; } });
    return { total: sw ? ss / sw : null, p: p, sw: sw };
  }
  function liveRaw(doc, P) {
    var r = doc.raw || {}, x = doc.ref || {}, o = {};
    for (var k in r) o[k] = r[k];
    if (!P) return o;
    if (x.cvddPrice) o.cvdd = P / x.cvddPrice;
    if (x.lthPrice) o.lth = P / x.lthPrice;
    if (x.balancedPrice) o.balanced = P / x.balancedPrice;
    if (x.sthPrice) o.sth = P / x.sthPrice;
    if (x.realizedPrice) o.mvrv = P / x.realizedPrice;
    if (x.sma1400) o.w200 = P / x.sma1400;
    if (x.sma200) o.mayer = P / x.sma200;
    var cmBase = r.mvrv && x.realizedPrice ? r.mvrv * x.realizedPrice : null;
    var livBase = r.cvdd && x.cvddPrice ? r.cvdd * x.cvddPrice : null;
    if (r.puell != null && cmBase) o.puell = r.puell * P / cmBase;
    if (r.reserveRisk != null && livBase) o.reserveRisk = r.reserveRisk * P / livBase;
    return o;
  }

  // The backtest page loads this file with BVM_EXPORT set: it gets the same model code, then the page stops here.
  if (window.BVM_EXPORT) {
    window.BVM = { LV: LV, HALV: HALV, epochOf: epochOf, fAt: fAt, lin: lin, IND: IND, CONF: CONF, BANDS: BANDS, BSTATS: BSTATS, BEARS: BEARS, bandIdx: bandIdx, bandName: bandName, CUTS: CUTS,
      BI: BI, BIB: BIB, biIdx: biIdx, biName: biName, biComps: biComps, gateOf: gateOf, CYCLES: CYCLES, parts: parts, rowRaw: rowRaw, cwFind: cwFind, cwCells: cwCells,
      addDays: addDays, daysBetween: daysBetween, fd: fd, fdy: fdy, usd: usd, esc: esc, f2: f2 };
    return;
  }
  // ---------- hover explainers ----------
  var TIPS = {
    score: "<span class='tt-h'>Value: is BTC cheap?</span>The main score. 16 signals, each scored 0–100 by how close it is to the reading seen at past cycle lows, then averaged by weight. It says how cheap BTC is. It does not say the low is in: read it with Bottom in?. Colours run from not cheap to cheap (change them with Colours). A score, not a probability. Hover the coloured arcs to see what each band has meant in the past.",
    bi: "<span class='tt-h'>Bottom in? Has the fall stopped?</span>The timing check. Six signs that only show after a low: no new low, a bounce, price back above recent buyers' cost and the 200-day average, selling at a profit, and miners recovered. In past cycles it reached 50 two to three months after the low, when price was already 27–90% above it. It is held down until the value score has reached 75 in this bear market. A score, not a probability. Money flows are shown but not scored, because they have no data before 2024.",
    ev: "<span class='tt-h'>Price checks</span>Plain checks on price. They are not part of either score. They show what has improved and the price that would undo it. In the 2015, 2018 and 2022 bear markets they gave many false starts: the trend check turned on 3 to 5 times before the final low, and price then fell a further 34–82%; 3 to 4 confirmed higher lows failed in each. Read them with Value.",
    "ev-depth": "<span class='tt-h'>Depth</span>The deepest fall from the all-time high close ($124,824) to the lowest price so far. Ticks when it reaches the trend of past lows (−73%). Past lows: −86.6% (2015), −84.1% (2018), −77.1% (2022).",
    "ev-hl": "<span class='tt-h'>Higher low</span>After the cycle low: a bounce of at least 10%, then a pullback of at least 5% that stays above the low, then a daily close above the bounce high. A new low resets it. After past final lows it confirmed 4 days (2015), 70 days (2019) and 51 days (2023) later.",
    "ev-trend": "<span class='tt-h'>Trend</span>Daily close above its 30-day average, and the 30-day average above the 60-day. After past final lows, both held for five days running 50 days (2015), 77 days (2019) and 46 days (2023) later.",
    clocks: "<span class='tt-h'>Cycle clock</span>Where this cycle is in time and depth, against the 2015, 2018 and 2022 lows. Time clocks say when a low has come before. Depth clocks say how deep past lows went.<span class='tt-m'>Ticks mark the readings at the 2015, 2018 and 2022 lows. The green arc spans them. The diamond is where the trend of past lows points for this cycle. The orange dot is now. Hover a clock's name for its numbers.</span>",
    "lv-adj": "<span class='tt-h'>Small-cycle levels</span>Each past low was less deep than the one before. For MVRV, long-term holder cost, balanced price, Mayer multiple, addresses in loss and short-term holder cost, the full-score level moves one step along the trend of the 2015, 2018 and 2022 lows. See the method page for the numbers.",
    "lv-classic": "<span class='tt-h'>Classic levels</span>Fixed full-score levels: the readings that all three past lows reached. Use this view to compare with older screenshots.",
    moved: "<span class='tt-h'>What moved</span>The signals that changed the value score most, in points of the 0–100 score. The top part is the effect of the live price against the last daily close. The lower part is the change between the last two daily closes.<span class='tt-m'>Price-linked signals follow the live price. On-chain lines update once a day at the source.</span>",
    gate: "<span class='tt-h'>Deep-value check</span>No past low came before the value score (small-cycle levels) had reached 75. Until it has done so in this bear market, Bottom in is held at 40% (value peak below 60) or 50% (value peak 60–74) of its raw reading. The peak counts daily closes and the live price, as in the backtest (weekly closes). This stopped a false start in September–October 2026.",
    chg24: "<span class='tt-h'>24-hour change</span>Change in price over the last 24 hours on the exchange shown.",
    live: "<span class='tt-h'>Live data</span>Each time the page opens, it pulls the data from the sources and works out the scores in your browser: price every 15 seconds (Bybit; Coinbase, Kraken or OKX if Bybit fails), daily highs and lows, funding and open interest (Bybit), Coin Metrics, Fear & Greed, stablecoin supply and the Coinbase premium. LookIntoBitcoin, ETF flows and USDT dominance block direct access from a web page, so the daily task reads them each morning.",
    src: "<span class='tt-h'>Data status</span>When each source last updated. Green: up to date. Amber: older than expected. Price-linked lines (realized price, holder costs, CVDD, balanced price, moving averages) are divided into the live price, so they follow every price move.",
    cbbi: "<span class='tt-h'>CBBI: Colin's Bitcoin Bull Run Index</span>A separate index by Colin Talks Crypto that blends nine cycle signals into one 0–100 number. 0 is the cycle bottom zone, 100 the cycle top zone. Low numbers have come near cycle lows; 90+ near cycle tops. Shown here as a cross-check. It is not part of the scores on this page.",
    "chip-live": "<span class='tt-h'>Live vs last close</span>How much the live price moves the value score compared with the last daily close (UTC).",
    "chip-prev": "<span class='tt-h'>Day before</span>Change in the value score between the last two daily closes.",
    "chip-7": "<span class='tt-h'>7 days</span>Change in the value score at the daily close over the last 7 days.",
    "chip-30": "<span class='tt-h'>30 days</span>Change in the value score at the daily close over the last 30 days.",
    next: "<span class='tt-h'>Next band</span>The BTC price at which the live value score reaches the next band, if the on-chain lines stay as they are today. When price falls, loss-taking and fear usually rise too, so the real score is likely to get there sooner. The second figure is the price above which the score drops back to the band below.",
    hlow: "<span class='tt-h'>Value at the low</span>The shaded band reaches up to the value score at the lowest price of each day (each week before Sep 2025). It shows how cheap BTC got during the day, not only at the close."
  };
  var CBBI_TIPS = {
    PiCycle: "Pi Cycle Top: distance between the 111-day average and 2 × the 350-day average. Near 100 at past tops.",
    RUPL: "Relative unrealized profit/loss (NUPL): how much of the market cap is paper profit.",
    RHODL: "RHODL ratio: value held by new coins against old coins. High when new buyers hold most of the value.",
    Puell: "Puell multiple: miner income against its 1-year average.",
    "2YMA": "2-year moving average multiplier: price against its 2-year average and 5 × that average.",
    Trolololo: "Trolololo (log trend): price against a long-run logarithmic trend line.",
    MVRV: "MVRV Z-score: market value against realized value, scaled by volatility.",
    ReserveRisk: "Reserve risk: price against the confidence of long-term holders.",
    Woobull: "Woobull top cap: price against a top model built from realized price."
  };
  IND.forEach(function (d) {
    TIPS["ind-" + d.k] = function () {
      var lvTxt = d.lv ? (S.lv === "adj" ? "Full score at " + fmtLv(d.lv, fAt(d.lv, null, "adj")) + " with small-cycle levels (classic " + esc(d.full) + ")." : "Full score at " + esc(d.full) + " (classic). Small-cycle level: " + fmtLv(d.lv, fAt(d.lv, null, "adj")) + ".") : "Full score at " + esc(d.full) + ".";
      return "<span class='tt-h'>" + esc(d.name) + " · weight " + d.w + "</span>" + esc(d.what) + " " + esc(d.why) +
        "<span class='tt-m'>" + lvTxt + " Record: " + (d.prec == null ? "data only from 2023, so weight set by judgment." : "fired at " + d.hits + " past lows; " + d.prec + "% of its signal days were within 30% of a cycle low (a random day: 6%).") + "</span>";
    };
  });
  BANDS.forEach(function (b, i) {
    TIPS["band-" + i] = function () {
      var st = BSTATS[S.lv === "adj" ? "adj" : "classic"][i];
      return "<span class='tt-h'>" + b.lo + "–" + b.hi + " · " + b.name + "</span>" +
        "In " + st[0] + "% of weeks since mid-2013. Price was within 30% of that cycle's final low in " + st[1] + "% of these weeks. One year later, BTC was higher " + st[3] + "% of the time, with a median return of +" + st[2] + "%." +
        " Seen in " + BEARS[S.lv === "adj" ? "adj" : "classic"][i] + " of the last 4 bear markets." +
        "<span class='tt-m'>Weekly backtest, mid-2013 to Nov 2025, " + (S.lv === "adj" ? "small-cycle" : "classic") + " levels. Neighbouring weeks overlap, so each band rests on a few bear markets. A guide, not a probability.</span>";
    };
  });
  BIB.forEach(function (b, i) {
    TIPS["bib-" + i] = "<span class='tt-h'>" + b.lo + "–" + b.hi + " · " + b.name + "</span>" + b.cyc + " In the 2014–15, 2018 and 2022 bear markets (top to one year after the low), the low had already passed in " + b.lowIn + "% of the " + b.weeks + " weekly readings in this band." +
      "<span class='tt-m'>Neighbouring weeks overlap, so this rests on three bear markets, not on " + b.weeks + " separate tests. A score, not a probability.</span>";
  });
  BI.forEach(function (b) { TIPS["bic-" + b.k] = "<span class='tt-h'>" + esc(b.name) + " · weight " + b.w + "</span>" + esc(b.tip); });
  CONF.forEach(function (c) { TIPS["conf-" + c.k] = "<span class='tt-h'>" + esc(c.name) + "</span>" + esc(c.tip); });
  Object.keys(CBBI_TIPS).forEach(function (k) { TIPS["cb-" + k] = esc(CBBI_TIPS[k]); });
  // "?" buttons: the detail sits in a hover (or tap) tip, not on the card
  function attrHtml(h) { return String(h == null ? "" : h).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }
  function qi(k, label) { return '<button type="button" class="qi" data-tipk="' + k + '" aria-label="About ' + esc(label || "this") + '">?</button>'; }
  function qiH(h, label) { return '<button type="button" class="qi" data-tip="' + attrHtml(h) + '" aria-label="About ' + esc(label || "this") + '">?</button>'; }
  TIPS["val-rc"] = "<span class='tt-h'>How the value score is made</span>16 signals. Each gets a mark from 0 to 100 for how close it is to its reading at past cycle lows. Weight × mark ÷ 100 = points. The points add up to the score.<span class='tt-m'>The bar has one coloured piece per signal, sized by its points: hover a piece. The hatched part is the points still missing. Open the full sum for each signal's reading (its ? button).</span>";
  TIPS["bi-rc"] = "<span class='tt-h'>How the Bottom in score is made</span>Six recovery signs that showed up after past cycle lows. Each earns points up to its maximum (weights 25, 20, 15, 10, 10 and 5, scaled to 100). The points add up to the raw score. The deep-value check then sets how much of it counts.<span class='tt-m'>Each row's ? button gives the reading now and the price that would raise it.</span>";
  TIPS.flows = "<span class='tt-h'>Money flows</span>ETF net flow, Coinbase premium, stablecoin supply and USDT dominance. Shown, not scored: there is no data before 2024, so they cannot be backtested.";
  TIPS.sig = "<span class='tt-h'>Signals</span>Each signal scored 0–100, heaviest weight first. Hover a name to see why it matters. The small button next to a name changes the view for that signal only.";

  var tt = document.createElement("div"); tt.id = "tt"; tt.setAttribute("role", "tooltip"); document.body.appendChild(tt);
  var ttEl = null;
  function tipFor(el) { var k = el.getAttribute("data-tipk"); if (!k) return el.getAttribute("data-tip"); var t = TIPS[k]; return typeof t === "function" ? t() : t; }
  function showTip(el) {
    var h = tipFor(el); if (!h) return;
    ttEl = el; tt.innerHTML = h; tt.classList.add("on");
    var r = el.getBoundingClientRect(), tw = tt.offsetWidth, th = tt.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), vw - tw - 8);
    var y = r.top - th - 8; if (y < 8) y = Math.min(r.bottom + 8, vh - th - 8);
    tt.style.left = x + "px"; tt.style.top = y + "px";
  }
  function hideTip() { ttEl = null; tt.classList.remove("on"); }
  var hoverable = window.matchMedia && window.matchMedia("(hover: hover)").matches;
  document.addEventListener("mouseover", function (e) { var el = e.target.closest && e.target.closest("[data-tip],[data-tipk]"); if (el && el !== ttEl) showTip(el); });
  document.addEventListener("mouseout", function (e) { var el = e.target.closest && e.target.closest("[data-tip],[data-tipk]"); if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hideTip(); });
  document.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest("[data-tip],[data-tipk]"); if (el) showTip(el); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("click", function (e) {
    if (hoverable) return;
    var el = e.target.closest && e.target.closest("[data-tip],[data-tipk]");
    if (el && el !== ttEl) showTip(el); else hideTip();
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- state ----------
  var S = { data: null, latest: null, prev: null, live: null, liveAt: 0, lastOk: 0, hourly: null, daily: null, range: 0, cbbi: null };
  S.lv = sget("bbm.levels") === "classic" ? "classic" : "adj";
  S.tab = sget("bbm.tab") === "cyc" ? "cyc" : "d14";
  S.cycM = sget("bbm.cycm") || "fall"; if (["fall", "value", "bi"].indexOf(S.cycM) < 0) S.cycM = "fall";
  S.c14 = sget("bbm.c14") === "1";

  // ---------- skins ----------
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  var LIGHT = { daylight: 1, paper: 1 };
  function applySkin() {
    var sel = S.skinSel || "auto";
    var sk = sel === "auto" ? (mq && mq.matches ? "daylight" : "midnight") : sel;
    var root = document.documentElement;
    root.setAttribute("data-skin", sk);
    root.setAttribute("data-light", LIGHT[sk] ? "1" : "0");
    root.setAttribute("data-cb", S.cb ? "1" : "0");
    $("cb").setAttribute("aria-pressed", S.cb ? "true" : "false");
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", css("--bg"));
    if (S.latest) renderAll();
    renderCbbi();
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function bandCol(s) { var i = bandIdx(s); return i < 0 ? css("--surf2") : css("--b" + i); }
  function hexRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join(""); return [0, 2, 4].map(function (p) { return parseInt(h.substr(p, 2), 16); }); }
  function lum(h) { var c = hexRgb(h).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function txtOn(h) { try { var L = lum(h); return (L + 0.05) / 0.0548 > 1.05 / (L + 0.05) ? "#0B0F14" : "#FFFFFF"; } catch (e) { return "inherit"; } }
  // smooth colour scale for the heat strips (band colours at band centres)
  function smoothCol(v) {
    var st = [[10, 0], [30, 1], [50, 2], [67.5, 3], [82.5, 4], [95, 5]];
    v = Math.max(0, Math.min(100, v));
    if (v <= st[0][0]) return css("--b0");
    for (var i = 1; i < st.length; i++) {
      if (v <= st[i][0]) {
        var a = hexRgb(css("--b" + st[i - 1][1])), b = hexRgb(css("--b" + st[i][1])), t = (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0]);
        return "rgb(" + a.map(function (x, j) { return Math.round(x + (b[j] - x) * t); }).join(",") + ")";
      }
    }
    return css("--b5");
  }

  // ---------- gauge geometry ----------
  var CX = 200, CY = 210, R = 146, RO = 176, RL = 198;
  function pt(v, r, cx, cy) { cx = cx == null ? CX : cx; cy = cy == null ? CY : cy; var a = Math.PI * (1 - v / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
  function arc(a, b, r, cx, cy) { var p = pt(a, r, cx, cy), q = pt(b, r, cx, cy); return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + q[0].toFixed(1) + " " + q[1].toFixed(1); }
  (function buildGauge() {
    var cuts = [[0, 19.6], [20.4, 39.6], [40.4, 59.6], [60.4, 74.6], [75.4, 89.6], [90.4, 100]], h = "", hits = "";
    cuts.forEach(function (c, i) {
      h += '<path d="' + arc(c[0], c[1], RO) + '" fill="none" stroke="var(--b' + i + ')" stroke-width="8"/>';
      hits += '<path class="g-hit" tabindex="0" role="img" aria-label="' + BANDS[i].lo + " to " + BANDS[i].hi + ", " + BANDS[i].name + '" data-tipk="band-' + i + '" d="' + arc(CUTS[i] + 0.2, Math.min(100, CUTS[i + 1]) - 0.2, 161) + '" fill="none" stroke="transparent" stroke-width="58" pointer-events="stroke"/>';
    });
    $("g-bands").innerHTML = h;
    $("g-hits").innerHTML = hits;
    $("g-track").setAttribute("d", arc(0, 100, R));
    $("g-prog").setAttribute("d", arc(0, 100, R));
    var t = "";
    [20, 40, 60, 75, 90].forEach(function (v, i) { var p = pt(v, RL); t += '<text class="g-hit" data-tipk="band-' + (i + 1) + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="var(--muted)" font-size="12" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono, monospace">' + v + "</text>"; });
    $("g-ticks").innerHTML = t;
    // CBBI dial: 0 = bottom zone (green) .. 100 = top zone (grey)
    var cb = "", ccuts = [[0, 19.4], [20.6, 39.4], [40.6, 59.4], [60.6, 79.4], [80.6, 100]], cbCol = [5, 4, 2, 1, 0];
    ccuts.forEach(function (c, i) { cb += '<path d="' + arc(c[0], c[1], 106, 120, 122) + '" fill="none" stroke="var(--b' + cbCol[i] + ')" stroke-width="5"/>'; });
    $("cbbi-bands").innerHTML = cb;
    $("cbbi-track").setAttribute("d", arc(0, 100, 88, 120, 122));
    $("cbbi-arc").setAttribute("d", arc(0, 100, 88, 120, 122));
    // Bottom in? dial
    var bh = "", bhits = "", bcuts = [[0, 24.6], [25.4, 49.6], [50.4, 74.6], [75.4, 100]], bcut = [0, 25, 50, 75, 101];
    bcuts.forEach(function (c, i) {
      bh += '<path d="' + arc(c[0], c[1], RO) + '" fill="none" stroke="var(--b' + BIB[i].col + ')" stroke-width="8"/>';
      bhits += '<path class="g-hit" tabindex="0" role="img" aria-label="' + BIB[i].lo + " to " + BIB[i].hi + ", " + BIB[i].name + '" data-tipk="bib-' + i + '" d="' + arc(bcut[i] + 0.2, Math.min(100, bcut[i + 1]) - 0.2, 161) + '" fill="none" stroke="transparent" stroke-width="58" pointer-events="stroke"/>';
    });
    $("bi-bands").innerHTML = bh; $("bi-hits").innerHTML = bhits;
    $("bi-track").setAttribute("d", arc(0, 100, R)); $("bi-prog").setAttribute("d", arc(0, 100, R));
    var bt = "";
    [25, 50, 75].forEach(function (v, i) { var p = pt(v, RL); bt += '<text class="g-hit" data-tipk="bib-' + (i + 1) + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="var(--muted)" font-size="12" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono, monospace">' + v + "</text>"; });
    $("bi-ticks").innerHTML = bt;
  })();

  // ---------- data ----------
  // The daily task's readings (data.json): used for the LookIntoBitcoin lines after recent.json, ETF flows and USDT dominance,
  // and as a fallback when the live sources cannot be reached.
  function loadData() {
    return fetch("data.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("data " + r.status); return r.json(); }).then(function (d) {
      if (!d || !Array.isArray(d.days) || !d.days.length) throw new Error("empty");
      d.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      S.data = d; S.recs = d.days;
      srcOk("task", d.days[d.days.length - 1].date);
      rebuild();
    }).catch(function () { srcFail("task"); if (!S.latest) { $("hdr-sub").textContent = "Could not load the daily readings. Retrying…"; } });
  }
  function J(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  // Coin Metrics sometimes holds a request for 40 s or more. If no answer comes in `gap` ms, send the
  // same request again (page_size changed by one so the URL differs) and use the first answer that arrives.
  function hedged(u, tries, gap) {
    return new Promise(function (res, rej) {
      var done = false, started = 0, fails = 0, ctl = [];
      function go() {
        if (done || started >= tries) return;
        var i = started++, c = window.AbortController ? new AbortController() : null; ctl.push(c);
        var ui = i ? u.replace(/page_size=(\d+)/, function (m, n) { return "page_size=" + (+n - i); }) : u;
        fetch(ui, { cache: "no-store", signal: c ? c.signal : undefined }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (j) { if (done) return; done = true; ctl.forEach(function (x) { if (x && x !== c) try { x.abort(); } catch (e) { } }); res(j); })
          .catch(function (e) { if (done) return; fails++; if (fails >= tries) { done = true; rej(e); } else if (fails >= started) go(); });
        if (started < tries) setTimeout(function () { if (started === i + 1) go(); }, gap);
      }
      go();
    });
  }
  function utcToday() { return new Date().toISOString().slice(0, 10); }
  S.src = {};
  function srcOk(k, asOf) { S.src[k] = { ok: true, asOf: asOf, at: Date.now() }; }
  function srcFail(k) { if (!S.src[k] || !S.src[k].ok) S.src[k] = { ok: false, at: Date.now() }; }

  // ---------- live sources, pulled each time the page opens ----------
  // Coin Metrics community data: price (daily close, UTC), MVRV, miner income, hash rate.
  function fetchCM() {
    var url = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD,CapMVRVCur,IssTotUSD,HashRate&frequency=1d&start_time=2013-06-01&page_size=10000", rows = [];
    function step(u) {
      return hedged(u, 3, 7000).then(function (j) { rows = rows.concat(j.data || []); return j.next_page_url ? step(j.next_page_url) : null; });
    }
    return step(url).then(function () {
      rows = rows.filter(function (x) { return x.PriceUSD && x.CapMVRVCur; });
      if (rows.length < 2000) throw new Error("short");
      S.cm = rows.map(function (x) { return [x.time.slice(0, 10), +x.PriceUSD, +x.CapMVRVCur]; });
      S.cmIdx = {}; S.cm.forEach(function (x, i) { S.cmIdx[x[0]] = i; });
      S.cmX = { iss: rows.map(function (x) { return x.IssTotUSD == null ? null : +x.IssTotUSD; }), hr: rows.map(function (x) { return x.HashRate == null ? null : +x.HashRate; }) };
      S.cycCache = {}; S.cmPreC = null; S.pastD = {};
      srcOk("cm", S.cm[S.cm.length - 1][0]);
    }).catch(function () { srcFail("cm"); }).then(function () { rebuild(); renderP2S(); });
  }
  // Fear & Greed (alternative.me), full daily history
  function fetchFng() {
    return J("https://api.alternative.me/fng/?limit=0&format=json").then(function (j) {
      var m = {}; (j.data || []).forEach(function (x) { m[new Date(+x.timestamp * 1000).toISOString().slice(0, 10)] = +x.value; });
      var ks = Object.keys(m).sort(); if (!ks.length) throw new Error("empty");
      S.fng = m; S.fngK = ks; srcOk("fng", ks[ks.length - 1]);
    }).catch(function () { srcFail("fng"); }).then(rebuild);
  }
  function fg7(d) {
    if (!S.fng) return null; var s = 0, n = 0;
    for (var i = 0; i < 7; i++) { var v = S.fng[addDays(d, -i)]; if (v != null) { s += v; n++; } }
    return n >= 4 ? s / n : null;
  }
  function fg7Latest() { if (!S.fngK) return null; var a = S.fngK.slice(-7).map(function (k) { return S.fng[k]; }); return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  // Funding rate and open interest (Bybit BTCUSDT perpetual), back to 100 days before the top
  function fetchLev() {
    var since = dnum(addDays(NOWC.top, -100)), fund = [], oi = [];
    function fstep(end, n) {
      return J("https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200" + (end ? "&endTime=" + end : "")).then(function (j) {
        var l = (j.result && j.result.list) || []; if (!l.length) return;
        l.forEach(function (x) { fund.push([+x.fundingRateTimestamp, +x.fundingRate]); });
        var oldest = Math.min.apply(null, l.map(function (x) { return +x.fundingRateTimestamp; }));
        if (oldest > since && n < 12) return fstep(oldest - 1, n + 1);
      });
    }
    function ostep(cur, n) {
      return J("https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=200" + (cur ? "&cursor=" + encodeURIComponent(cur) : "")).then(function (j) {
        var l = (j.result && j.result.list) || []; if (!l.length) return;
        l.forEach(function (x) { oi.push([+x.timestamp, +x.openInterest]); });
        var oldest = Math.min.apply(null, l.map(function (x) { return +x.timestamp; }));
        if (oldest > since && j.result.nextPageCursor && n < 6) return ostep(j.result.nextPageCursor, n + 1);
      });
    }
    function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x[0]]) return false; s[x[0]] = 1; return true; }).sort(function (x, y) { return x[0] - y[0]; }); }
    return Promise.all([fstep(null, 0), ostep(null, 0)]).then(function () {
      if (!fund.length && !oi.length) throw new Error("empty");
      S.fund = uniq(fund); S.oi = uniq(oi); srcOk("lev", Date.now());
    }).catch(function () { srcFail("lev"); }).then(rebuild);
  }
  // funding7d: average rate over the 7 days to `end`, as % a year; oiDrawdown: % below the 90-day high of daily open interest
  function levAt(end) {
    var res = { f: null, o: null }, f = S.fund, o = S.oi, i, s = 0, n = 0;
    if (f) { for (i = f.length - 1; i >= 0; i--) { if (f[i][0] > end) continue; if (f[i][0] <= end - 7 * 864e5) break; s += f[i][1]; n++; } if (n >= 12) res.f = s / n * 3 * 365 * 100; }
    if (o) { var b = []; for (i = o.length - 1; i >= 0 && b.length < 90; i--) if (o[i][0] <= end) b.push(o[i][1]); if (b.length >= 30) { var mx = Math.max.apply(null, b); res.o = (mx - b[0]) / mx * 100; } }
    return res.f == null && res.o == null ? null : res;
  }
  // Stablecoin supply (DefiLlama)
  function fetchStable() {
    return J("https://stablecoins.llama.fi/stablecoincharts/all").then(function (a) {
      var m = {}; a.forEach(function (r) { var v = r.totalCirculatingUSD && r.totalCirculatingUSD.peggedUSD; if (v) m[new Date(+r.date * 1000).toISOString().slice(0, 10)] = v; });
      var ks = Object.keys(m).sort(); if (ks.length < 40) throw new Error("short");
      S.stable = m; S.stableK = ks; srcOk("stable", ks[ks.length - 1]);
    }).catch(function () { srcFail("stable"); }).then(rebuild);
  }
  function stable30() { if (!S.stableK) return null; var k = S.stableK, a = S.stable[k[k.length - 1]], b = S.stable[addDays(k[k.length - 1], -30)]; return a && b ? (a / b - 1) * 100 : null; }
  // Coinbase premium: Coinbase BTC/USD against Binance BTC/USDT (Bybit if Binance fails), in %
  function fetchPremium() {
    var other = J("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT").then(function (j) { return +j.price; })
      .catch(function () { return J("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT").then(function (j) { return +j.result.list[0].lastPrice; }); });
    return Promise.all([J("https://api.exchange.coinbase.com/products/BTC-USD/ticker").then(function (j) { return +j.price; }), other]).then(function (r) {
      if (!(r[0] > 0 && r[1] > 0)) throw new Error("bad");
      S.cbp = (r[0] / r[1] - 1) * 100; srcOk("cbp", Date.now());
    }).catch(function () { srcFail("cbp"); }).then(rebuild);
  }
  // LookIntoBitcoin lines for this cycle (recent.json, built from the source charts), then the daily task's readings
  function loadRecent() {
    return J("recent.json?v=4").then(function (j) { S.recent = j; }).catch(function () { S.recent = null; }).then(rebuild);
  }
  function libMap() {
    var m = {};
    if (S.recent) S.recent.rows.forEach(function (r) { m[r[0]] = { sthP: r[1], lthP: r[2], cvddP: r[3], balP: r[4], loss: r[5], sopr: r[6], rr: r[7], pL: r[8] }; });
    // a reading taken at about 07:00 Canberra time holds the LookIntoBitcoin values of two UTC days before
    (S.recs || []).forEach(function (x) {
      var k = addDays(x.date, -2), f = x.ref || {}, w = x.raw || {};
      if (m[k] || !f.sthPrice) return;
      m[k] = { sthP: f.sthPrice, lthP: f.lthPrice, cvddP: f.cvddPrice, balP: f.balancedPrice, loss: w.addrLoss, sopr: w.sopr7d, rr: w.reserveRisk, pL: w.sth ? w.sth * f.sthPrice : null };
    });
    return m;
  }

  // ---------- daily rows for this cycle, worked out in the browser from the sources ----------
  // Same fields as history.json rows. Price-linked fields are ratios to the day's close. lo = the day's intraday low.
  var PRICE_F = ["cvdd", "mvrv", "lth", "bal", "w200", "mayer", "sth", "puell", "rr"];
  function cmPre() {
    if (S.cmPreC && S.cmPreC.n === S.cm.length) return S.cmPreC;
    var cm = S.cm, n = cm.length, P = cm.map(function (x) { return x[1]; }), iss = S.cmX.iss.slice(), hr = S.cmX.hr.slice(), i, j;
    for (i = 1; i < n; i++) { if (iss[i] == null) iss[i] = iss[i - 1]; if (hr[i] == null) hr[i] = hr[i - 1]; }
    function pref(a) { var s = [0]; for (var k = 0; k < a.length; k++) s.push(s[k] + (a[k] || 0)); return s; }
    var sp = pref(P), si = pref(iss), sh = pref(hr);
    function avg(s, k, w) { return k - w + 1 < 0 ? null : (s[k + 1] - s[k - w + 1]) / w; }
    // 150-day EMA started on 1 Jan 2019 (as the daily task), and one started at the first day (for past cycles);
    // all-time high close; hash ribbons
    var ema = [], emaAll = [], e = null, e2 = null, kf = 2 / 151, ath = 0, athD = null, cap = 0, lastRec = null, hc = [], rec = [], athA = [];
    for (j = 0; j < n; j++) {
      if (cm[j][0] >= "2019-01-01") { e = e == null ? P[j] : P[j] * kf + e * (1 - kf); } ema.push(e);
      e2 = e2 == null ? P[j] : P[j] * kf + e2 * (1 - kf); emaAll.push(j >= 150 ? e2 : null);
      if (P[j] > ath) { ath = P[j]; athD = cm[j][0]; } athA.push([ath, athD]);
      if (j >= 60) { var a30 = avg(sh, j, 30), a60 = avg(sh, j, 60); if (a30 < a60) cap++; else { if (cap >= 7) lastRec = cm[j][0]; cap = 0; } hc.push(a30 < a60 ? 1 : 0); } else hc.push(null);
      rec.push(lastRec);
    }
    S.cmPreC = { n: n, P: P, iss: iss, hr: hr, sp: sp, si: si, sh: sh, avg: avg, ema: ema, emaAll: emaAll, athA: athA, hc: hc, rec: rec };
    return S.cmPreC;
  }
  function buildRows() {
    if (!S.cm || !S.cmX) return null;
    var X = cmPre(), cm = S.cm, n = X.n, P = X.P, iss = X.iss, sp = X.sp, si = X.si, avg = X.avg, ema = X.ema, athA = X.athA, hc = X.hc, rec = X.rec;
    if (S.cmIdx[NOWC.top] == null) return null;
    var lib = libMap(), today = utcToday(), rows = [], carry = {}, lowRun = null, lowD = null;
    for (var d = addDays(NOWC.top, -45); d <= today; d = addDays(d, 1)) {
      var L = lib[d]; if (L) for (var f in L) if (L[f] != null) carry[f] = { v: L[f], d: d };
      if (d < NOWC.top) continue;
      var ci = S.cmIdx[d], est = ci == null, jj = est ? n - 1 : ci, o = S.ohlc && S.ohlc[d], live = d === today;
      var p = !est ? P[ci] : live ? (liveP() || (o && o.c)) : (o && o.c);
      if (!p) continue;
      var k = p / P[jj], s1400 = avg(sp, jj, 1400), s200 = avg(sp, jj, 200), s471 = avg(sp, jj, 471), i365 = avg(si, jj, 365);
      var cv = function (x) { return carry[x] ? carry[x].v : null; };
      var r = { d: d, p: p, dly: true, est: est, live: live, v: {}, vl: {} };
      r.mvrv = cm[jj][2] * k;
      r.w200 = s1400 ? p / s1400 : null; r.mayer = s200 ? p / s200 : null;
      r.pi = ema[jj] && s471 ? ema[jj] / (0.745 * s471) : null;
      r.puell = i365 ? iss[jj] / i365 * k : null;
      r.hcap = hc[jj]; r.dsr = rec[jj] ? daysBetween(rec[jj], d) : null;
      r.ath = athA[jj][0]; r.athD = athA[jj][1]; r.dsp = daysBetween(athA[jj][1], d);
      var sthP = cv("sthP"), lthP = cv("lthP"), cvddP = cv("cvddP"), balP = cv("balP"), rr = cv("rr"), pL = cv("pL");
      r.sth = sthP ? p / sthP : null; r.lth = lthP ? p / lthP : null; r.cvdd = cvddP ? p / cvddP : null; r.bal = balP ? p / balP : null;
      r.loss = cv("loss"); r.sopr = cv("sopr"); r.rr = rr != null && pL ? rr * p / pL : null; r.sthP = sthP;
      r.libD = carry.sthP ? carry.sthP.d : null;
      r.fg = fg7(d);
      var lv = levAt(live ? Date.now() : dnum(addDays(d, 1))); r.fund = lv ? lv.f : null; r.oidd = lv ? lv.o : null;
      r.lo = o && o.l ? Math.min(o.l, p) : p;
      if (lowRun == null || r.lo < lowRun) { lowRun = r.lo; lowD = d; }
      r.low = lowRun; r.dsl = daysBetween(lowD, d);
      rows.push(r);
    }
    return rows.length ? rows : null;
  }
  // move the live row (today, UTC) to the live price
  function updLive(P) {
    var dr = S.dr; if (!dr || !P) return;
    var r = dr[dr.length - 1]; if (!r.live) return;
    var k = P / r.p; PRICE_F.forEach(function (f) { if (r[f] != null) r[f] *= k; });
    r.p = P; if (P < r.lo) r.lo = P;
    var pv = dr[dr.length - 2];
    if (pv && pv.low <= r.lo) { r.low = pv.low; r.dsl = pv.dsl + 1; } else { r.low = r.lo; r.dsl = 0; }
    r.v = {}; r.vl = {};
    var lv = levAt(Date.now()); if (lv) { r.fund = lv.f; r.oidd = lv.o; }
  }
  function rowDoc(o) {
    return { date: o.d, price: o.p, raw: rowRaw(o), row: o,
      ref: { realizedPrice: o.mvrv ? o.p / o.mvrv : null, lthPrice: o.lth ? o.p / o.lth : null, cvddPrice: o.cvdd ? o.p / o.cvdd : null, balancedPrice: o.bal ? o.p / o.bal : null, sthPrice: o.sth ? o.p / o.sth : null, sma1400: o.w200 ? o.p / o.w200 : null, sma200: o.mayer ? o.p / o.mayer : null } };
  }
  // a daily-task reading with its price-linked signals moved to the price it recorded
  function recDoc(x) { return { date: x.date, price: x.price, raw: liveRaw(x, x.price), ref: x.ref || {}, confirm: x.confirm || {}, rec: x }; }
  function lastRec() { return S.recs && S.recs.length ? S.recs[S.recs.length - 1] : null; }
  function confirmNow() {
    var rc = (lastRec() || {}).confirm || {}, s30 = stable30();
    return { etf10d: rc.etf10d, usdtd30d: rc.usdtd30d, cbPremium: S.cbp != null ? S.cbp : rc.cbPremium, stable30d: s30 != null ? s30 : rc.stable30d };
  }
  function setLatest() {
    var dr = S.dr;
    if (dr && dr.length > 1) {
      var bi = dr[dr.length - 1].live ? dr.length - 2 : dr.length - 1, base = dr[bi];
      var doc = rowDoc(base), r = doc.raw;
      var fgl = fg7Latest(); if (fgl != null) r.fg7d = fgl;
      var lv = levAt(Date.now()); if (lv) { r.funding7d = lv.f; r.oiDrawdown = lv.o; }
      r.daysSincePeak = daysBetween(base.athD, todayCbr());
      doc.date = todayCbr(); doc.closeDate = base.d; doc.confirm = confirmNow(); doc.live = true;
      S.latest = doc; S.prev = bi > 0 ? rowDoc(dr[bi - 1]) : null; S.base = base; S.mode = "live";
    } else if (S.recs && S.recs.length) {
      var rs = S.recs; S.latest = recDoc(rs[rs.length - 1]); S.prev = rs.length > 1 ? recDoc(rs[rs.length - 2]) : null; S.base = null; S.mode = "daily";
      S.latest.confirm = confirmNow();
    }
  }
  function mergeHist() {
    if (!S.histW) return;
    var rows = S.histW.filter(function (o) { return !(S.dr && o.d >= NOWC.top); });
    if (S.dr) rows = rows.concat(S.dr);
    S.hist = { rows: rows };
    // Bottom in for each cycle window (top to top + 900 days), with the running value peak as the gate
    CYCLES.forEach(function (c) {
      var end = addDays(c.top, 900), vm = null;
      rows.forEach(function (o) {
        if (o.d < c.top || o.d > end) return;
        var v = histVal(o, "adj"); if (v != null) vm = vm == null ? v : Math.max(vm, v);
        var bc = biComps({ p: o.p, low: o.low, dsl: o.dsl, sth: o.sth, mayer: o.mayer, sopr: o.sopr, hcap: o.hcap === 1, recAfterLow: o.hcap === 1 ? null : o.dsr == null ? null : o.dsr <= o.dsl + 30, flows: null });
        o.bi = bc.raw == null ? null : bc.raw * gateOf(vm); o.vmax = vm;
      });
    });
  }
  var rbT = null;
  function rebuild() { clearTimeout(rbT); rbT = setTimeout(rebuildNow, 60); }
  function rebuildNow() {
    try { S.dr = buildRows(); } catch (e) { S.dr = null; if (window.console) console.error(e); }
    if (S.dr) updLive(liveP());
    mergeHist(); setLatest();
    if (S.latest) renderAll();
  }
  var FEEDS = [
    { n: "Bybit", f: function () { return J("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT").then(function (j) { var t = j.result.list[0]; return { p: +t.lastPrice, chg: +t.price24hPcnt * 100, hi: +t.highPrice24h, lo: +t.lowPrice24h, pair: "BTC / USDT" }; }); } },
    { n: "Coinbase", f: function () { return J("https://api.exchange.coinbase.com/products/BTC-USD/stats").then(function (t) { return { p: +t.last, chg: (t.last / t.open - 1) * 100, hi: +t.high, lo: +t.low, pair: "BTC / USD" }; }); } },
    { n: "Kraken", f: function () { return J("https://api.kraken.com/0/public/Ticker?pair=XBTUSD").then(function (j) { var t = j.result[Object.keys(j.result)[0]]; return { p: +t.c[0], chg: null, hi: +t.h[1], lo: +t.l[1], pair: "BTC / USD" }; }); } },
    { n: "OKX", f: function () { return J("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT").then(function (j) { var t = j.data[0]; return { p: +t.last, chg: (t.last / t.open24h - 1) * 100, hi: +t.high24h, lo: +t.low24h, pair: "BTC / USDT" }; }); } }
  ];
  var feedIdx = 0;
  function fetchPrice() {
    var tries = 0;
    function attempt() {
      var feed = FEEDS[feedIdx];
      return feed.f().then(function (q) {
        if (!(q.p > 0)) throw new Error("bad");
        q.src = feed.n; S.live = q; S.liveAt = Date.now(); S.lastOk = Date.now();
        renderLive();
      }).catch(function () {
        tries++; feedIdx = (feedIdx + 1) % FEEDS.length;
        if (tries < FEEDS.length) return attempt();
        srcFail("price"); renderLiveAge();
      });
    }
    return attempt();
  }
  function fetchHourly() {
    return J("https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=25").then(function (j) {
      S.hourly = j.result.list.map(function (k) { return +k[4]; }).reverse();
    }).catch(function () {
      return J("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600").then(function (a) { S.hourly = a.slice(0, 25).map(function (k) { return +k[4]; }).reverse(); });
    }).catch(function () {}).then(renderSpark);
  }
  // Daily candles (UTC days): close and intraday low. Bybit BTC/USDT spot, Coinbase BTC/USD if Bybit fails.
  function fetchDaily() {
    return J("https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=D&limit=1000").then(function (j) {
      var m = {}, o = {}; j.result.list.forEach(function (k) { var d = new Date(+k[0]).toISOString().slice(0, 10); m[d] = +k[4]; o[d] = { h: +k[2], l: +k[3], c: +k[4] }; });
      S.daily = m; S.ohlc = o; S.ohlcSrc = "Bybit"; srcOk("ohlc", Date.now());
    }).catch(function () {
      return J("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400").then(function (a) {
        var m = {}, o = {}; a.forEach(function (k) { var d = new Date(k[0] * 1000).toISOString().slice(0, 10); m[d] = +k[4]; o[d] = { h: +k[2], l: +k[1], c: +k[4] }; });
        S.daily = m; S.ohlc = o; S.ohlcSrc = "Coinbase"; srcOk("ohlc", Date.now());
      });
    }).catch(function () { srcFail("ohlc"); }).then(rebuild);
  }
  function fetchCbbi() {
    return J("https://colintalkscrypto.com/cbbi/data/latest.json").then(function (j) {
      var ts = Object.keys(j.Confidence).map(Number).sort(function (a, b) { return a - b; });
      var t = ts[ts.length - 1], comp = {};
      ["PiCycle", "RUPL", "RHODL", "Puell", "2YMA", "Trolololo", "MVRV", "ReserveRisk", "Woobull"].forEach(function (k) { if (j[k] && j[k][t] != null) comp[k] = +j[k][t]; });
      var t30 = ts.filter(function (x) { return x <= t - 30 * 86400; }).pop();
      S.cbbi = { v: +j.Confidence[t] * 100, asOf: new Date(t * 1000).toISOString().slice(0, 10), comp: comp, v30: t30 != null ? +j.Confidence[t30] * 100 : null };
      renderCbbi();
    }).catch(function () {
      if (!S.cbbi) { $("cbbi-comp").innerHTML = '<span class="sub">CBBI data not available right now.</span>'; }
    });
  }

  // ---------- render ----------
  function liveP() { return S.live && Date.now() - S.liveAt < 5 * 60e3 ? S.live.p : null; }
  function scoreAt(P) { return parts(S.latest, liveRaw(S.latest, P)).total; }
  // value score parts at the last daily close (live mode) or the last daily-task reading
  function closeParts() { return S.mode === "live" && S.base ? histParts(S.base) : parts(S.latest); }

  function renderAll() {
    if (!S.latest) return;
    renderHeader(); renderLive(); renderSpark(); renderHistory(); renderSignals(); renderP2S(); renderTabs();
  }
  // data status: when each source last updated
  var SRC = [
    { k: "price", n: "Price", live: true }, { k: "ohlc", n: "Highs/lows", live: true }, { k: "cm", n: "Coin Metrics", max: 2 },
    { k: "lib", n: "LookIntoBitcoin", max: 3 }, { k: "fng", n: "Fear & Greed", max: 2 }, { k: "lev", n: "Funding & OI", live: true },
    { k: "stable", n: "Stablecoins", max: 2 }, { k: "cbp", n: "Coinbase premium", live: true }, { k: "task", n: "ETF & USDT.D", max: 2 }
  ];
  function srcState(s) {
    var o = s.k === "price" ? (S.lastOk ? { ok: Date.now() - S.lastOk < 120e3, asOf: S.lastOk } : S.src.price) : s.k === "lib" ? libState() : S.src[s.k];
    if (!o) return { cls: "wait", txt: "loading" };
    if (!o.ok) return { cls: "bad", txt: "not reached" };
    if (s.live || typeof o.asOf === "number") return { cls: "ok", txt: "live" };
    var age = daysBetween(o.asOf, utcToday());
    return { cls: age <= (s.max || 2) ? "ok" : "old", txt: fd(o.asOf) };
  }
  function libState() { var b = S.base; if (b && b.libD) return { ok: true, asOf: b.libD }; var r = lastRec(); return r ? { ok: true, asOf: addDays(r.date, -2) } : null; }
  function renderHeader() {
    $("hdr-sub").textContent = "Public view · indicators only · " + (S.mode === "live" ? "live data, worked out in your browser" : !S.src.cm ? "loading live data…" : "daily readings from " + fd(S.latest.date) + (S.latest.rec && S.latest.rec.asOf ? ", " + S.latest.rec.asOf : ""));
    var bad = 0, old = 0, h = "";
    SRC.forEach(function (s) {
      var st = srcState(s); if (st.cls === "bad") bad++; if (st.cls === "old") old++;
      h += '<span class="src ' + st.cls + '"><i></i>' + esc(s.n) + ' <b>' + esc(st.txt) + "</b></span>";
    });
    var xc = xCheck();
    if (xc) h += '<span class="src bad tip" tabindex="0" data-tipk="xchk"><i></i>Price check <b>' + xc.g.toFixed(1) + "% gap " + fd(xc.d) + "</b></span>";
    $("src-line").innerHTML = '<span class="tip src-h" tabindex="0" data-tipk="src">Data</span>' + h;
    var dot = $("fresh-dot"), t = $("fresh-t");
    if (S.mode !== "live" && !S.src.cm) { dot.style.background = "#E0A23C"; t.textContent = "Loading live data…"; }
    else if (xc) { dot.style.background = "#E0A23C"; t.textContent = "Live data · price feeds disagree"; }
    else if (S.mode !== "live") { dot.style.background = "var(--down)"; t.textContent = "Live sources not reached · daily readings"; }
    else if (bad || old) { dot.style.background = "#E0A23C"; t.textContent = "Live data · " + (bad + old) + " source" + (bad + old > 1 ? "s" : "") + " late"; }
    else { dot.style.background = "var(--up)"; t.textContent = "Live data up to date"; }
  }
  var shownScore = null;
  function animateNum(el, from, to) {
    if (from == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = Math.round(to); return; }
    var t0 = performance.now(), dur = 700;
    function step(t) { var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function renderLive() {
    renderPriceBar();
    if (!S.latest) return;
    if (S.dr) updLive(liveP());
    renderHeader();
    var d = S.latest, P = liveP();
    var daily = closeParts().total, liveS = P ? scoreAt(P) : daily, isLive = !!P;
    var v = Math.max(0, Math.min(100, liveS));
    $("g-prog").setAttribute("stroke-dashoffset", (100 - v).toFixed(2));
    $("g-prog").setAttribute("stroke", "var(--b" + Math.max(0, bandIdx(liveS)) + ")");
    $("g-live").style.transform = "rotate(" + (v * 1.8).toFixed(2) + "deg)";
    $("g-daily").style.transform = "rotate(" + (Math.max(0, Math.min(100, daily)) * 1.8).toFixed(2) + "deg)";
    animateNum($("g-num"), shownScore, liveS); shownScore = liveS;
    var dl = S.mode === "live" ? "Close " + fd(d.closeDate) : "Daily reading";
    $("g-band").textContent = bandName(liveS) + (isLive ? " · live" : " · " + dl.toLowerCase());
    $("g-svg").setAttribute("aria-label", "Live score " + Math.round(liveS) + " of 100, " + bandName(liveS) + ". " + dl + " " + Math.round(daily) + ", " + bandName(daily) + ".");
    $("lg-live").textContent = isLive ? "Live " + Math.round(liveS) + " · price now" : "Live price not available";
    $("lg-daily").textContent = dl + " " + Math.round(daily) + " · " + bandName(daily);
    renderChips(liveS, daily, isLive);
    renderNext(liveS, P || d.price);
    renderValRc(P);
    renderWin();
    renderMoved(P);
    renderTitle(liveS, P);
    renderSigLive(P);
    renderP2S();
    renderBI(); renderClocks(); renderVerdict();
    if (S.tab === "cyc") renderCyc();
  }
  function renderPriceBar() {
    var q = S.live; if (!q) return;
    $("p").textContent = usd(q.p);
    $("p-src").textContent = q.pair + " · " + q.src + " · live";
    var c = $("p-chg");
    if (q.chg != null && isFinite(q.chg)) {
      var up = q.chg >= 0;
      c.textContent = (up ? "▲ " : "▼ ") + Math.abs(q.chg).toFixed(1) + "% in 24h";
      c.style.color = up ? "var(--up)" : "var(--down)";
      c.style.background = "color-mix(in srgb, " + (up ? "var(--up)" : "var(--down)") + " 15%, transparent)";
    } else c.textContent = "";
    $("p-lo").textContent = "24h low " + usd(q.lo); $("p-hi").textContent = "high " + usd(q.hi);
    var dot = $("live-dot"); dot.classList.remove("beat"); void dot.offsetWidth; dot.classList.add("beat");
    renderLiveAge(); renderSpark();
  }
  function renderLiveAge() {
    var el = $("live"), t = $("live-t");
    if (!S.lastOk) { t.textContent = "Connecting to price feeds…"; return; }
    var s = Math.round((Date.now() - S.lastOk) / 1000), stale = s > 120;
    el.classList.toggle("stale", stale);
    t.textContent = (stale ? "Price feed lost · last " : "Live · updated ") + (s < 60 ? s + " s ago" : Math.round(s / 60) + " min ago");
  }
  function renderSpark() {
    var a = (S.hourly || []).slice(); if (S.live) a.push(S.live.p);
    if (a.length < 2) return;
    var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), span = mx - mn || 1;
    var pts = a.map(function (v, i) { return (i / (a.length - 1) * 200).toFixed(1) + "," + (38 - (v - mn) / span * 36).toFixed(1); }).join(" ");
    var el = $("spark"); el.setAttribute("points", pts);
    el.setAttribute("stroke", a[a.length - 1] >= a[0] ? "var(--up)" : "var(--down)");
    $("spark-svg").setAttribute("aria-label", "Price over the last 24 hours, from " + usd(a[0]) + " to " + usd(a[a.length - 1]));
  }
  // value score at the daily close on or before a date (daily rows this cycle, weekly before; daily-task readings as a fallback)
  function scoreOnOrBefore(date) {
    var best = null;
    if (S.hist) S.hist.rows.forEach(function (o) { if (!o.live && o.d <= date) best = o; });
    if (best && daysBetween(best.d, date) <= 7) { var s = histVal(best); if (s != null) return { s: s, date: best.d }; }
    var rb = null; (S.recs || []).forEach(function (x) { if (x.date <= date) rb = x; });
    return rb && daysBetween(rb.date, date) <= 3 ? { s: parts(recDoc(rb)).total, date: rb.date } : null;
  }
  function chip(k, v, tk) { return '<span class="chip tip" tabindex="0" data-tipk="' + tk + '"><span class="k">' + esc(k) + '</span><span class="v" style="color:' + (v >= 0 ? "var(--up)" : "var(--down)") + '">' + sgn(v) + "</span></span>"; }
  function renderChips(liveS, daily, isLive) {
    var h = "", d = S.latest, ref = S.mode === "live" ? d.closeDate : d.date;
    if (isLive) h += chip(S.mode === "live" ? "Live vs close" : "Live vs daily", Math.round(liveS) - Math.round(daily), "chip-live");
    if (S.prev) h += chip("Since " + fd(S.prev.date), Math.round(daily) - Math.round(parts(S.prev).total), "chip-prev");
    var w7 = scoreOnOrBefore(addDays(ref, -7)); if (w7) h += chip("7 days", Math.round(daily) - Math.round(w7.s), "chip-7");
    var w30 = scoreOnOrBefore(addDays(ref, -30)); if (w30) h += chip("30 days", Math.round(daily) - Math.round(w30.s), "chip-30");
    $("chips").innerHTML = h;
  }
  function findPrice(P0, target, dir) {
    for (var i = 1; i <= 240; i++) {
      var P = P0 * (1 + dir * i * 0.0025), s = scoreAt(P);
      if (dir < 0 && s >= target) return P;
      if (dir > 0 && s < target) return P;
    }
    return null;
  }
  function renderNext(liveS, P0) {
    var i = bandIdx(liveS), h = "";
    if (i < 5) {
      var target = CUTS[i + 1], P = findPrice(P0, target, -1);
      if (P) h += '<span><strong style="font-weight:650">Next band</strong> ' + bandName(target) + " (" + target + ') at <span class="mono" style="font-weight:600">' + usd(Math.round(P / 50) * 50) + '</span> <span class="muted mono">−' + Math.abs((P / P0 - 1) * 100).toFixed(1) + "%</span> " + qi("next", "the next band") + "</span>";
      else h += '<span><strong style="font-weight:650">Next band</strong> ' + bandName(target) + " (" + target + ") needs more than a lower price " + qi("next", "the next band") + "</span>";
    } else h += '<span><strong style="font-weight:650">Top band:</strong> Extreme value</span>';
    if (i > 0) {
      var lo = CUTS[i], Pu = findPrice(P0, lo, 1);
      if (Pu) h += '<span class="s">Below ' + lo + " above " + usd(Math.round(Pu / 50) * 50) + "</span>";
    }
    $("next").innerHTML = h;
  }
  function moveRows(pa, pb, sw) {
    var rows = IND.map(function (d) { var a = pa.p[d.k], b = pb.p[d.k]; return { k: d.k, n: d.name, v: (a == null || b == null) ? 0 : (b - a) * d.w / sw }; })
      .filter(function (r) { return Math.abs(r.v) >= 0.05; }).sort(function (x, y) { return Math.abs(y.v) - Math.abs(x.v); }).slice(0, 5);
    var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v); }).concat([0.5]));
    return rows.map(function (r) {
      var w = Math.abs(r.v) / mx * 100, col = r.v >= 0 ? "var(--accent)" : "var(--down)";
      return '<div class="mv-r"><span class="n"><span class="tip" tabindex="0" data-tipk="ind-' + r.k + '">' + esc(r.n) + '</span></span><span class="bar"><i style="width:' + w.toFixed(0) + "%;background:" + col + '"></i></span><span class="v">' + sgn(r.v, 1) + "</span></div>";
    }).join("") || '<div class="muted" style="font-size:14px">No change worth showing.</div>';
  }
  function mvHead(label, v) { return '<div class="mv-h"><span class="eyebrow">' + esc(label) + '</span><span class="mono" style="font-weight:600;color:' + (v >= 0 ? "var(--up)" : "var(--down)") + '">' + sgn(v) + "</span></div>"; }
  function renderMoved(P) {
    var d = S.latest, pd = closeParts();
    if (P) {
      var pl = parts(d, liveRaw(d, P));
      $("mv-live").innerHTML = mvHead(S.mode === "live" ? "Live price vs close " + fd(d.closeDate) : "Live price vs daily reading", Math.round(pl.total) - Math.round(pd.total)) + moveRows(pd, pl, pl.sw);
      $("mv-live").style.display = "";
    } else $("mv-live").style.display = "none";
    if (S.prev) {
      var pp = parts(S.prev);
      $("mv-day").innerHTML = mvHead((S.mode === "live" ? "Close " + fd(S.prev.date) + " to " + fd(d.closeDate) : "Since " + fd(S.prev.date)) + " (" + Math.round(pp.total) + " to " + Math.round(pd.total) + ")", Math.round(pd.total) - Math.round(pp.total)) + moveRows(pp, pd, pd.sw);
    } else $("mv-day").innerHTML = "";
  }
  var lastIcon = "";
  function renderTitle(s, P) {
    document.title = Math.round(s) + " " + bandName(s) + (P ? " · " + usd(P) : "") + " | BTC Value Monitor";
    var col = css("--b" + Math.max(0, bandIdx(s))), key = Math.round(s) + col;
    if (key === lastIcon) return; lastIcon = key;
    try {
      var c = document.createElement("canvas"); c.width = c.height = 64; var x = c.getContext("2d");
      x.fillStyle = col; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
      x.fillStyle = txtOn(col); x.font = "bold 34px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(Math.round(s)), 32, 34);
      $("favicon").href = c.toDataURL("image/png");
    } catch (e) {}
  }

  // CBBI
  function cbbiZone(v) { return v < 20 ? "Bottom zone" : v < 40 ? "Low" : v < 60 ? "Middle" : v < 80 ? "High" : "Top zone"; }
  function cbbiColIdx(v) { return v < 20 ? 5 : v < 40 ? 4 : v < 60 ? 2 : v < 80 ? 1 : 0; }
  function renderCbbi() {
    var c = S.cbbi; if (!c) return;
    var v = Math.max(0, Math.min(100, c.v));
    $("cbbi-arc").setAttribute("stroke-dashoffset", (100 - v).toFixed(2));
    $("cbbi-arc").setAttribute("stroke", "var(--b" + cbbiColIdx(v) + ")");
    $("cbbi-num").textContent = Math.round(v);
    $("cbbi-zone").textContent = cbbiZone(v) + " · " + fd(c.asOf);
    $("cbbi-svg").setAttribute("aria-label", "CBBI " + Math.round(v) + " of 100, " + cbbiZone(v) + ", as of " + fd(c.asOf));
    var names = { PiCycle: "Pi Cycle", RUPL: "RUPL / NUPL", RHODL: "RHODL", Puell: "Puell", "2YMA": "2-year MA", Trolololo: "Log trend", MVRV: "MVRV Z", ReserveRisk: "Reserve risk", Woobull: "Woobull" };
    var h = Object.keys(c.comp).map(function (k) {
      var x = Math.max(0, Math.min(100, c.comp[k] * 100));
      return '<div class="cbbi-r"><span class="n"><span class="tip" tabindex="0" data-tipk="cb-' + k + '">' + esc(names[k] || k) + '</span></span><span class="bar"><i style="width:' + x.toFixed(0) + "%;background:var(--b" + cbbiColIdx(x) + ')"></i></span><span class="v">' + Math.round(x) + "</span></div>";
    }).join("");
    if (c.v30 != null) h += '<div class="sub" style="margin-top:2px">30 days ago: <b class="mono" style="color:var(--ink)">' + Math.round(c.v30) + "</b> (" + sgn(v - c.v30) + ")</div>";
    $("cbbi-comp").innerHTML = h;
  }

  // history
  // value score history: weekly rows from Sep 2025, daily rows (UTC days) from the cycle top; sl = score at the day's (week's) low
  var HIST_FROM = "2025-09-01";
  function series() {
    var out = [];
    if (S.hist) S.hist.rows.forEach(function (o) {
      if (o.d < HIST_FROM) return;
      var s = histVal(o); if (s == null) return;
      var sl = o.lo && o.lo < o.p ? histValAt(o, o.lo) : s;
      out.push({ d: o.d, s: s, sl: sl == null ? s : Math.max(s, sl), p: o.p, lo: o.lo, wk: !o.dly, live: !!o.live, est: !!o.est });
    });
    var lastD = out.length ? out[out.length - 1].d : "";
    if (!S.dr) (S.recs || []).forEach(function (x) { if (x.date <= lastD) return; var s = parts(recDoc(x)).total; if (s != null) out.push({ d: x.date, s: s, sl: s, p: x.price, rec: true }); });
    return out;
  }
  function niceStep(span) { var c = [1000, 2000, 5000, 10000, 20000, 25000, 50000]; for (var i = 0; i < c.length; i++) if (span / c[i] <= 5) return c[i]; return 100000; }
  function addMonths(s, n) { var y = +s.slice(0, 4), mo = +s.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + String(mo + 1).padStart(2, "0") + "-01"; }
  function renderHistory() {
    if (!S.latest) return;
    var box = $("hist"), W = Math.max(300, box.clientWidth || 800), H = W >= 900 ? 320 : W >= 600 ? 270 : 230;
    var ml = 34, mr = 60, mt = 12, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    var all = series(); if (!all.length) return;
    var end = all[all.length - 1].d, today = utcToday(); if (today > end) end = today;
    var start = S.range ? addDays(end, -S.range) : all[0].d;
    var pts = all.filter(function (p) { return p.d >= start; });
    var t0 = dnum(start), t1 = dnum(end);
    function X(d) { return ml + (dnum(d) - t0) / (t1 - t0 || 1) * iw; }
    function Y(s) { return mt + (1 - Math.max(0, Math.min(100, s)) / 100) * ih; }
    var prices = pts.filter(function (q) { return q.p; }).map(function (q) { return [q.d, q.p]; });
    var pmin = 0, pmax = 1, step = 10000;
    if (prices.length > 1) {
      var vs = prices.map(function (p) { return p[1]; }); pmin = Math.min.apply(null, vs); pmax = Math.max.apply(null, vs);
      step = niceStep(pmax - pmin); pmin = Math.floor(pmin * 0.97 / step) * step; pmax = Math.ceil(pmax * 1.03 / step) * step;
    }
    function PY(p) { return mt + (1 - (p - pmin) / (pmax - pmin)) * ih; }
    var g = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Value score and BTC price over time">';
    [[90, 100, 5, .12], [75, 90, 4, .09], [60, 75, 3, .07]].forEach(function (z) { g += '<rect x="' + ml + '" y="' + Y(z[1]).toFixed(1) + '" width="' + iw + '" height="' + (Y(z[0]) - Y(z[1])).toFixed(1) + '" fill="var(--b' + z[2] + ')" opacity="' + z[3] + '"/>'; });
    [0, 40, 60, 75, 90, 100].forEach(function (s) { g += '<line x1="' + ml + '" x2="' + (ml + iw) + '" y1="' + Y(s).toFixed(1) + '" y2="' + Y(s).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="' + (s === 0 ? "0" : "3 4") + '"/><text x="' + (ml - 6) + '" y="' + Y(s).toFixed(1) + '" text-anchor="end" dominant-baseline="middle">' + s + "</text>"; });
    if (prices.length > 1) {
      for (var p = pmin; p <= pmax + 1; p += step) g += '<text x="' + (ml + iw + 6) + '" y="' + PY(p).toFixed(1) + '" dominant-baseline="middle">$' + (p / 1000) + "k</text>";
      g += '<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4" stroke-linejoin="round" points="' + prices.map(function (q) { return X(q[0]).toFixed(1) + "," + PY(q[1]).toFixed(1); }).join(" ") + '"/>';
    }
    var spanD = daysBetween(start, end), stepM = spanD > 400 ? 3 : spanD > 200 ? 2 : 1, lastX = -99;
    var m = start.slice(0, 7) + "-01"; if (m < start) m = addMonths(m, 1);
    while (m <= end) {
      var mi = +m.slice(5, 7) - 1;
      if (mi % stepM === 0) { var x = X(m); if (x - lastX > 44) { g += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + MON[mi] + (mi === 0 || lastX < 0 ? " " + m.slice(2, 4) : "") + "</text>"; lastX = x; } }
      m = addMonths(m, 1);
    }
    if (pts.length > 1) {
      // band from the score at the close up to the score at the day's low
      var up = pts.map(function (q) { return X(q.d).toFixed(1) + "," + Y(q.sl).toFixed(1); }), dn = pts.slice().reverse().map(function (q) { return X(q.d).toFixed(1) + "," + Y(q.s).toFixed(1); });
      g += '<polygon points="' + up.concat(dn).join(" ") + '" fill="var(--accent)" opacity=".22"/>';
      g += '<polyline fill="none" stroke="var(--accent)" stroke-width="1" opacity=".6" stroke-linejoin="round" points="' + up.join(" ") + '"/>';
      g += '<polyline fill="none" stroke="var(--accent)" stroke-width="2.75" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (q) { return X(q.d).toFixed(1) + "," + Y(q.s).toFixed(1); }).join(" ") + '"/>';
      // mark the deepest value of this bear market: the highest score at a daily low since the top
      var pk = null; pts.forEach(function (q) { if (q.d >= NOWC.top && (!pk || q.sl > pk.sl)) pk = q; });
      if (pk && pk.sl - pk.s >= 1) {
        var px0 = X(pk.d), py0 = Y(pk.sl), lab = Math.round(pk.sl) + " at " + usd(pk.lo) + " (" + fd(pk.d) + ")", anc = px0 > ml + iw * 0.6 ? "end" : "start";
        g += '<circle cx="' + px0.toFixed(1) + '" cy="' + py0.toFixed(1) + '" r="4.5" fill="var(--surf)" stroke="var(--accent)" stroke-width="2"/>';
        g += '<text x="' + (px0 + (anc === "end" ? -8 : 8)).toFixed(1) + '" y="' + Math.max(mt + 10, py0 - 8).toFixed(1) + '" text-anchor="' + anc + '" style="fill:var(--accent);font-weight:600">Low of day: ' + esc(lab) + "</text>";
      }
    }
    var P = liveP();
    if (P) { var ls = scoreAt(P); g += '<circle cx="' + X(end).toFixed(1) + '" cy="' + Y(ls).toFixed(1) + '" r="6" fill="var(--ink)" stroke="var(--surf)" stroke-width="3"/><text x="' + (X(end) - 10).toFixed(1) + '" y="' + (Y(ls) + 22).toFixed(1) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + Math.round(ls) + " live</text>"; }
    g += '<line id="xh" x1="0" x2="0" y1="' + mt + '" y2="' + (mt + ih) + '" stroke="var(--muted)" stroke-dasharray="3 3" style="display:none"/><circle id="xd" r="5" fill="var(--accent)" stroke="var(--surf)" stroke-width="2" style="display:none"/></svg>';
    var tip = $("tip"); box.innerHTML = g; box.appendChild(tip);
    S.hgeo = { X: X, Y: Y, pts: pts, ml: ml, iw: iw, W: W };
  }
  function histPointer(e) {
    var G = S.hgeo; if (!G || !G.pts.length) return;
    var r = $("hist").getBoundingClientRect(), x = e.clientX - r.left;
    if (x < G.ml - 10 || x > G.ml + G.iw + 10) { hideHistTip(); return; }
    var best = null, bd = 1e9;
    G.pts.forEach(function (p) { var dx = Math.abs(G.X(p.d) - x); if (dx < bd) { bd = dx; best = p; } });
    if (!best) return;
    var px = G.X(best.d), py = G.Y(best.s), xh = document.getElementById("xh"), xd = document.getElementById("xd");
    xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.style.display = ""; xd.setAttribute("cx", px); xd.setAttribute("cy", py); xd.style.display = "";
    var tip = $("tip"), lowTxt = best.lo && best.lo < best.p && best.sl - best.s >= 0.5;
    tip.innerHTML = '<span class="muted">' + (best.wk ? "Week to " : "") + fdy(best.d) + (best.live ? " · today so far" : best.wk ? "" : " (UTC)") + "</span>" +
      "<span>" + (best.live ? "Live" : "Close") + ' <b class="mono">' + Math.round(best.s) + "</b> · " + bandName(best.s) + (best.p ? ' · <span class="mono">' + usd(best.p) + "</span>" : "") + "</span>" +
      (lowTxt ? "<span>At the " + (best.wk ? "week's" : "day's") + ' low <b class="mono">' + Math.round(best.sl) + "</b> · " + bandName(best.sl) + ' · <span class="mono">' + usd(best.lo) + "</span></span>" : "");
    tip.style.display = "flex";
    var tw = tip.offsetWidth, left = px + 12; if (left + tw > G.W) left = px - tw - 12;
    tip.style.left = Math.max(0, left) + "px"; tip.style.top = "8px";
  }
  function hideHistTip() { $("tip").style.display = "none"; var xh = document.getElementById("xh"), xd = document.getElementById("xd"); if (xh) xh.style.display = "none"; if (xd) xd.style.display = "none"; }

  // ---------- signals: heat / numbers / line ----------
  var VIEWS = ["heat", "num", "line"], VNAME = { heat: "heat map", num: "numbers", line: "line" };
  var VICON = {
    heat: '<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><defs><linearGradient id="vg" x1="0" x2="1"><stop offset="0" stop-color="var(--b0)"/><stop offset=".5" stop-color="var(--b2)"/><stop offset="1" stop-color="var(--b4)"/></linearGradient></defs><rect x="0" y="2" width="16" height="8" rx="2" fill="url(#vg)"/></svg>',
    num: '<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><rect x="0" y="2" width="4.5" height="8" rx="1" fill="currentColor" opacity=".5"/><rect x="5.75" y="2" width="4.5" height="8" rx="1" fill="currentColor" opacity=".75"/><rect x="11.5" y="2" width="4.5" height="8" rx="1" fill="currentColor"/></svg>',
    line: '<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><polyline points="1,10 5,7 9,8 15,2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  S.sigAll = sget("bbm.sigview") || "heat"; if (VIEWS.indexOf(S.sigAll) < 0) S.sigAll = "heat";
  try { S.sigRows = JSON.parse(sget("bbm.sigrows") || "{}") || {}; } catch (e) { S.sigRows = {}; }
  function viewOf(k) { return S.sigRows[k] || S.sigAll; }
  // 14 daily closes (UTC days) and the live column. Readings shown are live.
  function sigRowsData() {
    var d = S.latest, cols = [], pc, byDate = {}, P = liveP(), lraw = P ? liveRaw(d, P) : (S.mode === "live" && S.base ? rowRaw(S.base) : d.raw || {});
    if (S.mode === "live" && S.dr) {
      var end = S.base.d; S.dr.forEach(function (o) { if (!o.live) byDate[o.d] = o; });
      for (var i = 13; i >= 0; i--) cols.push(addDays(end, -i));
      pc = cols.map(function (c) { return byDate[c] ? histParts(byDate[c]) : null; });
    } else {
      var e2 = d.date; (S.recs || []).forEach(function (x) { byDate[x.date] = x; });
      for (var k = 13; k >= 0; k--) cols.push(addDays(e2, -k));
      pc = cols.map(function (c) { return byDate[c] ? parts(recDoc(byDate[c])) : null; });
    }
    var rows = [{ k: "tot", name: "Value score", w: "", read: String(Math.round(P ? scoreAt(P) : closeParts().total)), vals: pc.map(function (p) { return p ? p.total : null; }), tot: true }];
    IND.forEach(function (ind) { rows.push({ k: ind.k, name: ind.name, w: String(ind.w), read: ind.read(lraw), vals: pc.map(function (p) { return p ? p.p[ind.k] : null; }) }); });
    return { cols: cols, rows: rows, miss: cols.filter(function (c) { return !byDate[c]; }) };
  }
  function fillGaps(vals) {
    var out = vals.slice();
    for (var i = 0; i < out.length; i++) {
      if (out[i] != null) continue;
      var a = i - 1; while (a >= 0 && vals[a] == null) a--;
      var b = i + 1; while (b < vals.length && vals[b] == null) b++;
      if (a >= 0 && b < vals.length) out[i] = vals[a] + (vals[b] - vals[a]) * (i - a) / (b - a);
      else if (a >= 0) out[i] = vals[a]; else if (b < vals.length) out[i] = vals[b];
    }
    return out;
  }
  function vizHtml(row, mode, live) {
    var all = row.vals.concat([live]), n = all.length;
    if (mode === "num") {
      return all.map(function (v, i) {
        var lv = i === n - 1 ? " lv" : "";
        if (v == null) return '<div class="c na' + lv + '"' + (lv ? ' data-live="' + row.k + '"' : "") + "></div>";
        var bg = bandCol(v); return '<div class="c' + lv + '"' + (lv ? ' data-live="' + row.k + '"' : "") + ' style="background:' + bg + ";color:" + txtOn(bg) + '">' + Math.round(v) + "</div>";
      }).join("");
    }
    var f = fillGaps(all);
    if (mode === "heat") {
      var stops = f.map(function (v, i) { return (v == null ? css("--surf2") : smoothCol(v)) + " " + ((i + 0.5) / n * 100).toFixed(2) + "%"; });
      var lvv = f[n - 1], lbg = lvv == null ? css("--surf2") : smoothCol(lvv);
      return '<div class="viz heat" data-k="' + row.k + '"><div class="grad" style="background:linear-gradient(to right,' + stops.join(",") + ')"></div><div class="lvmark" data-live="' + row.k + '" style="background:' + lbg + ";color:" + txtOn(lvv == null ? css("--surf2") : bandCol(lvv)) + '">' + (lvv == null ? "" : Math.round(lvv)) + "</div></div>";
    }
    // line: each row scaled to its own 14-day range so the shape is easy to read
    var idx = [], present = [];
    all.forEach(function (v, i) { if (v != null) { idx.push(i); present.push(v); } });
    if (!present.length) return '<div class="viz line" data-k="' + row.k + '"><span class="lval">—</span></div>';
    var mn = Math.min.apply(null, present), mx = Math.max.apply(null, present), pad = Math.max(3, (mx - mn) * 0.15);
    var lo = Math.max(0, mn - pad), hi = Math.min(100, mx + pad);
    if (hi - lo < 12) { var mid = (hi + lo) / 2; lo = Math.max(0, mid - 6); hi = Math.min(100, lo + 12); lo = Math.max(0, hi - 12); }
    function LY(v) { return 26 - (v - lo) / (hi - lo) * 22; }
    var xy = idx.map(function (i, j) { return [(i + 0.5) / n * 100, LY(present[j])]; });
    var line = xy.map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" ");
    var area = xy[0][0].toFixed(2) + ",30 " + line + " " + xy[xy.length - 1][0].toFixed(2) + ",30";
    var lastV = present[present.length - 1], lc = bandCol(lastV);
    var svg = '<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">';
    if (60 > lo && 60 < hi) svg += '<line x1="0" x2="100" y1="' + LY(60).toFixed(2) + '" y2="' + LY(60).toFixed(2) + '" stroke="var(--b3)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>';
    svg += '<polygon points="' + area + '" fill="' + lc + '" opacity=".22"/>';
    svg += '<polyline points="' + line + '" fill="none" stroke="' + lc + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
    var lastI = idx[idx.length - 1];
    var dot = '<span class="ldot" data-live="' + row.k + '" style="left:' + ((lastI + 0.5) / n * 100).toFixed(2) + "%;top:" + (LY(lastV) / 30 * 100).toFixed(1) + "%;background:" + lc + '"></span>';
    return '<div class="viz line" data-k="' + row.k + '" data-lo="' + Math.round(lo) + '" data-hi="' + Math.round(hi) + '">' + svg + dot + '<span class="lval">' + Math.round(lastV) + "</span></div>";
  }
  function liveVals(P) {
    var d = S.latest, pl = parts(d, P ? liveRaw(d, P) : null), o = { tot: pl.total };
    IND.forEach(function (ind) { o[ind.k] = pl.p[ind.k]; });
    return o;
  }
  function renderSignals() {
    if (!S.latest) return;
    var D = sigRowsData(), lv = liveVals(liveP()), end = D.cols[13];
    S.sigD = D;
    var h = '<div class="h l">Signal · ' + MON[+end.slice(5, 7) - 1] + '</div><div class="h">wt</div><div class="h" style="text-align:right">reading</div>';
    D.cols.forEach(function (c, i) { h += '<div class="h' + (i === 13 ? " now" : "") + '">' + (+c.slice(8, 10)) + "</div>"; });
    h += '<div class="h now">Live</div>';
    D.rows.forEach(function (row, ri) {
      var mode = viewOf(row.k), ovr = !!S.sigRows[row.k];
      var nx = VIEWS[(VIEWS.indexOf(mode) + 1) % 3];
      h += '<div class="nm' + (row.tot ? " tot" : "") + '"><span class="t"><span class="tip" tabindex="0" data-tipk="' + (row.tot ? "score" : "ind-" + row.k) + '">' + esc(row.name) + '</span></span><button type="button" class="vbtn' + (ovr ? " ovr" : "") + '" data-row="' + row.k + '" data-nocap aria-label="' + esc(row.name) + ": showing " + VNAME[mode] + ". Change to " + VNAME[nx] + '" title="Showing ' + VNAME[mode] + ". Click for " + VNAME[nx] + '">' + VICON[mode] + "</button></div>";
      h += '<div class="w">' + esc(row.w) + '</div><div class="rd"' + (row.tot ? ' style="font-weight:700"' : "") + ">" + esc(row.read) + "</div>";
      h += vizHtml(row, mode, lv[row.k]);
      if (row.tot) h += '<div class="sep"></div>';
    });
    $("sig").innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll("#sig-all button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S.sigAll ? "true" : "false"); });
    var libD = S.base && S.base.libD, note = "";
    if (S.mode === "live") {
      note = "Each column is the daily close (UTC), worked out from the sources in your browser. The reading column and the Live column use the live price. ";
      if (libD && libD < S.base.d) note += "LookIntoBitcoin lines (holder costs, CVDD, balanced price, addresses in loss, SOPR, reserve risk) are to " + fd(libD) + "; later columns divide them into each day's price. ";
    } else note = !S.src.cm ? "Live data still loading: for now the columns are the daily task's readings. " : "Live sources not reached: columns are the daily task's readings, with price-linked signals moved to the price each reading recorded. ";
    var snT = (D.miss.length ? "No reading on " + D.miss.map(fd).join(", ") + ": the heat map and line blend across the gap. " : "") + note + "Scores use " + (S.lv === "adj" ? "small-cycle" : "classic") + " levels.";
    $("sig-note").innerHTML = "<span>About the columns</span> " + qiH("<span class='tt-h'>About the columns</span>" + esc(snT), "the columns");
    $("bands").innerHTML = BANDS.map(function (b, i) { return '<span class="tip" tabindex="0" data-tipk="band-' + i + '"><span class="sw" style="background:var(--b' + i + ')"></span>' + (i === 5 ? "90+" : b.lo + "–" + b.hi) + " " + b.name + "</span>"; }).join("");
    var sc = document.querySelector(".sig-scroll"); if (sc && window.innerWidth < 700) sc.scrollLeft = sc.scrollWidth;
  }
  function renderSigLive(P) {
    if (!S.sigD) return;
    var lv = liveVals(P);
    S.sigD.rows.forEach(function (row) {
      var mode = viewOf(row.k);
      if (mode === "num") {
        var el = document.querySelector('#sig [data-live="' + row.k + '"]'); if (!el) return;
        var v = lv[row.k]; if (v == null) { el.textContent = ""; return; }
        var bg = bandCol(v); el.className = "c lv"; el.style.background = bg; el.style.color = txtOn(bg); el.textContent = Math.round(v);
      } else {
        var box = document.querySelector('#sig .viz[data-k="' + row.k + '"]'); if (!box) return;
        var tmp = document.createElement("div"); tmp.innerHTML = vizHtml(row, mode, lv[row.k]);
        box.replaceWith(tmp.firstChild);
      }
    });
  }
  $("sig").addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn"); if (!b) return;
    var k = b.getAttribute("data-row"), cur = viewOf(k), nx = VIEWS[(VIEWS.indexOf(cur) + 1) % 3];
    if (nx === S.sigAll) delete S.sigRows[k]; else S.sigRows[k] = nx;
    sset("bbm.sigrows", JSON.stringify(S.sigRows));
    renderSignals();
    var nb = document.querySelector('#sig .vbtn[data-row="' + k + '"]'); if (nb) nb.focus();
  });
  $("sig").addEventListener("mousemove", function (e) {
    var v = e.target.closest && e.target.closest(".viz"); if (!v || !S.sigD) return;
    var r = v.getBoundingClientRect(), i = Math.min(14, Math.max(0, Math.floor((e.clientX - r.left) / r.width * 15)));
    var row = S.sigD.rows.filter(function (x) { return x.k === v.getAttribute("data-k"); })[0]; if (!row) return;
    var val = i === 14 ? liveVals(liveP())[row.k] : row.vals[i];
    v.setAttribute("data-tip", "<span class='tt-h'>" + esc(row.name) + "</span>" + (i === 14 ? "Live" : fd(S.sigD.cols[i])) + ": <b>" + (val == null ? "no reading" : Math.round(val) + " · " + bandName(val)) + "</b>" + (v.getAttribute("data-lo") ? "<span class='tt-m'>Line scaled to this signal's 14-day range: " + v.getAttribute("data-lo") + "–" + v.getAttribute("data-hi") + ".</span>" : ""));
    showTip(v);
  });
  $("sig-all").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.sigAll = b.getAttribute("data-v"); S.sigRows = {};
    sset("bbm.sigview", S.sigAll); sset("bbm.sigrows", "{}");
    renderSignals();
  });

  // ---------- price to score, with chances ----------
  // Chance that BTC trades at a price at least once in the window. Two models, averaged:
  // 1) volatility model: driftless random walk with BTC's own realised volatility (barrier-touch formula);
  // 2) cycle model: days in the 2014-15, 2018 and 2022 bears (peak to 180 days after the low) when MVRV was within 0.06 of today's.
  var CYC = [["2013-12-04", "2015-01-14", "2014–15"], ["2017-12-17", "2018-12-15", "2018"], ["2021-11-10", "2022-11-21", "2022"]];
  var OFFS = [-30, -20, -15, -10, -5, 0, 5, 10];
  S.win = +(sget("bbm.win") || 30); if (S.win !== 30 && S.win !== 90) S.win = 30;
  function normCdf(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  function volSigma() {
    var c = [];
    if (S.daily) c = Object.keys(S.daily).sort().map(function (k) { return S.daily[k]; });
    else if (S.cm) c = S.cm.slice(-400).map(function (x) { return x[1]; });
    if (c.length < 40) return null;
    var lr = []; for (var i = 1; i < c.length; i++) lr.push(Math.log(c[i] / c[i - 1]));
    function v(n) { var a = lr.slice(-n); if (a.length < 20) return null; var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length; return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (a.length - 1)) * Math.sqrt(365); }
    var s = [v(30), v(90), v(365)].filter(function (x) { return x != null; });
    return s.reduce(function (x, y) { return x + y; }, 0) / s.length;
  }
  function volProb(o, W, sig) {
    if (o === 0 || !sig) return null;
    var k = Math.log(1 + o / 100), sv = sig * Math.sqrt(W / 365);
    return Math.max(0, Math.min(100, (o < 0 ? 2 * normCdf(k / sv) : 2 * (1 - normCdf(k / sv))) * 100));
  }
  function cycleModel(m, W) {
    if (!S.cm || m == null) return null;
    var key = m.toFixed(2) + "|" + W;
    if (S.cycCache[key]) return S.cycCache[key];
    var r = S.cm, per = [];
    CYC.forEach(function (c) {
      var a = S.cmIdx[c[0]], lo = S.cmIdx[c[1]];
      if (a == null || lo == null) return;
      var b = Math.min(r.length - 1 - W, lo + 180), days = [];
      for (var i = a; i <= b; i++) if (Math.abs(r[i][2] - m) <= 0.06) {
        var mn = Infinity, mx = -Infinity;
        for (var j = i + 1; j <= i + W; j++) { if (r[j][1] < mn) mn = r[j][1]; if (r[j][1] > mx) mx = r[j][1]; }
        days.push([mn / r[i][1], mx / r[i][1]]);
      }
      per.push({ name: c[2], days: days });
    });
    var tot = per.reduce(function (x, c) { return x + c.days.length; }, 0);
    var res = { per: per, n: tot, ok: tot >= 10 && per.filter(function (c) { return c.days.length >= 3; }).length >= 2 };
    res.prob = function (o) {
      if (!res.ok || o === 0) return null;
      var sw = 0, sp = 0, L = 1 + o / 100;
      per.forEach(function (c) {
        if (!c.days.length) return;
        var hit = c.days.filter(function (d) { return o < 0 ? d[0] <= L : d[1] >= L; }).length, w = Math.min(c.days.length, 30);
        sw += w; sp += w * hit / c.days.length;
      });
      return sw ? sp / sw * 100 : null;
    };
    S.cycCache[key] = res;
    return res;
  }
  var CHW = [[7.5, "Remote chance"], [22.5, "Highly unlikely"], [37.5, "Unlikely"], [52.5, "Realistic possibility"], [77.5, "Likely"], [92.5, "Highly likely"], [101, "Almost certain"]];
  function chWord(p) { for (var i = 0; i < CHW.length; i++) if (p < CHW[i][0]) return CHW[i][1]; return CHW[CHW.length - 1][1]; }
  var CL = ["Low", "Medium", "High"];
  function clTag(c) { return '<span class="cf cf' + c + '">' + (c === 1 ? '<span class="hs">Medium</span><span class="ss">Med</span>' : CL[c]) + "</span>"; }
  function scoreConf(o) { var a = Math.abs(o); return a <= 5 ? 2 : a <= 15 ? 1 : 0; }
  function chanceConf(o, pv, pc, stale) {
    var a = Math.abs(o), c;
    if (pc == null) c = a <= 10 ? 1 : 0;
    else { var gap = Math.abs(pv - pc); c = gap <= 15 && a <= 10 ? 2 : gap <= 25 && a <= 20 ? 1 : 0; }
    if (stale && c > 0) c--;
    return c;
  }
  function renderP2S() {
    if (!S.latest) return;
    var P0 = liveP() || S.latest.price, W = S.win, sig = volSigma();
    var m = S.latest.ref && S.latest.ref.realizedPrice ? P0 / S.latest.ref.realizedPrice : (S.latest.raw || {}).mvrv;
    var cyc = cycleModel(m, W), stale = daysBetween(S.latest.date, todayCbr()) > 2;
    $("p2s-head").innerHTML = '<tr><th>BTC price</th><th class="r hs">Change</th><th class="r"><span class="tip" tabindex="0" data-tipk="p2s-score">Score</span></th><th class="hs">Band</th><th><span class="tip" tabindex="0" data-tipk="p2s-chance">Chance in ' + W + ' days</span></th><th><span class="tip" tabindex="0" data-tipk="p2s-conf"><span class="hs">Confidence</span><span class="ss">Conf.</span></span></th></tr>';
    var h = "";
    OFFS.forEach(function (o) {
      var P = P0 * (1 + o / 100), s = scoreAt(P);
      var pv = volProb(o, W, sig), pc = cyc ? cyc.prob(o) : null;
      var p = pv == null ? null : pc == null ? pv : (pv + pc) / 2;
      var cc = o === 0 ? null : chanceConf(o, pv, pc, stale), sc = scoreConf(o), conf = cc == null ? sc : Math.min(sc, cc);
      var tipTxt = o === 0 ? "" : "<span class='tt-h'>" + (o < 0 ? "Trades at or below " : "Trades at or above ") + usd(P) + " within " + W + " days</span>" +
        "Volatility model: <b>" + (pv == null ? "n/a" : Math.round(pv) + "%") + "</b><br>Cycle model: <b>" + (pc == null ? "n/a" : Math.round(pc) + "%") + "</b><br>Blend: <b>" + (p == null ? "n/a" : Math.round(p) + "% · " + chWord(p)) + "</b>" +
        "<span class='tt-m'>Score confidence: " + CL[sc] + " (" + Math.abs(o) + "% from today's price). Chance confidence: " + CL[cc] + (pv != null && pc != null ? " (models " + Math.round(Math.abs(pv - pc)) + " points apart)" : "") + (stale ? "; daily data out of date" : "") + ". The table shows the lower of the two.</span>";
      h += '<tr class="' + (o === 0 ? "now" : "") + '"><td class="mono">' + usd(P) + '<span class="ss muted"> ' + (o === 0 ? "now" : (o > 0 ? "+" : "−") + Math.abs(o) + "%") + '</span></td><td class="r mono hs">' + (o === 0 ? "now" : (o > 0 ? "+" : "−") + Math.abs(o) + "%") + '</td><td class="r mono"><span class="ss sw" style="background:' + bandCol(s) + ';width:10px;height:10px;margin-right:6px"></span>' + Math.round(s) + '</td><td class="hs"><span style="display:inline-flex;align-items:center;gap:7px"><span class="sw" style="background:' + bandCol(s) + '"></span>' + bandName(s) + "</span></td>" +
        (o === 0 ? '<td class="muted">today’s price</td><td>' + clTag(sc) + "</td>" :
          '<td><span class="tip ch" tabindex="0" data-tip="' + tipTxt.replace(/"/g, "&quot;") + '">' + (p == null ? "—" : chWord(p) + ' <span class="mono muted">' + Math.round(p) + "%</span>") + '</span></td><td>' + clTag(conf) + "</td>") + "</tr>";
    });
    $("p2s").innerHTML = h;
    // explainer
    var cn = cyc ? cyc.per.map(function (c) { return c.name + ": " + c.days.length + " days"; }).join(", ") : "";
    var x = '<details class="p2s-x" open><summary>How we got these numbers</summary>' +
      "<p><b>Score.</b> At each price, the nine price-linked signals are worked out again. The other seven stay at today's values. When price falls, loss-taking, fear and leverage signals usually rise too, so the real score is likely to be <b>higher</b> than shown. Confidence: <b>High</b> within ±5% of today's price, <b>Medium</b> to ±15%, <b>Low</b> beyond.</p>" +
      "<p><b>Chance.</b> The chance that BTC trades at that price at least once in the next " + W + " days (a touch, as a limit order would fill). It is the average of two models:</p><ul>" +
      "<li><b>Volatility model</b>: BTC's own recent swings (" + (sig ? Math.round(sig * 100) + "% a year, the average of its 30-, 90- and 365-day volatility" : "not available") + "), with no trend up or down. It treats big crashes as rare, so it can understate deep falls.</li>" +
      "<li><b>Cycle model</b>: every day in the 2014–15, 2018 and 2022 bear markets (top to 180 days after the low) when MVRV was close to today's (" + (m ? m.toFixed(2) : "—") + " ± 0.06). It counts how often price touched each level within " + W + " days. " + (cyc && cyc.ok ? "Matching days: " + cn + "." : "Not enough matching days right now, so only the volatility model is used.") + "</li></ul>" +
      "<p><b>Words.</b> Each chance is also given in words: Remote chance (under 5%), Highly unlikely (10–20%), Unlikely (25–35%), Realistic possibility (40–50%), Likely (55–75%), Highly likely (80–90%), Almost certain (over 95%). Values in the gaps go to the nearer word.</p>" +
      "<p><b>Confidence.</b> For the chance: <b>High</b> when the two models agree within 15 points and the level is within 10% of today's price; <b>Medium</b> when they agree within 25 points and the level is within 20%; <b>Low</b> otherwise. One step lower when the daily data is more than two days old. The table shows the lower of the score and chance confidence. Hover a chance for both model results.</p>" +
      "<p class='muted'>Only three past cycles to learn from. These are estimates, not forecasts of what will happen. Not financial advice.</p></details>";
    var px = $("p2s-x"), od = px.querySelector("details");
    if (S.p2sX !== x) { S.p2sX = x; px.innerHTML = od && od.open ? x : x.replace("<details class=\"p2s-x\" open>", "<details class=\"p2s-x\">"); }
    Array.prototype.forEach.call(document.querySelectorAll("#win button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-w") === W ? "true" : "false"); });
  }
  TIPS["p2s-score"] = "<span class='tt-h'>Projected value score</span>The value score at that price if the on-chain lines stay as they are today. Likely too low for falls, because loss-taking and fear usually rise as price falls.";
  TIPS["p2s-chance"] = "<span class='tt-h'>Chance</span>The chance that BTC trades at that price at least once in the window, in words from Remote chance to Almost certain. Average of a volatility model and a cycle model. Hover a row for both results.";
  TIPS["p2s-conf"] = "<span class='tt-h'>Confidence</span>The lower of the score confidence and the chance confidence. See 'How we got these numbers' below the table.";
  function confScore(c) {
    c = c || {}; var n = 0, t = 0;
    CONF.forEach(function (k) { var v = k.score(c); if (v != null) { n++; t += v; } });
    return n ? t / n : null;
  }
  // ---------- weekly history since 2013 (history.json) ----------
  function loadHist() {
    return J("history.json?v=4").then(function (h) {
      var cols = h.cols, rows = h.rows.map(function (a) { var o = {}; cols.forEach(function (c, i) { o[c] = a[i]; }); return o; });
      rows.forEach(function (o) { o.v = {}; o.vl = {}; });
      S.histW = rows;
    }).catch(function () { S.histW = null; }).then(rebuild);
  }
  function rowRaw(o) {
    return { cvdd: o.cvdd, mvrv: o.mvrv, lth: o.lth, balanced: o.bal, w200: o.w200, pi: o.pi, daysSincePeak: o.dsp, mayer: o.mayer, sopr7d: o.sopr, addrLoss: o.loss, puell: o.puell, sth: o.sth, fg7d: o.fg,
      hashCapitulating: o.hcap == null ? null : o.hcap === 1, hashLastRecovery: o.dsr == null ? null : addDays(o.d, -o.dsr), reserveRisk: o.rr, funding7d: o.fund, oiDrawdown: o.oidd };
  }
  // the row's signals at another price: price-linked ratios scale with the price
  var RAW_PF = ["cvdd", "mvrv", "lth", "balanced", "w200", "mayer", "sth", "puell", "reserveRisk"];
  function rowRawAt(o, P) { var r = rowRaw(o), k = P / o.p; RAW_PF.forEach(function (f) { if (r[f] != null) r[f] *= k; }); return r; }
  function histParts(o, mode) { return parts({ date: o.d, raw: rowRaw(o) }, null, mode || S.lv); }
  function histVal(o, mode) { mode = mode || S.lv; if (!o.v) o.v = {}; if (!(mode in o.v)) o.v[mode] = histParts(o, mode).total; return o.v[mode]; }
  function histValAt(o, P, mode) {
    mode = mode || S.lv; if (!o.vl) o.vl = {};
    var key = mode + P; if (!(key in o.vl)) o.vl[key] = parts({ date: o.d, raw: rowRawAt(o, P) }, null, mode).total;
    return o.vl[key];
  }
  function histLowRow(date) {
    if (!S.hist) return null; var best = null;
    S.hist.rows.forEach(function (o) { if (Math.abs(daysBetween(o.d, date)) <= 10 && (!best || o.p < best.p)) best = o; });
    return best;
  }
  function histNear(date, tol) {
    if (!S.hist) return null; var best = null, bd = 1e9;
    S.hist.rows.forEach(function (o) { var dd = Math.abs(daysBetween(o.d, date)); if (dd < bd) { bd = dd; best = o; } });
    return bd <= (tol == null ? 4 : tol) ? best : null;
  }

  // ---------- Bottom in? (live) ----------
  // value peak since the top: daily closes (weekly before daily rows) and the live price; also the peak at a daily low
  function vmaxNow() {
    var m = null;
    function up(v) { if (v != null && (m == null || v > m)) m = v; }
    if (S.hist) S.hist.rows.forEach(function (o) { if (o.d >= NOWC.top && !o.live) up(histVal(o, "adj")); });
    if (!S.dr && S.recs) S.recs.forEach(function (x) { if (x.date >= NOWC.top) up(parts(recDoc(x), null, "adj").total); });
    var P = liveP(); if (S.latest) up(parts(S.latest, liveRaw(S.latest, P || S.latest.price), "adj").total);
    return m;
  }
  function vmaxLowNow() {
    var b = null; if (!S.dr) return null;
    S.dr.forEach(function (o) { if (o.lo && o.lo < o.p) { var v = histValAt(o, o.lo, "adj"); if (v != null && (!b || v > b.v)) b = { v: v, d: o.d, p: o.lo }; } });
    return b;
  }
  // lowest price since the top: intraday lows of the daily candles and the live price
  function cycleLowNow(P) {
    var lo = null, ld = null;
    if (S.dr) { var r = S.dr[S.dr.length - 1]; lo = r.low; ld = addDays(r.d, -r.dsl); }
    else if (S.ohlc) Object.keys(S.ohlc).sort().forEach(function (d) { if (d >= NOWC.top && (lo == null || S.ohlc[d].l < lo)) { lo = S.ohlc[d].l; ld = d; } });
    else if (S.hist) S.hist.rows.forEach(function (o) { if (o.d >= NOWC.top && o.low != null && (lo == null || o.low < lo)) { lo = o.low; ld = addDays(o.d, -o.dsl); } });
    if (!S.dr) (S.recs || []).forEach(function (x) { if (x.price && (lo == null || x.price < lo)) { lo = x.price; ld = x.date; } });
    if (P && (lo == null || P < lo)) { lo = P; ld = utcToday(); }
    return { lo: lo, ld: ld };
  }
  function biLive() {
    var d = S.latest; if (!d) return null;
    var P = liveP() || d.price, raw = liveRaw(d, P), r = d.raw || {}, cl = cycleLowNow(P), today = utcToday();
    var rec = r.hashLastRecovery && cl.ld ? r.hashLastRecovery >= addDays(cl.ld, -30) : null;
    var x = { p: P, low: cl.lo, dsl: cl.ld ? Math.max(0, daysBetween(cl.ld, today)) : null, sth: raw.sth, mayer: raw.mayer, sopr: r.sopr7d, hcap: r.hashCapitulating === true, recAfterLow: rec, flows: confScore(d.confirm) };
    var bc = biComps(x), vmax = vmaxNow(), g = gateOf(vmax);
    return { s: bc.raw == null ? null : bc.raw * g, raw: bc.raw, c: bc.c, x: x, vmax: vmax, vlow: vmaxLowNow(), gate: g, ld: cl.ld };
  }
  var shownBI = null;
  // ---------- price checks: not scored. Depth, higher low, trend; with the level that undoes them ----------
  function priceChecks() {
    if (!S.ohlc) return null;
    var ks = Object.keys(S.ohlc).sort(), today = utcToday(), P = liveP();
    var done = ks.filter(function (k) { return k < today; }), closes = done.map(function (k) { return S.ohlc[k].c; }), n = closes.length;
    if (n < 61) return null;
    function ma(w) { var t = 0; for (var i = n - w; i < n; i++) t += closes[i]; return t / w; }
    var c = closes[n - 1], m30 = ma(30), m60 = ma(60), cl = cycleLowNow(P), low = cl.lo, ld = cl.ld;
    if (!low || !ld) return null;
    // higher low: a bounce of 10%+, a pullback of 5%+ that stays above the low, then a daily close above the bounce high
    var pk = null, pb = null, pbD = null, conf = null;
    ks.forEach(function (k) {
      if (k <= ld || conf) return;
      var o = S.ohlc[k], live = k === today, cc = live && P ? P : o.c, l = live && P ? Math.min(o.l, P) : o.l;
      if (pb == null) { if (pk == null || cc > pk) pk = cc; else if (pk >= 1.1 * low && l <= pk * 0.95) { pb = l; pbD = k; } }
      else { if (l < pb) { pb = l; pbD = k; } if (!live && cc > pk) conf = { d: k, hl: pb, hlD: pbD }; }
    });
    var hl;
    if (conf) hl = { ok: true, t: "Higher low " + usd(conf.hl) + " (" + fd(conf.hlD) + "), confirmed " + fd(conf.d) };
    else if (pb != null) hl = { ok: false, t: "Pullback to " + usd(pb) + " is holding. Confirms on a daily close above " + usd(pk) };
    else if (pk != null && pk >= 1.1 * low) hl = { ok: false, t: "Bounced " + Math.round((pk / low - 1) * 100) + "%. Waiting for a pullback that holds above " + usd(low) };
    else hl = { ok: false, t: (daysBetween(ld, today) <= 1 ? "New low on " + fd(ld) + ". " : "") + "Waiting for a 10% bounce (above " + usd(low * 1.1) + ")" };
    return { low: low, ld: ld, deep: (low / NOWC.topP - 1) * 100, hl: hl, c: c, cD: done[n - 1], m30: m30, m60: m60 };
  }
  function renderChecks() {
    var el = $("bi-ev"); if (!el) return;
    var pc = priceChecks(); if (!pc) { el.innerHTML = ""; return; }
    function row(ok, name, tk, t, more) {
      var th = (typeof TIPS[tk] === "function" ? TIPS[tk]() : TIPS[tk]) + (more ? "<span class='tt-m'>" + esc(more) + "</span>" : "");
      return '<div class="ev-r"><span class="ev-i ' + (ok ? "ok" : "no") + '" aria-label="' + (ok ? "Yes" : "Not yet") + '">' + (ok ? "✓" : "✗") + '</span><span class="n">' + esc(name) + " " + qiH(th, name) + '</span><span class="t mono">' + esc(t) + "</span></div>";
    }
    var tr = CLK.fall.trend, t1 = pc.c > pc.m30, t2 = pc.m30 > pc.m60;
    el.innerHTML = row(pc.deep <= tr, "Depth", "ev-depth", "−" + Math.abs(pc.deep).toFixed(1) + "% · trend −" + Math.abs(tr) + "%", "Now: −" + Math.abs(pc.deep).toFixed(1) + "% at the " + fd(pc.ld) + " low. Past lows −77% to −87%; trend of past lows −" + Math.abs(tr) + "%.") +
      row(pc.hl.ok, "Higher low", "ev-hl", pc.hl.t) +
      row(t1, "Close above 30-day avg", "ev-trend", usd(pc.c) + " vs " + usd(pc.m30), "Close " + usd(pc.c) + " (" + fd(pc.cD) + "), 30-day average " + usd(pc.m30) + ".") +
      row(t2, "30-day above 60-day avg", "ev-trend", usd(pc.m30) + " vs " + usd(pc.m60), "30-day average " + usd(pc.m30) + ", 60-day average " + usd(pc.m60) + ".") +
      '<div class="ev-f">Fails if price trades below <b class="mono">' + usd(pc.low) + "</b> (a new low resets the checks).</div>";
  }
  // which of the four Value / Bottom in combinations we are in now
  function renderIntro(biS) {
    var P = liveP(), v = S.latest ? (P ? scoreAt(P) : closeParts().total) : null;
    if (v == null || biS == null) return;
    var q = (v >= 60 ? "h" : "l") + (biS >= 50 ? "h" : "l");
    Array.prototype.forEach.call(document.querySelectorAll("#quad .q"), function (e) { var on = e.getAttribute("data-q") === q; e.classList.toggle("now", on); var m = e.querySelector(".nowtag"); if (m) m.textContent = on ? "Now: Value " + Math.round(v) + " · Bottom in " + Math.round(biS) : ""; });
  }
  // ---------- how each score is made: points that add up ----------
  function rcRow(name, tipHtml, rd, pts, max, maxAll, mark, more) {
    var tw = Math.max(8, max / maxAll * 100), fw = pts == null ? 0 : Math.max(0, Math.min(100, pts / max * 100));
    var th = tipHtml + "<span class='tt-m'>Now: <b>" + esc(rd || "no reading") + "</b> · mark " + (mark == null ? "—" : Math.round(mark)) + " of 100 · " + (pts == null ? "no points (no reading)" : pts.toFixed(1) + " of " + Math.round(max) + " points") + "</span>" + (more ? "<span class='tt-m'>" + esc(more) + "</span>" : "");
    return '<div class="rc-r"><span class="n"><span class="nm">' + esc(name) + "</span>" + qiH(th, name) + '</span><span class="tw"><span class="trk" style="width:' + tw.toFixed(0) + '%"><i style="width:' + fw.toFixed(0) + "%;background:" + (mark == null ? "var(--surf2)" : smoothCol(mark)) + '"></i></span></span><span class="pt"><b>' + (pts == null ? "—" : pts.toFixed(1)) + "</b><span> / " + Math.round(max) + "</span></span></div>";
  }
  // the price (or time) at which each Bottom-in sign starts and fills
  function biRaise(b) {
    var x = b.x, P = x.p, o = {};
    if (x.sth) { var sc = P / x.sth; o.sth = "To raise it: starts above " + usd(sc * 0.85) + ", full at " + usd(sc * 1.05) + "."; }
    if (x.mayer) { var ma = P / x.mayer; o.mayer = "To raise it: starts above " + usd(ma * 0.8) + ", full at " + usd(ma * 1.1) + "."; }
    if (x.low) o.rise = "To raise it: full at " + usd(x.low * 1.5) + " (1.5× the low of " + usd(x.low) + ").";
    if (b.ld) o.nolow = "To raise it: full on " + fd(addDays(b.ld, 120)) + " if price stays above " + usd(x.low) + ".";
    o.sopr = "To raise it: starts when SOPR rises above −0.005.";
    o.hash = "To raise it: full when hash rate recovers after the low.";
    return o;
  }
  // Value: a bar of 16 pieces sized by points, the top contributors and gaps, and the full sum
  function renderValRc(P) {
    if (!$("val-rc") || !S.latest) return;
    var live = !!P, raw = live ? liveRaw(S.latest, P) : (S.mode === "live" && S.base ? rowRaw(S.base) : S.latest.raw || {});
    var pa = live ? parts(S.latest, raw) : closeParts(), sw = pa.sw || 100, tot = pa.total; if (tot == null) return;
    var items = IND.map(function (d) { var m = pa.p[d.k], max = d.w / sw * 100; return { d: d, m: m, max: max, pts: m == null ? null : m * d.w / sw, rd: d.read(raw) }; });
    $("val-rc-t").textContent = "How we got " + Math.round(tot) + (live ? " (live)" : "");
    $("val-stack").innerHTML = items.map(function (it) {
      if (!it.pts) return "";
      var t = "<span class='tt-h'>" + esc(it.d.name) + "</span>" + it.pts.toFixed(1) + " of " + Math.round(it.max) + " points · mark " + Math.round(it.m) + " · reading " + esc(it.rd);
      return '<span class="tip" tabindex="0" data-tip="' + t.replace(/"/g, "&quot;") + '" style="flex:0 1 ' + it.pts.toFixed(2) + "%;background:" + smoothCol(it.m) + '"></span>';
    }).join("") + '<span class="miss" style="flex:1 1 ' + Math.max(0, 100 - tot).toFixed(2) + '%"></span>';
    var have = items.filter(function (it) { return it.pts != null; });
    $("val-top").innerHTML = have.slice().sort(function (a, b) { return b.pts - a.pts; }).slice(0, 4).map(function (it) { return '<li><span class="tip" tabindex="0" data-tipk="ind-' + it.d.k + '">' + esc(it.d.name) + '</span> <b class="mono">' + it.pts.toFixed(1) + '</b><span class="muted mono"> / ' + Math.round(it.max) + "</span></li>"; }).join("");
    $("val-gap").innerHTML = have.slice().sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); }).slice(0, 4).map(function (it) { return '<li><span class="tip" tabindex="0" data-tipk="ind-' + it.d.k + '">' + esc(it.d.name) + '</span> <b class="mono">−' + (it.max - it.pts).toFixed(1) + "</b></li>"; }).join("");
    var maxAll = Math.max.apply(null, items.map(function (it) { return it.max; }));
    var miss = items.filter(function (it) { return it.pts == null; }).length;
    $("val-rows").innerHTML = items.map(function (it) { return rcRow(it.d.name, TIPS["ind-" + it.d.k](), it.rd, it.pts, it.max, maxAll, it.m); }).join("") +
      (miss ? '<div class="rc-sum"><span>' + miss + " signal" + (miss > 1 ? "s" : "") + " missing: the others are scaled up to 100</span><b></b></div>" : "") +
      '<div class="rc-tot"><span>Value score: the points added up</span><b>' + tot.toFixed(1) + " → " + Math.round(tot) + "</b></div>";
  }
  function renderBI() {
    var b = biLive(); S.biNow = b; if (!b || b.s == null) return;
    var v = Math.max(0, Math.min(100, b.s));
    $("bi-prog").setAttribute("stroke-dashoffset", (100 - v).toFixed(2));
    $("bi-prog").setAttribute("stroke", "var(--b" + BIB[Math.max(0, biIdx(v))].col + ")");
    $("bi-live").style.transform = "rotate(" + (v * 1.8).toFixed(2) + "deg)";
    animateNum($("bi-num"), shownBI, v); shownBI = v;
    $("bi-band").textContent = biName(v) + (liveP() ? " · live" : "");
    $("bi-svg").setAttribute("aria-label", "Bottom in score " + Math.round(v) + " of 100, " + biName(v) + ".");
    var x = b.x, rd = {
      nolow: x.dsl == null ? "—" : (x.dsl === 0 ? "new low " : x.dsl + " d since ") + fd(b.ld),
      rise: x.low ? (x.p / x.low).toFixed(2) + "× low" : "—",
      sth: x.sth == null ? "—" : x.sth.toFixed(2) + "×",
      mayer: x.mayer == null ? "—" : x.mayer.toFixed(2) + "×",
      sopr: x.sopr == null ? "—" : (x.sopr >= 0 ? "+" : "−") + Math.abs(x.sopr).toFixed(3),
      hash: x.hcap ? "capitulating" : x.recAfterLow == null ? "—" : x.recAfterLow ? "recovered" : "not since low",
      flows: b.c.flows == null ? "—" : Math.round(b.c.flows) + "/100"
    };
    // receipt: each sign's points (weight scaled to 100 × mark), the raw score, the deep-value check, the score
    var sw = 0; BI.forEach(function (bi) { if (b.c[bi.k] != null) sw += bi.w; });
    var bis = BI.slice().sort(function (p1, p2) { return p2.w - p1.w; }), maxAll = bis[0].w / (sw || 1) * 100, g = b.gate, vm = b.vmax;
    var up = biRaise(b);
    var gTxt = "<span class='tt-h'>Deep-value check</span>" + (g >= 1 ? "Value reached 75 in this bear market, so all of the raw score counts." : "Value peak " + (vm == null ? "—" : Math.round(vm)) + " at a daily close" + (b.vlow && b.vlow.v > (vm || 0) + 0.5 ? " (" + Math.round(b.vlow.v) + " at the " + fd(b.vlow.d) + " low)" : "") + ". That is below 75, so " + Math.round(g * 100) + "% of the raw score counts.") + "<span class='tt-m'>" + TIPS.gate.replace(/^<span class='tt-h'>[^<]*<\/span>/, "") + "</span>";
    var h = '<div class="rc-h"><b>How we got ' + Math.round(b.s) + "</b>" + qi("bi-rc", "how Bottom in is made") + '</div><div class="rc-rows">' +
      bis.map(function (bi) { var val = b.c[bi.k], max = bi.w / (sw || 1) * 100; return rcRow(bi.name, TIPS["bic-" + bi.k], rd[bi.k], val == null ? null : val * max / 100, max, maxAll, val, up[bi.k]); }).join("") + "</div>" +
      '<div class="rc-sum"><span>Raw score</span><b>' + b.raw.toFixed(1) + " / 100</b></div>" +
      '<div class="rc-sum"><span>Deep-value check ' + qiH(gTxt, "the deep-value check") + "</span><b>× " + g + "</b></div>" +
      '<div class="rc-tot"><span>Bottom in?</span><b>' + Math.round(b.s) + " · " + esc(biName(b.s)) + "</b></div>";
    var c = (S.latest && S.latest.confirm) || {};
    h += '<div class="sub bi-flows"><span class="bf-h">Money flows, not scored ' + qi("flows", "money flows") + "</span> " + CONF.map(function (k) { return '<span class="tip" tabindex="0" data-tipk="conf-' + k.k + '">' + esc(k.name.replace(/, 30 days|, 10 days/, "")) + "</span> " + '<b class="mono">' + esc(k.read(c)) + "</b>"; }).join(" · ") + "</div>";
    $("bi-comp").innerHTML = h;
    renderChecks(); renderIntro(b.s);
    var gEl = $("bi-gate"); if (gEl) gEl.textContent = "";
  }
  CONF.forEach(function (c) { TIPS["conf-" + c.k] = "<span class='tt-h'>" + esc(c.name) + "</span>" + esc(c.tip); });

  // ---------- cheap windows ----------
  // A window runs from the first close with Value at or above the line to the last one. A gap below the line shorter than
  // the gap setting does not end it. Settings (line, gap, past-cycle data) are kept in this browser.
  S.cwc = (function () {
    var d = { thr: 60, gap: 12, past: "daily" };
    try { var o = JSON.parse(sget("bbm.cw") || "null"); if (o) { d.thr = Math.max(40, Math.min(90, Math.round(+o.thr / 5) * 5 || 60)); d.gap = Math.max(1, Math.min(26, Math.round(+o.gap) || 12)); d.past = o.past === "weekly" ? "weekly" : "daily"; } } catch (e) {}
    return d;
  })();
  function cwFind(rows, mode, thr, gapD) {
    var ws = [], cur = null;
    rows.forEach(function (o) {
      var v = histVal(o, mode); if (v == null || v < thr) return;
      if (cur && daysBetween(cur.last, o.d) <= gapD) cur.last = o.d;
      else { cur = { start: o.d, p0: o.p, last: o.d }; ws.push(cur); }
    });
    return ws;
  }
  // one cell per week from the start: the highest close in that week
  function cwCells(w, rows, mode, endD) {
    var n = Math.floor(daysBetween(w.start, endD) / 7) + 1, a = [], i;
    for (i = 0; i < n; i++) a.push(null);
    rows.forEach(function (o) {
      if (o.d < w.start || o.d > endD) return;
      var k = Math.floor(daysBetween(w.start, o.d) / 7), v = histVal(o, mode);
      if (v != null && (a[k] == null || v > a[k])) a[k] = v;
    });
    return a;
  }
  // Past cycles, day by day: Coin Metrics daily data for the price-based signals; LookIntoBitcoin lines (weekly before
  // Oct 2025) as cost lines drawn straight between the weekly readings, divided into each day's price.
  function pastDaily(c) {
    if (!S.cm || !S.cmX || !S.histW || S.cmIdx[c.top] == null) return null;
    var key = S.cm.length + ":" + (S.fngK ? S.fngK.length : 0) + ":" + S.histW.length;
    S.pastD = S.pastD || {}; if (S.pastD[c.id] && S.pastD[c.id].key === key) return S.pastD[c.id].rows;
    var X = cmPre(), cm = S.cm, end = addDays(c.low, 365), rows = [];
    var wk = S.histW.filter(function (o) { return o.d >= addDays(c.top, -14) && o.d <= addDays(end, 14); }).map(function (o) {
      return { t: dnum(o.d), d: o.d, sthP: o.sth ? o.p / o.sth : null, lthP: o.lth ? o.p / o.lth : null, cvddP: o.cvdd ? o.p / o.cvdd : null, balP: o.bal ? o.p / o.bal : null, loss: o.loss, sopr: o.sopr, rr: o.rr, pL: o.p, fg: o.fg,
        w200L: o.w200 ? o.p / o.w200 : null, mayL: o.mayer ? o.p / o.mayer : null, pi: o.pi, puell: o.puell, dsr: o.dsr };
    });
    if (wk.length < 2) return null;
    var wi = 0;
    for (var d = c.top; d <= end; d = addDays(d, 1)) {
      var j = S.cmIdx[d]; if (j == null) continue;
      var t = dnum(d); while (wi < wk.length - 2 && wk[wi + 1].t <= t) wi++;
      var a = wk[wi], b = wk[wi + 1], f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
      var ip = function (k) { var x = a[k], y = b[k]; return x == null ? (f > 0.5 ? y : null) : y == null ? (f <= 0.5 ? x : null) : x + (y - x) * f; };
      var p = X.P[j], s1400 = X.avg(X.sp, j, 1400), s200 = X.avg(X.sp, j, 200), s471 = X.avg(X.sp, j, 471), i365 = X.avg(X.si, j, 365);
      var r = { d: d, p: p, dly: true, past: true, v: {}, vl: {} };
      r.mvrv = cm[j][2]; r.w200 = s1400 ? p / s1400 : null; r.mayer = s200 ? p / s200 : null;
      r.pi = X.emaAll[j] && s471 ? X.emaAll[j] / (0.745 * s471) : null;
      r.puell = i365 ? X.iss[j] / i365 : null; r.hcap = X.hc[j]; r.dsr = X.rec[j] ? daysBetween(X.rec[j], d) : null;
      r.dsp = daysBetween(X.athA[j][1], d);
      // The daily data starts in June 2013, too late for the long averages in 2014-15 (200 weeks, 471 days, 365 days)
      // and for the last hash-ribbon recovery. There, use the weekly reading, drawn the same way as the cost lines.
      if (r.w200 == null) { var wL = ip("w200L"); r.w200 = wL ? p / wL : null; }
      if (r.mayer == null) { var mL = ip("mayL"); r.mayer = mL ? p / mL : null; }
      if (r.pi == null) r.pi = ip("pi");
      if (r.puell == null) r.puell = ip("puell");
      if (r.dsr == null && a.dsr != null && t >= a.t) r.dsr = a.dsr + daysBetween(a.d, d);
      var sthP = ip("sthP"), lthP = ip("lthP"), cvddP = ip("cvddP"), balP = ip("balP"), rr = ip("rr"), pL = ip("pL");
      r.sth = sthP ? p / sthP : null; r.lth = lthP ? p / lthP : null; r.cvdd = cvddP ? p / cvddP : null; r.bal = balP ? p / balP : null;
      r.loss = ip("loss"); r.sopr = ip("sopr"); r.rr = rr != null && pL ? rr * p / pL : null;
      r.fg = S.fng ? fg7(d) : ip("fg"); r.fund = null; r.oidd = null; r.lo = p;
      rows.push(r);
    }
    S.pastD[c.id] = { key: key, rows: rows };
    return rows;
  }
  function cheapWindows(mode) {
    if (!S.hist) return null;
    mode = mode || S.lv;
    var cf = S.cwc, thr = cf.thr, gapD = cf.gap * 7, rows = S.hist.rows, today = utcToday();
    var out = { past: [], now: [], thr: thr, gap: cf.gap, basis: "weekly" };
    CYCLES.forEach(function (c) {
      var end = c.low ? addDays(c.low, 365) : today, rs = null;
      if (c.low && cf.past === "daily") { rs = pastDaily(c); if (rs) out.basis = "daily"; }
      if (!rs) rs = rows.filter(function (o) { return o.d >= c.top && o.d <= end; });
      var ws = cwFind(rs, mode, thr, gapD);
      if (c.low) {
        // the window around the cycle low (else the first one)
        var w = ws.filter(function (x) { return x.start <= c.low && addDays(x.last, 7) >= c.low; })[0] || ws.filter(function (x) { return x.start <= c.low; }).pop() || ws[0];
        if (!w) { out.past.push({ cyc: c, none: true }); return; }
        w.cyc = c; w.cells = cwCells(w, rs, mode, w.last); w.weeks = w.cells.length;
        w.lowP = c.lowP; w.lowD = c.low; w.lowFirst = c.low < w.start;
        w.fall = w.lowFirst ? null : (c.lowP / w.p0 - 1) * 100;
        w.lowWk = w.lowFirst ? null : Math.floor(daysBetween(w.start, c.low) / 7) + 1;
        out.past.push(w);
      } else {
        var P = liveP();
        ws.forEach(function (w, i) {
          w.cyc = c; w.on = i === ws.length - 1 && daysBetween(w.last, today) <= gapD;
          w.cells = cwCells(w, rs, mode, w.on ? today : w.last); w.weeks = w.cells.length;
          // the lowest price after the first close in the window (intraday lows, and the live price)
          var lo = null, ld = null;
          rs.forEach(function (o) { if (o.d <= w.start) return; var l = o.lo != null ? o.lo : o.p; if (lo == null || l < lo) { lo = l; ld = o.d; } });
          if (P && (lo == null || P < lo)) { lo = P; ld = today; }
          w.lowP = lo; w.lowD = ld; w.fall = lo ? Math.min(0, (lo / w.p0 - 1) * 100) : null;
          w.lowWk = ld && lo < w.p0 ? Math.floor(daysBetween(w.start, ld) / 7) + 1 : null;
          out.now.push(w);
        });
      }
    });
    out.cur = out.now.filter(function (w) { return w.on; })[0] || null;
    return out;
  }
  TIPS.cw = function () {
    var c = S.cwc;
    return "<span class='tt-h'>Cheap window</span>The weeks from the first close with Value " + c.thr + "+ to the last one. A gap below " + c.thr + " of up to " + c.gap + " week" + (c.gap > 1 ? "s" : "") + " does not end a window. <b>Fell after</b> is the fall from that first close to the lowest price after it (for past cycles, the final low). The score can stop saying Cheap before the low is in: in 2022 it was below 60 for three weeks in August, three months before the November low. With three past cycles, compare them. Do not read them as a countdown." +
      "<span class='tt-m'>Past cycles: " + (c.past === "daily" ? "daily closes, rebuilt from Coin Metrics daily data and the weekly LookIntoBitcoin lines (drawn straight between weekly readings). For 2014–15 the 200-week average also comes from the weekly readings, because the daily data starts in 2013" : "one reading a week (Monday close), as in the backtest") + ", from the top to one year after the low. This cycle: daily closes. A week counts as cheap if any close in it was " + c.thr + "+. Uses the levels selected (small-cycle or classic). Change the rules with Settings.</span>";
  };
  function cwPct(v) { return v == null ? "—" : v > -0.05 ? "0%" : "−" + Math.abs(v).toFixed(0) + "%"; }
  function renderWin() {
    var el = $("cw"); if (!el) return;
    var W = cheapWindows(); S.cw = W;
    var cf = S.cwc, sub = $("cw-sub");
    if (sub) sub.textContent = "Value " + cf.thr + "+ · ends after " + cf.gap + " wk below · past cycles " + (W && W.basis === "daily" ? "daily" : "weekly") + " · " + (S.lv === "adj" ? "small-cycle" : "classic") + " levels";
    if (!W || !W.past.length) { el.innerHTML = '<p class="sub" style="margin:0">Loading the history…</p>'; return; }
    var today = utcToday(), cur = W.cur, last = W.now[W.now.length - 1], thr = W.thr;
    var rows = W.past.map(function (w) { return { w: w, lab: w.cyc.low.slice(0, 4) }; });
    W.now.forEach(function (w) { rows.push({ w: w, lab: w.on ? "Now" : MON[+w.start.slice(5, 7) - 1] + " ’" + w.start.slice(2, 4) }); });
    var maxW = Math.max(20, Math.max.apply(null, rows.map(function (r) { return r.w.weeks || 0; })));
    var head;
    if (cur) head = '<b class="cw-wk">Week ' + cur.weeks + '</b><span>of this cheap window · since ' + fd(cur.start) + (cur.last < addDays(today, -1) ? " · last close at " + thr + "+ on " + fd(cur.last) : "") + "</span>";
    else if (last) head = '<b class="cw-wk cw-no">Not in a cheap window</b><span>The last one ended ' + fdy(addDays(last.last, W.gap * 7 + 1)) + " (last close at " + thr + "+ on " + fd(last.last) + ")</span>";
    else head = '<b class="cw-wk cw-no">No cheap window yet</b><span>No close at ' + thr + "+ in this bear market</span>";
    var h = '<div class="cw-now">' + head + "</div>";
    h += '<div class="cw-t"><div class="cw-r cw-hd"><span></span><span>Week by week</span><span class="r">Lasted</span><span class="r">Fell after</span></div>';
    rows.forEach(function (r) {
      var w = r.w, now = !w.cyc.low;
      if (w.none) { h += '<div class="cw-r"><span class="cw-l">' + esc(r.lab) + '</span><span class="cw-none">No close at ' + thr + "+ in this bear market</span><span class=\"r mono\">—</span><span class=\"r mono\">—</span></div>"; return; }
      var cells = "";
      w.cells.forEach(function (v, i) {
        var cls = v == null ? "na" : v >= thr ? "ch" : "";
        if (w.lowWk === i + 1) cls += " low";
        if (w.on && i === w.cells.length - 1) cls += " cur";
        cells += '<i class="' + cls + '"' + (v != null && v >= thr ? ' style="background:' + bandCol(v) + '"' : "") + "></i>";
      });
      var cheapN = w.cells.filter(function (v) { return v != null && v >= thr; }).length;
      var tip = "<span class='tt-h'>" + (now ? (w.on ? "This cheap window" : "Earlier window, this bear market") : esc(w.cyc.name) + " bear market") + "</span>" +
        fdy(w.start) + (w.on ? " to now" : " to " + fdy(w.last)) + ": " + (w.on ? "week " + w.weeks : w.weeks + " week" + (w.weeks > 1 ? "s" : "")) + ", Value " + thr + "+ in " + cheapN + " of them." +
        "<br>First close at " + thr + "+: <b>" + usd(w.p0) + "</b> (" + fd(w.start) + ")." +
        (now ? "<br>Lowest price since: <b>" + usd(w.lowP) + "</b>" + (w.lowD ? " (" + fd(w.lowD) + ")" : "") + ", " + (w.fall < -0.05 ? Math.abs(w.fall).toFixed(1) + "% lower so far." : "no lower so far.")
          : w.lowFirst ? "<br>The cycle low (" + usd(w.lowP) + ", " + fdy(w.lowD) + ") came " + Math.round(daysBetween(w.lowD, w.start) / 7) + " weeks before this window began."
          : "<br>Cycle low: <b>" + usd(w.lowP) + "</b> on " + fdy(w.lowD) + ", week " + w.lowWk + " of the window: " + Math.abs(w.fall).toFixed(1) + "% below the first close at " + thr + "+.");
      h += '<div class="cw-r' + (w.on ? " on" : "") + '" tabindex="0" data-tip="' + attrHtml(tip) + '"><span class="cw-l">' + esc(r.lab) + '</span><span class="cw-s" style="--n:' + maxW + '">' + cells + '</span><span class="r mono">' + (w.on ? "wk " + w.weeks : w.weeks + " wk") + '</span><span class="r mono">' + (w.lowFirst ? "low first" : cwPct(w.fall)) + (now ? '<small class="muted">so far</small>' : "") + "</span></div>";
    });
    h += "</div>";
    var key = "";
    for (var bi = bandIdx(thr); bi < BANDS.length; bi++) { var lo2 = Math.max(thr, BANDS[bi].lo); key += '<span><i style="background:var(--b' + bi + ')"></i>' + (bi === BANDS.length - 1 ? lo2 + "+" : lo2 + "–" + BANDS[bi].hi) + " " + esc(BANDS[bi].name) + "</span>"; }
    h += '<div class="cw-k" role="note" aria-label="Key"><span class="cw-k-t">Key</span>' + key + '<span><i></i>Below ' + thr + '</span><span><i class="low"></i>Week of the low</span><span><i class="cur-k"></i>This week</span><span class="cw-k-n">One square is one week, coloured by its highest Value.</span></div>';
    var ok = W.past.filter(function (w) { return !w.none; }), lens = ok.map(function (w) { return w.weeks; });
    var lw = W.past.map(function (w) { var y = w.cyc.low.slice(0, 4); return w.none ? y + ": no window" : w.lowFirst ? y + ": before the window" : y + ": week " + w.lowWk; });
    if (lens.length) h += '<p class="cw-f">Not a countdown. Past windows lasted ' + (lens.length > 1 ? Math.min.apply(null, lens) + " to " + Math.max.apply(null, lens) : lens[0]) + " weeks. The low came in " + lw.join(", ") + ".</p>";
    el.innerHTML = h;
  }
  // settings panel
  (function () {
    var b = $("cw-set-b"), p = $("cw-set"); if (!b || !p) return;
    function sync() {
      var c = S.cwc;
      $("cw-thr").value = c.thr; $("cw-thr-o").textContent = c.thr + " · " + bandName(c.thr);
      $("cw-gap").value = c.gap; $("cw-gap-o").textContent = c.gap + " week" + (c.gap > 1 ? "s" : "");
      Array.prototype.forEach.call(document.querySelectorAll("#cw-past button"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-p") === c.past ? "true" : "false"); });
      Array.prototype.forEach.call(document.querySelectorAll("#cw-lv button"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-l") === S.lv ? "true" : "false"); });
    }
    function save() { sset("bbm.cw", JSON.stringify(S.cwc)); sync(); renderWin(); renderVerdict(); }
    b.addEventListener("click", function () { var on = p.hidden; p.hidden = !on; b.setAttribute("aria-expanded", on ? "true" : "false"); sync(); });
    $("cw-thr").addEventListener("input", function () { S.cwc.thr = +this.value; save(); });
    $("cw-gap").addEventListener("input", function () { S.cwc.gap = +this.value; save(); });
    $("cw-past").addEventListener("click", function (e) { var x = e.target.closest("button"); if (!x) return; S.cwc.past = x.getAttribute("data-p"); save(); });
    $("cw-lv").addEventListener("click", function (e) { var x = e.target.closest("button"); if (!x) return; var l = x.getAttribute("data-l"); var lb = document.querySelector('#lv button[data-l="' + l + '"]'); if (lb) lb.click(); sync(); });
    $("cw-def").addEventListener("click", function () { S.cwc = { thr: 60, gap: 12, past: "daily" }; try { localStorage.removeItem("bbm.cw"); } catch (e) {} sync(); renderWin(); renderVerdict(); });
    window.__cwSync = sync;
  })();

  // ---------- since a past close: what changed ----------
  S.since = sget("bbm.since") || "7";
  function sinceRef() {
    var today = utcToday(), d;
    if (S.since === "thu") { d = addDays(today, -1); while (new Date(d + "T00:00:00Z").getUTCDay() !== 4) d = addDays(d, -1); }
    else d = addDays(today, -(+S.since || 7));
    return d;
  }
  function renderSince() {
    var el = $("since-t"); if (!el || !S.latest) return;
    var d = sinceRef(), row = null;
    (S.dr || []).forEach(function (o) { if (o.d === d) row = o; });
    if (!row && S.hist) { row = histNear(d, 4); }
    if (!row) { el.textContent = "No reading for that day yet."; $("since-d").textContent = ""; return; }
    $("since-d").textContent = "(" + fd(row.d) + " close)";
    var P = liveP(), v1 = P ? scoreAt(P) : closeParts().total, v0 = histVal(row), b1 = S.biNow && S.biNow.s, b0 = row.bi, p1 = P || S.latest.price, p0 = row.p, bits = [];
    bits.push("Value <b>" + Math.round(v0) + " → " + Math.round(v1) + "</b>" + (bandName(v0) !== bandName(v1) ? " (" + bandName(v0) + " → " + bandName(v1) + ")" : ""));
    if (b0 != null && b1 != null) bits.push("Bottom in? <b>" + Math.round(b0) + " → " + Math.round(b1) + "</b>");
    bits.push("BTC <b>" + usd(p0) + " → " + usd(p1) + "</b> (" + sgn((p1 / p0 - 1) * 100, 1) + "%)");
    var W = S.cw, g = S.cwc.gap * 7, today = utcToday();
    if (W && W.cur && W.cur.start > row.d) bits.push("a cheap window began " + fd(W.cur.start));
    if (W) W.now.forEach(function (w) { var e = addDays(w.last, g + 1); if (!w.on && e > row.d && e <= today) bits.push("the cheap window ended " + fd(e)); });
    var cl = cycleLowNow(P); if (cl.ld && cl.ld > row.d) bits.push("new cycle low " + usd(cl.lo) + " on " + fd(cl.ld));
    el.innerHTML = bits.join(" · ");
  }
  (function () { var s = $("since-sel"); if (!s) return; s.value = S.since; s.addEventListener("change", function () { S.since = s.value; sset("bbm.since", S.since); renderSince(); }); })();

  // ---------- price cross-check: Coin Metrics close against the Bybit daily close ----------
  function xCheck() {
    if (!S.cm || !S.ohlc) return null; var bad = null, n = 0;
    for (var i = S.cm.length - 1; i >= 0 && n < 5; i--) {
      var d = S.cm[i][0], o = S.ohlc[d]; if (!o || !o.c) continue; n++;
      var g = Math.abs(S.cm[i][1] / o.c - 1) * 100; if (g > 2 && (!bad || g > bad.g)) bad = { d: d, g: g, a: S.cm[i][1], b: o.c };
    }
    return bad;
  }
  TIPS.xchk = "<span class='tt-h'>Price cross-check</span>The page compares the Coin Metrics daily close with the Bybit daily close for the last five days. They are normally within a fraction of a percent. A gap of more than 2% means one feed may be wrong, so treat the scores with care until it clears.";

  // ---------- alerts for the daily task: what crossed between the last two daily closes ----------
  function pubAlerts() {
    var dr = S.dr, out = { ok: !!(dr && S.mode === "live"), msgs: [] };
    if (!out.ok) return out;
    var rows = dr.filter(function (o) { return !o.live; }), a = rows[rows.length - 1], b = rows[rows.length - 2], P = liveP(), today = utcToday();
    if (!a || !b) { out.ok = false; return out; }
    var va = histVal(a), vb = histVal(b);
    out.date = a.d; out.value = Math.round(va); out.bi = a.bi == null ? null : Math.round(a.bi); out.price = Math.round(P || a.p); out.liveValue = P ? Math.round(scoreAt(P)) : null;
    out.levels = S.lv; out.window = S.cwc;
    [75, 90].forEach(function (t) {
      if (va >= t && vb < t) out.msgs.push("Value rose to " + Math.round(va) + " (" + bandName(va) + ", above " + t + ")");
      if (va < t && vb >= t) out.msgs.push("Value fell to " + Math.round(va) + " (below " + t + ")");
    });
    if (a.bi != null && b.bi != null) [25, 50, 75].forEach(function (t) {
      if (a.bi >= t && b.bi < t) out.msgs.push("Bottom in? rose to " + Math.round(a.bi) + " (" + biName(a.bi) + ", above " + t + ")");
      if (a.bi < t && b.bi >= t) out.msgs.push("Bottom in? fell to " + Math.round(a.bi) + " (below " + t + ")");
    });
    var W = cheapWindows(), g = S.cwc.gap * 7;
    if (W) {
      if (W.cur && W.cur.start > b.d) out.msgs.push("A cheap window began on " + fd(W.cur.start) + " (Value " + W.thr + "+)");
      W.now.forEach(function (w) { var e = addDays(w.last, g + 1); if (!w.on && e > b.d && e <= today) out.msgs.push("The cheap window ended: no close at " + W.thr + "+ for " + S.cwc.gap + " weeks (last on " + fd(w.last) + ")"); });
      if (W.cur) out.week = W.cur.weeks;
    }
    if (a.dsl === 0 && b.low > a.low) out.msgs.push("New cycle low: " + usd(a.low) + " on " + fd(a.d));
    if (P && P < a.low) out.msgs.push("BTC is below the cycle low now (" + usd(P) + ", low " + usd(a.low) + ")");
    var x = xCheck(); if (x) out.msgs.push("Price feeds disagree by " + x.g.toFixed(1) + "% on " + fd(x.d) + ": check the data");
    return out;
  }

  // ---------- colours panel ----------
  (function () {
    var B = window.BVMPrefs, pop = $("pal"), btn = $("pal-b"); if (!B || !pop || !btn) return;
    var cur = B.load(); if (S.cb) cur = { id: "cb" };
    var cust = cur.id === "custom" ? cur.c : { lo: "#E5484D", mid: "#EEE8DF", hi: "#2F7FE0", useMid: true, fit: true, steps: null };
    function light() { return document.documentElement.getAttribute("data-light") === "1"; }
    function strip(a) { return '<span class="pal-strip">' + a.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>"; }
    function chk(a) { var r = B.check(a); return '<span class="pal-ok ' + r.word.toLowerCase() + '" title="Smallest step difference for red-green colour blindness">' + r.word + " for colour blindness</span>"; }
    function choose(o) {
      cur = o;
      if (o.id === "cb") { S.cb = true; sset("bbm.cb", "1"); B.save({ id: "cb" }); B.apply({ id: "default" }); }
      else { S.cb = false; sset("bbm.cb", "0"); B.save(o); B.apply(o); }
      applySkin(); build();
    }
    function custSteps() { return cust.steps && cust.steps.length === 6 ? cust.steps : B.gen(cust.lo, cust.useMid ? cust.mid : null, cust.hi); }
    function build() {
      var L = light(), h = '<div class="pop-h"><b>Colours</b><button type="button" class="btn sm" id="pal-x">Close</button></div>' +
        '<p class="sub" style="margin:0">Score colours run from not cheap (left) to cheap (right). Pick a pairing, or make your own. Saved in this browser.</p><div class="pal-list">';
      B.PRESETS.forEach(function (p) {
        var a = (L ? p.light : p.dark);
        h += '<button type="button" class="pal-p" data-id="' + p.id + '" aria-pressed="' + (cur.id === p.id ? "true" : "false") + '"><span class="pal-n">' + esc(p.name) + "</span>" + strip(a) + '<span class="pal-t">' + esc(p.note) + " " + chk(a) + "</span></button>";
      });
      var cs = custSteps(), shown = cust.fit === false ? cs : cs.map(function (c) { return B.fit(c, L); });
      h += '</div><details class="pal-c"' + (cur.id === "custom" ? " open" : "") + '><summary>Make your own</summary><div class="pal-in">' +
        '<label>Not cheap <input type="color" id="pc-lo" value="' + cust.lo + '"></label>' +
        '<label>Middle <input type="color" id="pc-mid" value="' + cust.mid + '"' + (cust.useMid ? "" : " disabled") + '></label>' +
        '<label>Cheap <input type="color" id="pc-hi" value="' + cust.hi + '"></label></div>' +
        '<label class="chk"><input type="checkbox" id="pc-um"' + (cust.useMid ? " checked" : "") + '> Pass through a light middle (best for two very different colours)</label>' +
        '<div class="pal-steps">' + shown.map(function (c, i) { return '<input type="color" data-i="' + i + '" value="' + c.toLowerCase() + '" aria-label="Step ' + (i + 1) + '">'; }).join("") + "</div>" +
        '<div class="pal-row">' + chk(shown) + '<label class="chk"><input type="checkbox" id="pc-fit"' + (cust.fit === false ? "" : " checked") + "> Keep steps readable on this skin</label></div>" +
        '<button type="button" class="btn" id="pc-use">' + (cur.id === "custom" ? "Using your colours" : "Use my colours") + "</button></details>" +
        '<div class="pop-f"><button type="button" class="btn sm" id="pal-def">Back to default</button><button type="button" class="btn sm" id="pal-link">Copy setup link</button></div>';
      pop.innerHTML = h;
    }
    function open(on) { pop.hidden = !on; btn.setAttribute("aria-expanded", on ? "true" : "false"); if (on) { build(); var f = pop.querySelector(".pal-p[aria-pressed='true']") || pop.querySelector("button"); if (f) f.focus(); } }
    btn.addEventListener("click", function () { open(pop.hidden); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
    document.addEventListener("pointerdown", function (e) { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) open(false); });
    function useCustom() { choose({ id: "custom", c: JSON.parse(JSON.stringify(cust)) }); var d = pop.querySelector(".pal-c"); if (d) d.open = true; }
    pop.addEventListener("click", function (e) {
      var p = e.target.closest(".pal-p"); if (p) { choose({ id: p.getAttribute("data-id") }); return; }
      var t = e.target.closest("button"); if (!t) return;
      if (t.id === "pal-x") open(false);
      else if (t.id === "pal-def") choose({ id: "default" });
      else if (t.id === "pc-use") useCustom();
      else if (t.id === "pal-link") copyLink(t);
    });
    var tmr = null;
    pop.addEventListener("input", function (e) {
      var t = e.target;
      if (t.id === "pc-lo" || t.id === "pc-mid" || t.id === "pc-hi") { cust[t.id.slice(3)] = t.value.toUpperCase(); cust.steps = null; }
      else if (t.id === "pc-um") cust.useMid = t.checked;
      else if (t.id === "pc-fit") cust.fit = t.checked;
      else if (t.hasAttribute("data-i")) { var s = Array.prototype.map.call(pop.querySelectorAll(".pal-steps input"), function (x) { return x.value.toUpperCase(); }); cust.steps = s; cust.fit = false; }
      else return;
      clearTimeout(tmr); tmr = setTimeout(useCustom, 120);
    });
    $("cb").addEventListener("click", function () { choose(S.cb ? { id: "default" } : { id: "cb" }); });
  })();
  function copyLink(b) {
    var u = window.BVMPrefs ? window.BVMPrefs.setupLink() : location.href, t0 = b.textContent;
    function done(ok) { b.textContent = ok ? "Link copied" : "Copy failed: see the address bar"; if (!ok) try { history.replaceState(null, "", u); } catch (e) {} setTimeout(function () { b.textContent = t0; }, 2500); }
    try { navigator.clipboard.writeText(u).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  }
  if (window.BVMPrefs && window.BVMPrefs.imported) setTimeout(function () { var t = $("fresh-t"); if (t) { var o = t.textContent; t.textContent = "Layout and colours loaded from the link"; setTimeout(function () { if (S.latest) renderHeader(); }, 4000); } }, 1500);

  // ---------- cycle clock ----------
  var CLK = {
    dTop: { label: "Days since the top", past: [406, 364, 378], min: 0, max: 600, fmt: function (v) { return Math.round(v) + " d"; } },
    dHalv: { label: "Days since the halving", past: [777, 889, 924], min: 0, max: 1460, fmt: function (v) { return Math.round(v) + " d"; } },
    fall: { label: "Fall from the top", past: [-86.6, -84.1, -77.1], trend: -73.1, min: 0, max: -90, fmt: function (v) { return "−" + Math.abs(v).toFixed(1) + "%"; } },
    mvrv: { label: "MVRV", past: [0.56, 0.69, 0.75], trend: 0.85, min: 2.0, max: 0.5, fmt: function (v) { return v.toFixed(2); } },
    below: { label: "Days below realized price", past: [304, 134, 179], min: 0, max: 365, fmt: function (v) { return Math.round(v) + " d"; } }
  };
  var CLK_ORDER = ["dTop", "dHalv", "fall", "mvrv", "below"];
  TIPS["clk-dTop"] = "<span class='tt-h'>Days since the top</span>Days since the all-time high close (6 Oct 2025). Past lows (lowest intraday price) came 406 (2015), 364 (2018) and 378 (2022) days after the top.";
  TIPS["clk-dHalv"] = "<span class='tt-h'>Days since the halving</span>Days since the April 2024 halving. Past lows came 777 (2015), 889 (2018) and 924 (2022) days after the halving before them. The gap has grown each cycle.";
  TIPS["clk-fall"] = "<span class='tt-h'>Fall from the top</span>Live price against the all-time high close ($124,824). Past lows (lowest intraday price): −86.6% (2015), −84.1% (2018), −77.1% (2022). The trend of past lows points to about −73% this cycle (about $34k). Treat the trend as a rough guide: three points only. The caption shows the deepest fall so far this cycle.";
  TIPS["clk-mvrv"] = "<span class='tt-h'>MVRV</span>Live price against the realized price (what all holders paid on average). Past lows: 0.56 (2015), 0.69 (2018), 0.75 (2022). The trend of past lows points to about 0.85 this cycle.";
  TIPS["clk-below"] = "<span class='tt-h'>Days below realized price</span>Days in this bear market with price below the realized price (MVRV under 1). Past bear markets: 304 (2015), 134 (2018) and 179 (2022) days. No past low came without a long stay below it.";
  function clockNow() {
    var P = liveP() || (S.latest && S.latest.price), today = todayCbr(), o = {};
    o.dTop = daysBetween(NOWC.top, today);
    o.dHalv = daysBetween(HALV[3], today);
    o.fall = P ? (P / NOWC.topP - 1) * 100 : null;
    var rp = S.latest && S.latest.ref && S.latest.ref.realizedPrice;
    o.mvrv = P && rp ? P / rp : null;
    var n = null;
    if (S.cm) { n = 0; var i0 = S.cmIdx[NOWC.top]; if (i0 != null) for (var i = i0; i < S.cm.length; i++) if (S.cm[i][2] < 1) n++; if (o.mvrv != null && o.mvrv < 1 && S.cm[S.cm.length - 1][0] < addDays(today, -1)) n++; }
    o.below = n;
    return o;
  }
  function clockStatus(k, v) {
    var c = CLK[k], lo = Math.min.apply(null, c.past), hi = Math.max.apply(null, c.past);
    if (v == null) return "—";
    if (k === "dTop" || k === "dHalv") return v < lo ? "Before the past lows" : v <= hi ? "In the window of past lows" : "Past all three lows";
    if (k === "fall") return v > hi ? "Not as deep as past lows" : v >= lo ? "As deep as past lows" : "Deeper than past lows";
    if (k === "mvrv") return v > hi ? "Above all three lows" : v >= lo ? "In the range of past lows" : "Below all three lows";
    if (k === "below") return v === 0 ? "None yet" : v < lo ? "Shorter than past bears" : "As long as past bears";
    return "";
  }
  function clockPast(k) {
    var c = CLK[k], yr = ["’15", "’18", "’22"], pre = "";
    if (k === "fall") { var cl = cycleLowNow(liveP()); if (cl.lo) pre = "Low so far −" + Math.abs((cl.lo / NOWC.topP - 1) * 100).toFixed(1) + "% (" + fd(cl.ld) + ") · "; }
    return pre + c.past.map(function (pv, i) { return yr[i] + " " + c.fmt(pv).replace(" d", ""); }).join(" · ") + (k === "dTop" || k === "dHalv" || k === "below" ? " d" : "") + (c.trend != null ? " · trend " + c.fmt(c.trend) : "");
  }
  function clockSvg(k, v) {
    var c = CLK[k], cx = 100, cy = 100, r = 74;
    function t(x) { return Math.max(0, Math.min(100, (x - c.min) / (c.max - c.min) * 100)); }
    var ts = c.past.map(t), a = Math.min.apply(null, ts), b = Math.max.apply(null, ts);
    var g = '<svg viewBox="0 0 200 118" role="img" aria-label="' + esc(c.label + ": " + (v == null ? "no data" : c.fmt(v)) + ". " + clockStatus(k, v)) + '">';
    g += '<path d="' + arc(0, 100, r, cx, cy) + '" fill="none" stroke="var(--surf2)" stroke-width="12" stroke-linecap="round"/>';
    g += '<path d="' + arc(a, Math.max(b, a + 0.8), r, cx, cy) + '" fill="none" stroke="var(--b3)" stroke-width="12" opacity=".55"/>';
    c.past.forEach(function (pv) {
      var p1 = pt(t(pv), r - 9, cx, cy), p2 = pt(t(pv), r + 9, cx, cy);
      g += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="var(--ink)" stroke-width="1.5" opacity=".8"/>';
    });
    if (c.trend != null) { var tp = pt(t(c.trend), r, cx, cy); g += '<rect x="' + (tp[0] - 4.5).toFixed(1) + '" y="' + (tp[1] - 4.5).toFixed(1) + '" width="9" height="9" transform="rotate(45 ' + tp[0].toFixed(1) + " " + tp[1].toFixed(1) + ')" fill="var(--surf)" stroke="var(--accent)" stroke-width="2"/>'; }
    if (v != null) {
      var tv = t(v), e1 = pt(tv, r - 16, cx, cy), e2 = pt(tv, r - 7, cx, cy), d = pt(tv, r, cx, cy);
      g += '<path d="' + arc(0, Math.max(0.5, tv), r, cx, cy) + '" fill="none" stroke="var(--accent)" stroke-width="3" opacity=".55" stroke-linecap="round"/>';
      g += '<line x1="' + e1[0].toFixed(1) + '" y1="' + e1[1].toFixed(1) + '" x2="' + e2[0].toFixed(1) + '" y2="' + e2[1].toFixed(1) + '" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>';
      g += '<circle cx="' + d[0].toFixed(1) + '" cy="' + d[1].toFixed(1) + '" r="6.5" fill="var(--accent)" stroke="var(--surf)" stroke-width="2.5"/>';
    }
    return g + "</svg>";
  }
  function renderClocks() {
    var now = clockNow(), h = "";
    CLK_ORDER.forEach(function (k) {
      var c = CLK[k], v = now[k];
      h += '<div class="clk"><div class="clk-d">' + clockSvg(k, v) + '<b class="clk-v mono">' + (v == null ? "—" : c.fmt(v)) + '</b></div><span class="clk-l"><span class="tip" tabindex="0" data-tipk="clk-' + k + '">' + esc(c.label) + '</span></span><span class="clk-s">' + esc(clockStatus(k, v)) + '</span><span class="clk-p mono">' + esc(clockPast(k)) + "</span></div>";
    });
    $("clocks").innerHTML = h;
    S.clk = now;
  }

  // ---------- verdict line ----------
  function renderVerdict() {
    if (!S.latest) return;
    var P = liveP(), v = P ? scoreAt(P) : parts(S.latest).total, b = S.biNow, c = S.clk || clockNow();
    var yes = v >= 60 ? "Yes" : v >= 40 ? "Getting there" : "No";
    $("vd-value-a").innerHTML = '<span class="pip" style="background:' + bandCol(v) + '"></span>' + esc(yes) + " · " + esc(bandName(v)) + ' <span class="mono">' + Math.round(v) + "</span>";
    $("vd-bi-a").innerHTML = b && b.s != null ? '<span class="pip" style="background:' + biCol(b.s) + '"></span>' + esc(biName(b.s)) + ' <span class="mono">' + Math.round(b.s) + "</span>" : "—";
    $("vd-clock-a").innerHTML = "Day " + c.dTop + " since the top · past lows came on days 364–406";
    var cw = S.cw && S.cw.cur, vs = $("vd-value-s"), pl = S.cw ? S.cw.past.filter(function (w) { return !w.none; }).map(function (w) { return w.weeks; }) : [];
    if (vs) vs.textContent = cw ? "Week " + cw.weeks + " of this cheap window" + (pl.length ? " · past ones lasted " + pl.join(", ") + " weeks" : "") : "";
    renderSince();
  }

  // ---------- signals tabs ----------
  function renderTabs() {
    ["d14", "cyc"].forEach(function (t) {
      var on = S.tab === t; $("tab-" + t).hidden = !on;
      var b = $("tab-btn-" + t); b.setAttribute("aria-selected", on ? "true" : "false"); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (S.tab === "cyc") renderCyc();
  }
  $("sig-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.tab = b.getAttribute("data-t"); sset("bbm.tab", S.tab); renderTabs();
  });

  // ---------- versus past cycles ----------
  var CYC_STYLE = { c14: { col: "var(--muted)", dash: "2 4", w: 1.75 }, c18: { col: "var(--muted)", dash: "7 5", w: 2 }, c22: { col: "var(--ink)", dash: "", w: 2, op: 0.7 }, now: { col: "var(--accent)", dash: "", w: 3.25 } };
  var CYC_M = { fall: "Fall from the top", value: "Value score", bi: "Bottom in" };
  function cycVal(o, c, m) {
    if (m === "fall") return (o.p / c.topP - 1) * 100;
    if (m === "value") return histVal(o);
    return o.bi;
  }
  function cycLive(m) {
    var P = liveP() || (S.latest && S.latest.price);
    if (m === "fall") return P ? (P / NOWC.topP - 1) * 100 : null;
    if (m === "value") return P ? scoreAt(P) : null;
    return S.biNow ? S.biNow.s : null;
  }
  function cycSeries(c, m) {
    var out = [], end = addDays(c.top, 820);
    if (!S.hist) return out;
    S.hist.rows.forEach(function (o) { if (o.d >= c.top && o.d <= end && !o.live) { var v = cycVal(o, c, m); if (v != null) out.push({ x: daysBetween(c.top, o.d), y: v, d: o.d }); } });
    if (c.id === "now") { var lv = cycLive(m); if (lv != null) out.push({ x: daysBetween(c.top, todayCbr()), y: lv, d: todayCbr(), live: true }); }
    return out;
  }
  function renderCyc() {
    Array.prototype.forEach.call(document.querySelectorAll("#cyc-metric button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === S.cycM ? "true" : "false"); });
    $("cyc-2014").checked = S.c14;
    if (!S.hist) { $("cyc-note").textContent = "Loading the weekly history…"; return; }
    renderCycChart(); renderCycTable();
  }
  function renderCycChart() {
    var m = S.cycM, box = $("cyc-chart"), W = Math.max(300, box.clientWidth || 800), H = W >= 900 ? 330 : W >= 600 ? 280 : 240;
    var ml = 40, mr = 16, mt = 14, mb = 28, iw = W - ml - mr, ih = H - mt - mb, X0 = 0, X1 = 800;
    var ylo = m === "fall" ? -90 : 0, yhi = m === "fall" ? 0 : 100;
    function X(x) { return ml + (x - X0) / (X1 - X0) * iw; }
    function Y(y) { return mt + (1 - (y - ylo) / (yhi - ylo)) * ih; }
    var g = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(CYC_M[m]) + ' by days since each cycle top">';
    var ticks = m === "fall" ? [0, -20, -40, -60, -80] : [0, 25, 50, 75, 100];
    if (m === "value") [[90, 100, 5, .12], [75, 90, 4, .09], [60, 75, 3, .07]].forEach(function (z) { g += '<rect x="' + ml + '" y="' + Y(z[1]).toFixed(1) + '" width="' + iw + '" height="' + (Y(z[0]) - Y(z[1])).toFixed(1) + '" fill="var(--b' + z[2] + ')" opacity="' + z[3] + '"/>'; });
    if (m === "bi") [[75, 100, 5, .1], [50, 75, 3, .08]].forEach(function (z) { g += '<rect x="' + ml + '" y="' + Y(z[1]).toFixed(1) + '" width="' + iw + '" height="' + (Y(z[0]) - Y(z[1])).toFixed(1) + '" fill="var(--b' + z[2] + ')" opacity="' + z[3] + '"/>'; });
    ticks.forEach(function (t) { g += '<line x1="' + ml + '" x2="' + (ml + iw) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="' + (t === (m === "fall" ? 0 : 0) ? "0" : "3 4") + '"/><text x="' + (ml - 6) + '" y="' + Y(t).toFixed(1) + '" text-anchor="end" dominant-baseline="middle">' + (m === "fall" ? (t === 0 ? "0" : "−" + Math.abs(t) + "%") : t) + "</text>"; });
    for (var x = 0; x <= 800; x += 100) g += '<text x="' + X(x).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + (x === 0 ? "top" : x) + "</text>";
    var dNow = daysBetween(NOWC.top, todayCbr());
    g += '<line x1="' + X(dNow).toFixed(1) + '" x2="' + X(dNow).toFixed(1) + '" y1="' + mt + '" y2="' + (mt + ih) + '" stroke="var(--accent)" stroke-dasharray="2 3" opacity=".7"/>';
    g += '<text x="' + (X(dNow) + 5).toFixed(1) + '" y="' + (mt + 10) + '" style="fill:var(--accent)">day ' + dNow + "</text>";
    var lines = CYCLES.filter(function (c) { return c.id !== "c14" || S.c14; }), all = [], labs = [];
    lines.forEach(function (c) {
      var sr = cycSeries(c, m), st = CYC_STYLE[c.id]; if (sr.length < 2) return;
      all.push({ c: c, sr: sr });
      g += '<polyline fill="none" stroke="' + st.col + '" stroke-width="' + st.w + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : "") + (st.op ? ' opacity="' + st.op + '"' : "") + ' stroke-linejoin="round" stroke-linecap="round" points="' + sr.map(function (p) { return X(p.x).toFixed(1) + "," + Y(p.y).toFixed(1); }).join(" ") + '"/>';
      if (c.low) {
        var lx = daysBetween(c.top, c.low), near = sr.reduce(function (a, p) { return Math.abs(p.x - lx) < Math.abs(a.x - lx) ? p : a; }, sr[0]);
        g += '<circle cx="' + X(lx).toFixed(1) + '" cy="' + Y(near.y).toFixed(1) + '" r="4.5" fill="var(--surf)" stroke="' + st.col + '" stroke-width="2"/>';
        g += '<text x="' + X(lx).toFixed(1) + '" y="' + (Y(near.y) + (m === "fall" ? 15 : -9)).toFixed(1) + '" text-anchor="middle" style="font-size:10px">' + esc(c.short) + " low</text>";
      }
      var last = sr[sr.length - 1];
      if (c.id === "now") g += '<circle cx="' + X(last.x).toFixed(1) + '" cy="' + Y(last.y).toFixed(1) + '" r="6" fill="var(--accent)" stroke="var(--surf)" stroke-width="2.5"/>';
      var anc = X(last.x) + 6 > ml + iw - 40 ? "end" : "start";
      labs.push({ x: anc === "end" ? X(last.x) - 8 : X(last.x) + 6, y: Y(last.y) + (c.id === "now" ? -10 : 4), anc: anc, col: st.col, t: c.id === "now" ? "Now" : c.name });
    });
    labs.sort(function (a, b) { return a.y - b.y; });
    for (var li = 1; li < labs.length; li++) if (labs[li].anc === labs[li - 1].anc && Math.abs(labs[li].x - labs[li - 1].x) < 60 && labs[li].y - labs[li - 1].y < 13) labs[li].y = labs[li - 1].y + 13;
    labs.forEach(function (l) { g += '<text x="' + l.x.toFixed(1) + '" y="' + Math.min(mt + ih - 2, Math.max(mt + 10, l.y)).toFixed(1) + '" text-anchor="' + l.anc + '" style="fill:' + l.col + ';font-weight:600">' + esc(l.t) + "</text>"; });
    g += '<line id="cxh" x1="0" x2="0" y1="' + mt + '" y2="' + (mt + ih) + '" stroke="var(--muted)" stroke-dasharray="3 3" style="display:none"/></svg>';
    var tip = $("cyc-tip"); box.innerHTML = g; box.appendChild(tip);
    S.cgeo = { X: X, ml: ml, iw: iw, W: W, all: all, m: m };
  }
  function cycPointer(e) {
    var G = S.cgeo; if (!G) return;
    var r = $("cyc-chart").getBoundingClientRect(), px = e.clientX - r.left;
    if (px < G.ml - 6 || px > G.ml + G.iw + 6) { cycHide(); return; }
    var day = (px - G.ml) / G.iw * 800, h = '<span class="muted">Day ' + Math.round(day) + " after the top</span>";
    G.all.forEach(function (L) {
      var best = null, bd = 1e9; L.sr.forEach(function (p) { var dd = Math.abs(p.x - day); if (dd < bd) { bd = dd; best = p; } });
      if (best && bd <= 10) h += "<span>" + esc(L.c.id === "now" ? "Now" : L.c.name) + ' <b class="mono">' + (G.m === "fall" ? "−" + Math.abs(best.y).toFixed(1) + "%" : Math.round(best.y)) + "</b>" + (best.live ? " (live)" : "") + "</span>";
    });
    var tip = $("cyc-tip"); tip.innerHTML = h; tip.style.display = "flex";
    var xh = document.getElementById("cxh"); if (xh) { xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.style.display = ""; }
    var tw = tip.offsetWidth, left = px + 12; if (left + tw > G.W) left = px - tw - 12;
    tip.style.left = Math.max(0, left) + "px"; tip.style.top = "8px";
  }
  function cycHide() { $("cyc-tip").style.display = "none"; var xh = document.getElementById("cxh"); if (xh) xh.style.display = "none"; }
  $("cyc-chart").addEventListener("pointermove", cycPointer);
  $("cyc-chart").addEventListener("pointerdown", cycPointer);
  $("cyc-chart").addEventListener("pointerleave", cycHide);
  $("cyc-metric").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.cycM = b.getAttribute("data-m"); sset("bbm.cycm", S.cycM); renderCyc(); });
  $("cyc-2014").addEventListener("change", function () { S.c14 = this.checked; sset("bbm.c14", S.c14 ? "1" : "0"); renderCyc(); });

  function renderCycTable() {
    var dNow = daysBetween(NOWC.top, todayCbr()), c18 = CYCLES[1], c22 = CYCLES[2];
    var cols = [
      { h: "Now", hs: "Now", sub: "day " + dNow, kind: "live" },
      { h: "2017–18", hs: "’18", sub: "day " + dNow, row: histNear(addDays(c18.top, dNow)), c: c18 },
      { h: "2021–22", hs: "’22", sub: "day " + dNow, row: histNear(addDays(c22.top, dNow)), c: c22 },
      { h: "2018 low", hs: "’18 low", sub: fd(c18.low), row: histLowRow(c18.low), c: c18, low: true },
      { h: "2022 low", hs: "’22 low", sub: fd(c22.low), row: histLowRow(c22.low), c: c22, low: true }
    ];
    var P = liveP() || S.latest.price, lp = parts(S.latest, liveRaw(S.latest, P)), lraw = liveRaw(S.latest, P);
    function cell(v, col, txt, tip) {
      if (v == null) return '<td class="cc na">—</td>';
      return '<td class="cc"><span class="cv tip" tabindex="0" data-tip="' + esc(tip) + '" style="background:' + col + ";color:" + txtOn(/^#/.test(col) ? col : "#888888") + '">' + esc(txt) + "</span></td>";
    }
    var h = "<thead><tr><th>Measure</th>" + cols.map(function (c) { return '<th class="r"><span class="hs">' + esc(c.h) + '</span><span class="ss">' + esc(c.hs) + '</span><span class="th-sub">' + esc(c.sub) + "</span></th>"; }).join("") + "</tr></thead><tbody>";
    // fall
    h += '<tr class="hd"><td>Fall from the top</td>' + cols.map(function (c) {
      var v = c.kind === "live" ? (P / NOWC.topP - 1) * 100 : c.low ? (c.c.lowP / c.c.topP - 1) * 100 : c.row ? (c.row.p / c.c.topP - 1) * 100 : null;
      return v == null ? '<td class="cc na">—</td>' : '<td class="cc mono r">' + "−" + Math.abs(v).toFixed(1) + "%</td>";
    }).join("") + "</tr>";
    // value
    h += '<tr class="hd"><td><span class="tip" tabindex="0" data-tipk="score">Value score</span></td>' + cols.map(function (c) {
      var v = c.kind === "live" ? lp.total : c.row ? histVal(c.row) : null;
      return cell(v, bandCol(v), v == null ? "" : String(Math.round(v)), (c.kind === "live" ? "Live" : "Week of " + fdy(c.row ? c.row.d : "")) + ": value " + (v == null ? "—" : Math.round(v) + " · " + bandName(v)));
    }).join("") + "</tr>";
    // bottom in
    h += '<tr class="hd"><td><span class="tip" tabindex="0" data-tipk="bi">Bottom in</span></td>' + cols.map(function (c) {
      var v = c.kind === "live" ? (S.biNow ? S.biNow.s : null) : c.row ? c.row.bi : null;
      return cell(v, biCol(v), v == null ? "" : String(Math.round(v)), (c.kind === "live" ? "Live" : "Week of " + fdy(c.row ? c.row.d : "")) + ": bottom in " + (v == null ? "—" : Math.round(v) + " · " + biName(v)));
    }).join("") + "</tr>";
    h += '<tr class="sepr"><td colspan="6"></td></tr>';
    IND.forEach(function (ind) {
      h += '<tr><td><span class="tip" tabindex="0" data-tipk="ind-' + ind.k + '">' + esc(ind.name) + "</span></td>" + cols.map(function (c) {
        var v, rd, when;
        if (c.kind === "live") { v = lp.p[ind.k]; rd = ind.read(lraw); when = "Live"; }
        else if (c.row) { var hp = histParts(c.row); v = hp.p[ind.k]; rd = ind.read(rowRaw(c.row)); when = "Week of " + fdy(c.row.d); }
        else { v = null; }
        return cell(v, bandCol(v), v == null ? "" : String(Math.round(v)), (when || "") + ": " + ind.name + " " + (rd || "—") + " → score " + (v == null ? "—" : Math.round(v)));
      }).join("") + "</tr>";
    });
    $("cyc-t").innerHTML = h + "</tbody>";
    $("cyc-note").textContent = "Scores use " + (S.lv === "adj" ? "small-cycle" : "classic") + " levels. Past columns use the weekly reading nearest that day. Leverage data starts in 2023, so it is blank for past cycles. Hover a cell for the reading.";
  }

  // ---------- controls ----------
  var qs = new URLSearchParams(location.search);
  S.skinSel = qs.get("skin") || sget("bbm.skin") || "midnight";
  S.cb = (qs.get("cb") || sget("bbm.cb")) === "1";
  $("skin").value = S.skinSel; if ($("skin").value !== S.skinSel) { S.skinSel = "midnight"; $("skin").value = "midnight"; }
  $("skin").addEventListener("change", function () { S.skinSel = this.value; sset("bbm.skin", S.skinSel); applySkin(); });
  if (!window.BVMPrefs) $("cb").addEventListener("click", function () { S.cb = !S.cb; sset("bbm.cb", S.cb ? "1" : "0"); applySkin(); });
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (S.skinSel === "auto") applySkin(); });
  $("ranges").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.range = +b.getAttribute("data-r");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    renderHistory();
  });
  function applyLv() {
    Array.prototype.forEach.call(document.querySelectorAll("#lv button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-l") === S.lv ? "true" : "false"); });
    $("hl-score").textContent = "Value score at the close, " + (S.lv === "adj" ? "small-cycle" : "classic") + " levels (daily from the Oct 2025 top, weekly before)";
  }
  $("lv").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.lv = b.getAttribute("data-l") === "classic" ? "classic" : "adj"; sset("bbm.levels", S.lv); applyLv();
    shownScore = null; if (S.latest) renderAll();
  });
  applyLv();
  $("win").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.win = +b.getAttribute("data-w"); sset("bbm.win", String(S.win)); renderP2S();
  });
  $("hist").addEventListener("pointermove", histPointer);
  $("hist").addEventListener("pointerdown", histPointer);
  $("hist").addEventListener("pointerleave", hideHistTip);
  function enterKiosk() {
    document.body.classList.add("kiosk");
    var el = document.documentElement; try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) {}
    setTimeout(renderHistory, 300);
  }
  function exitKiosk() {
    document.body.classList.remove("kiosk");
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    setTimeout(renderHistory, 300);
  }
  $("kiosk").addEventListener("click", enterKiosk);
  $("exit-kiosk").addEventListener("click", exitKiosk);
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && document.body.classList.contains("kiosk")) { document.body.classList.remove("kiosk"); setTimeout(renderHistory, 300); } });
  if (qs.get("kiosk") === "1") document.body.classList.add("kiosk");
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  $("save").addEventListener("click", function () {
    var t = $("save-t"); t.textContent = "Saving…"; $("save").classList.add("show-lbl");
    var p = window.htmlToImage ? Promise.resolve() : loadScript("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js");
    p.then(function () {
      var opts = { pixelRatio: 2, backgroundColor: css("--bg"), filter: function (n) { return !(n.hasAttribute && n.hasAttribute("data-nocap")); } };
      return window.htmlToImage.toPng($("cap"), opts).catch(function () { opts.skipFonts = true; return window.htmlToImage.toPng($("cap"), opts); });
    }).then(function (url) {
      var a = document.createElement("a"); a.href = url; a.download = "btc-bottom-monitor-" + todayCbr() + ".png"; document.body.appendChild(a); a.click(); a.remove();
      t.textContent = "Saved";
    }).catch(function () { t.textContent = "Save failed: use a screenshot"; }).then(function () { setTimeout(function () { t.textContent = "Save image"; $("save").classList.remove("show-lbl"); }, 2500); });
  });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { renderHistory(); if (S.tab === "cyc" && S.hist) renderCycChart(); }, 150); });
  function refreshAll() { S.dataAt = Date.now(); loadData(); fetchDaily(); fetchPremium(); fetchFng(); fetchStable(); fetchLev(); fetchCM(); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { fetchPrice(); if (Date.now() - (S.dataAt || 0) > 5 * 60e3) refreshAll(); } });

  // ---------- start ----------
  applySkin();
  // ---------- card views: full, summary, title only ----------
  // Each card can show everything, a short summary, or its title only. The choice is kept in this browser (bbm.cards).
  // When cards change size the board closes the gaps, and cards that share a row move compact ones to a row of their own.
  var CV = { st: {} };
  try { var cvo = JSON.parse(sget("bbm.cards") || "null"); if (cvo && typeof cvo === "object" && !Array.isArray(cvo)) CV.st = cvo; } catch (e) {}
  var CV_V = ["full", "sum", "title"];
  var CV_LBL = { full: "Show all", sum: "Show a summary", title: "Show the title only" };
  var CV_ICON = {
    full: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h5"/></svg>',
    sum: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8" rx="2"/><path d="M4.5 8h7"/></svg>',
    title: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="6" width="13" height="4" rx="1.5"/></svg>'
  };
  function cvCards() { var b = $("board"); return b ? Array.prototype.filter.call(b.children, function (e) { return e.hasAttribute("data-card"); }) : []; }
  function cvDef(c) { return c.getAttribute("data-def") || "full"; }
  function cvGet(c) { var v = CV.st[c.getAttribute("data-card")]; return CV_V.indexOf(v) >= 0 ? v : cvDef(c); }
  function cvSave() { try { if (Object.keys(CV.st).length) localStorage.setItem("bbm.cards", JSON.stringify(CV.st)); else localStorage.removeItem("bbm.cards"); } catch (e) {} }
  function cvSet(c, v) { var id = c.getAttribute("data-card"); if (v === cvDef(c)) delete CV.st[id]; else CV.st[id] = v; cvApply(c); }
  function cvApply(c) {
    var v = cvGet(c); c.setAttribute("data-st", v);
    Array.prototype.forEach.call(c.querySelectorAll(".cst button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === v ? "true" : "false"); });
    var x = c.querySelector(".cx"); if (x) { var l = (v === "full" ? "Show the title only: " : "Show all: ") + (c.getAttribute("data-name") || ""); x.setAttribute("aria-expanded", v === "full" ? "true" : "false"); x.setAttribute("aria-label", l); x.title = v === "full" ? "Collapse" : "Expand"; }
  }
  function cvSyncAll() {
    var vs = cvCards().filter(function (c) { return c.offsetParent !== null; }).map(cvGet), one = vs.length && vs.every(function (v) { return v === vs[0]; }) ? vs[0] : null;
    Array.prototype.forEach.call(document.querySelectorAll("#view-all button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-st") === one ? "true" : "false"); });
  }
  function cvAfter() {
    cvSave(); cvSyncAll(); flowFix(); renderMinis();
    clearTimeout(cvAfter.t); cvAfter.t = setTimeout(function () { try { renderHistory(); if (S.tab === "cyc" && S.hist) renderCycChart(); } catch (e) {} }, 60);
  }
  // cards that share a row (data-grp): if some are compact and some are not, the compact ones move to a row of their own above
  function flowFix() {
    var board = $("board"); if (!board) return;
    var list = cvCards(), on = !board.classList.contains("free") && board.clientWidth >= 760;
    list.forEach(function (c, i) { c.style.order = on ? String(i * 10) : ""; c.classList.remove("grp-c"); });
    Array.prototype.forEach.call(board.querySelectorAll(".grp-br"), function (b) { b.hidden = true; });
    if (!on) return;
    for (var i = 0; i < list.length;) {
      var g = list[i].getAttribute("data-grp"); if (!g) { i++; continue; }
      var j = i; while (j + 1 < list.length && list[j + 1].getAttribute("data-grp") === g) j++;
      var run = list.slice(i, j + 1).filter(function (c) { return c.offsetParent !== null; }), comp = run.filter(function (c) { return cvGet(c) !== "full"; });
      if (comp.length && comp.length === run.length) run.forEach(function (c) { c.classList.add("grp-c"); });
      else if (comp.length) {
        // the compact ones go first, in a row of their own; the full ones share the row below
        comp.forEach(function (c) { c.style.order = String(i * 10 - 6); c.classList.add("grp-c"); });
        var br = board.querySelector('.grp-br[data-g="' + g + '"]');
        if (!br) { br = document.createElement("div"); br.className = "grp-br"; br.setAttribute("data-g", g); br.setAttribute("aria-hidden", "true"); br.setAttribute("data-nocap", ""); board.appendChild(br); }
        br.hidden = false; br.style.order = String(i * 10 - 5);
      }
      i = j + 1;
    }
  }
  // ----- the summary line of each card -----
  function mBar(v, cuts, col) {
    var h = '<span class="mg" aria-hidden="true">';
    for (var i = 0; i < cuts.length - 1; i++) h += '<i style="flex:' + (cuts[i + 1] - cuts[i]) + ";background:var(--b" + col(i) + ')"></i>';
    if (v != null) h += '<u style="left:' + Math.max(0, Math.min(100, v)).toFixed(1) + '%"></u>';
    return h + "</span>";
  }
  function mTxt(e) { return e ? e.textContent.replace(/\?/g, "").replace(/\s+/g, " ").trim() : ""; }
  var MINI = {
    intro: function () {
      var q = document.querySelector("#quad .q.now"); if (!q) return "";
      return "<span>Now: <b>" + esc(mTxt(q.querySelector("b"))) + "</b>. " + esc(mTxt(q.querySelector("span"))) + "</span>";
    },
    value: function () {
      if (!S.latest) return "";
      var P = liveP(), d = closeParts().total, v = P ? scoreAt(P) : d, nx = $("next") && $("next").querySelector("span");
      return '<span class="big">' + Math.round(v) + "</span><span><b>" + esc(bandName(v)) + "</b>" + (P ? " · live · close " + Math.round(d) : "") + "</span>" +
        mBar(v, [0, 20, 40, 60, 75, 90, 100], function (i) { return i; }) + (nx ? "<span>" + esc(mTxt(nx)) + "</span>" : "");
    },
    bi: function () {
      var b = S.biNow; if (!b || b.s == null) return "";
      return '<span class="big">' + Math.round(b.s) + "</span><span><b>" + esc(biName(b.s)) + "</b>" + (b.raw != null ? " · raw " + b.raw.toFixed(1) + " × " + b.gate + " deep-value check" : "") + "</span>" +
        mBar(b.s, [0, 25, 50, 75, 100], function (i) { return BIB[i].col; });
    },
    cbbi: function () {
      var c = S.cbbi; if (!c) return "";
      return '<span class="big">' + Math.round(c.v) + "</span><span><b>" + esc(cbbiZone(c.v)) + "</b> · " + fd(c.asOf) + (c.v30 != null ? " · 30 days ago " + Math.round(c.v30) : "") + "</span>" +
        mBar(c.v, [0, 20, 40, 60, 80, 100], function (i) { return cbbiColIdx(i * 20 + 1); });
    },
    cw: function () {
      var W = S.cw; if (!W || !W.past || !W.past.length) return "";
      var cur = W.cur, last = W.now[W.now.length - 1], ok = W.past.filter(function (w) { return !w.none; });
      var h = cur ? '<span class="big">Week ' + cur.weeks + "</span><span>of this cheap window, since " + fd(cur.start) + "</span>"
        : last ? "<span><b>Not in a cheap window</b> · the last one ended " + fd(addDays(last.last, W.gap * 7 + 1)) + "</span>" : "<span><b>No cheap window yet</b></span>";
      if (ok.length) h += "<span>Past windows: " + ok.map(function (w) { return w.cyc.low.slice(0, 4) + " <b>" + w.weeks + " wk</b>" + (w.lowFirst || w.fall == null ? "" : ", fell " + Math.round(Math.abs(w.fall)) + "% more"); }).join(" · ") + "</span>";
      return h;
    },
    checks: function () {
      var rs = document.querySelectorAll("#bi-ev .ev-r"); if (!rs.length) return "";
      var ok = []; Array.prototype.forEach.call(rs, function (r) { if (r.querySelector(".ev-i.ok")) ok.push(mTxt(r.querySelector(".n"))); });
      var f = document.querySelector("#bi-ev .ev-f");
      return '<span class="big">' + ok.length + " of " + rs.length + "</span><span>checks met" + (ok.length ? ": " + esc(ok.join(", ")) : "") + "</span>" + (f ? "<span>" + esc(mTxt(f)) + "</span>" : "");
    },
    clock: function () {
      var out = []; Array.prototype.forEach.call(document.querySelectorAll("#clocks .clk"), function (k) { out.push("<span>" + esc(mTxt(k.querySelector(".clk-l"))) + ' <b class="mono">' + esc(mTxt(k.querySelector(".clk-v"))) + "</b></span>"); });
      return out.join("");
    },
    hist: function () {
      var se = series().slice(-120); if (se.length < 2) return "";
      var pts = se.map(function (q, i) { return (i / (se.length - 1) * 160).toFixed(1) + "," + (26 - Math.max(0, Math.min(100, q.s)) / 100 * 24).toFixed(1); }).join(" ");
      var hi = Math.max.apply(null, se.map(function (q) { return q.s; })), lo = Math.min.apply(null, se.map(function (q) { return q.s; }));
      var ch = Array.prototype.map.call(document.querySelectorAll("#chips .chip"), function (c) { return esc(mTxt(c.querySelector(".k"))) + ' <b class="mono">' + esc(mTxt(c.querySelector(".v"))) + "</b>"; }).join(" · ");
      return '<svg class="msp" viewBox="0 0 160 28" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="160" y1="' + (26 - 0.6 * 24).toFixed(1) + '" y2="' + (26 - 0.6 * 24).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="3 3"/><polyline fill="none" stroke="var(--accent)" stroke-width="1.8" vector-effect="non-scaling-stroke" points="' + pts + '"/></svg>' +
        "<span>Last " + se.length + " readings: now <b class=\"mono\">" + Math.round(se[se.length - 1].s) + "</b>, high <b class=\"mono\">" + Math.round(hi) + "</b>, low <b class=\"mono\">" + Math.round(lo) + "</b></span>" + (ch ? "<span>" + ch + "</span>" : "");
    },
    sig: function () {
      if (!S.latest) return "";
      var pd = closeParts(), rows = IND.map(function (d) { return { n: d.name, m: pd.p[d.k] }; }).filter(function (r) { return r.m != null; });
      if (!rows.length) return "";
      var n60 = rows.filter(function (r) { return r.m >= 60; }).length; rows.sort(function (a, b) { return b.m - a.m; });
      function li(a) { return a.map(function (r) { return esc(r.n) + ' <b class="mono">' + Math.round(r.m) + "</b>"; }).join(", "); }
      return '<span class="big">' + n60 + " of " + rows.length + "</span><span>signals score 60+ at the close</span><span>Highest: " + li(rows.slice(0, 3)) + "</span><span>Lowest: " + li(rows.slice(-2).reverse()) + "</span>";
    },
    moved: function () {
      var out = [];
      ["mv-live", "mv-day"].forEach(function (id) {
        var e = $(id); if (!e || e.style.display === "none") return;
        var h = e.querySelector(".mv-h"), r = e.querySelector(".mv-r"); if (!h) return;
        out.push("<span>" + esc(mTxt(h.children[0])) + ' <b class="mono">' + esc(mTxt(h.children[1])) + "</b>" + (r ? " · most: " + esc(mTxt(r.querySelector(".n"))) + ' <b class="mono">' + esc(mTxt(r.querySelector(".v"))) + "</b>" : "") + "</span>");
      });
      return out.join("");
    },
    p2s: function () {
      if (!S.latest) return "";
      var P0 = liveP() || S.latest.price, v = scoreAt(P0), out = [];
      [60, 75, 90].forEach(function (t) {
        if (v >= t) return;
        var P = findPrice(P0, t, -1);
        out.push("<span>" + t + " (" + esc(bandName(t)) + ")" + (P ? ' at <b class="mono">' + usd(Math.round(P / 50) * 50) + '</b> <span class="mono">−' + Math.abs((P / P0 - 1) * 100).toFixed(1) + "%</span>" : ": a lower price alone does not get there") + "</span>");
      });
      return out.join("") || "<span>Already in the top band.</span>";
    },
    how: function () { return "<span><b>Value</b>: is BTC cheap against past lows? <b>Bottom in?</b>: has the fall stopped? <b>Cycle clock</b>: where this cycle is in time and depth.</span>"; }
  };
  function renderMinis() {
    cvCards().forEach(function (c) {
      if (cvGet(c) !== "sum") return;
      var el = c.querySelector(".c-sum"), f = MINI[c.getAttribute("data-card")]; if (!el || !f) return;
      var h = ""; try { h = f() || ""; } catch (e) { h = ""; }
      if (!h) h = '<span>Loading…</span>';
      if (el._h !== h) { el._h = h; el.innerHTML = h; }
    });
  }
  (function () {
    var board = $("board"); if (!board) return;
    // on a phone the price card starts as a summary (price and the three answers)
    // (it follows the width: a page opened in a hidden or narrow window gets the full card once the window is wide)
    var tc0 = board.querySelector(".top-card");
    function topDef() { if (!tc0) return; var d = window.innerWidth > 0 && window.innerWidth <= 560 ? "sum" : "full"; if (tc0.getAttribute("data-def") !== d) { tc0.setAttribute("data-def", d); cvApply(tc0); flowFix(); } }
    if (tc0) tc0.setAttribute("data-def", window.innerWidth > 0 && window.innerWidth <= 560 ? "sum" : "full");
    var tdT = 0; window.addEventListener("resize", function () { clearTimeout(tdT); tdT = setTimeout(topDef, 150); });
    cvCards().forEach(function (c) {
      var hd = c.querySelector(".card-h"); if (!hd || hd.parentNode !== c) return;
      var nm = esc(c.getAttribute("data-name") || c.getAttribute("data-card")), top = c.classList.contains("top-card");
      var g = document.createElement("div"); g.className = "cst"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "View of " + nm); g.setAttribute("data-nocap", "");
      g.innerHTML = CV_V.map(function (v) { return '<button type="button" data-v="' + v + '" title="' + CV_LBL[v] + '" aria-label="' + CV_LBL[v] + ": " + nm + '">' + CV_ICON[v] + "</button>"; }).join("");
      hd.appendChild(g);
      var t = hd.querySelector("h2");
      if (t && !top) { var x = document.createElement("button"); x.type = "button"; x.className = "cx"; x.setAttribute("data-nocap", ""); x.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>'; t.insertBefore(x, t.firstChild); }
      if (!top) { var sm = document.createElement("div"); sm.className = "c-sum"; c.insertBefore(sm, hd.nextSibling); }
      cvApply(c);
    });
    board.addEventListener("click", function (e) {
      if (document.body.classList.contains("arrange")) return;
      var t = e.target, c;
      var b = t.closest(".cst button");
      if (b) { c = b.closest("[data-card]"); cvSet(c, b.getAttribute("data-v")); cvAfter(); return; }
      var x = t.closest(".cx");
      if (x) { c = x.closest("[data-card]"); cvSet(c, cvGet(c) === "full" ? "title" : "full"); cvAfter(); return; }
      var hd = t.closest(".card-h, .c-sum"); if (!hd || !hd.parentNode || hd.parentNode.parentNode !== board) return;
      c = hd.parentNode; if (c.classList.contains("top-card") || cvGet(c) === "full") return;
      if (t.closest("button, a, input, select, label, .seg, .tip, [data-tip], [data-tipk]")) return;
      cvSet(c, "full"); cvAfter();
    });
    var va = $("view-all");
    if (va) va.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var v = b.getAttribute("data-st"); cvCards().forEach(function (c) { cvSet(c, v); }); cvAfter(); });
    var mT = 0;
    if (window.MutationObserver) new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var n = ms[i].target, e = n.nodeType === 1 ? n : n.parentNode;
        if (e && e.closest && !e.closest(".c-sum, .tc-h, #tip, #cyc-tip, .arr-cb")) { clearTimeout(mT); mT = setTimeout(renderMinis, 300); return; }
      }
    }).observe(board, { childList: true, subtree: true, characterData: true });
    cvSyncAll(); flowFix();
  })();
  // ---------- arrange ----------
  // Wide screens: the cards sit on a 12-column grid and can go anywhere. Drag a card to move it; drag its corner (or use − +)
  // to change its width. Cards never overlap: a card in the way moves down, and cards move up to close gaps.
  // Narrow screens: one column, in the same order (drag ⠿ or use ↑ ↓). The layout is kept in this browser.
  (function () {
    var board = $("board"); if (!board) return;
    var KEY_L = "bbm.layout", KEY_O = "bbm.order", COLS = 12, GAP = 16, SNAP = 8, MINW = 3, WIDE = 880, MAG = 14;
    var body = document.body;
    function cards() { return Array.prototype.filter.call(board.children, function (e) { return e.hasAttribute("data-card"); }); }
    function idOf(c) { return c.getAttribute("data-card"); }
    function byId() { var m = {}; cards().forEach(function (c) { m[idOf(c)] = c; }); return m; }
    function lim(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    function readJ(k) { try { return JSON.parse(sget(k) || "null"); } catch (e) { return null; } }
    var DEF = cards().map(idOf);
    var L = null, ORD = null, saved = false, dirty = false;
    var sl = readJ(KEY_L); if (sl && sl.v === 1 && sl.c && typeof sl.c === "object") { L = sl.c; saved = true; }
    var so = readJ(KEY_O); if (Array.isArray(so)) ORD = so;
    var undo = null, undoAt = 0;
    function store() {
      try {
        if (L) localStorage.setItem(KEY_L, JSON.stringify({ v: 1, c: L })); else localStorage.removeItem(KEY_L);
        if (ORD) localStorage.setItem(KEY_O, JSON.stringify(ORD)); else localStorage.removeItem(KEY_O);
      } catch (e) {}
      saved = !!L; syncReset();
    }
    function arranging() { return body.classList.contains("arrange"); }
    function wide() { return board.clientWidth >= WIDE && !body.classList.contains("kiosk"); }
    function step() { return (board.clientWidth + GAP) / COLS; }
    function after() { clearTimeout(after.t); after.t = setTimeout(function () { renderHistory(); if (S.tab === "cyc" && S.hist) renderCycChart(); }, 80); }

    // controls on each card (shown in arrange mode only)
    cards().forEach(function (c) {
      var nm = esc(c.getAttribute("data-name") || idOf(c)), bar = document.createElement("div");
      bar.className = "arr-cb"; bar.setAttribute("data-nocap", "");
      bar.innerHTML = '<button type="button" class="arr-h" aria-label="Move ' + nm + '. Arrow keys move it; Shift with left or right changes its width." title="Drag to move">⠿</button><span class="arr-n">' + nm + "</span>" +
        '<button type="button" class="arr-b arr-o" data-d="-1" aria-label="Move ' + nm + ' up">↑</button><button type="button" class="arr-b arr-o" data-d="1" aria-label="Move ' + nm + ' down">↓</button>' +
        '<button type="button" class="arr-b arr-w" data-w="-1" aria-label="Make ' + nm + ' narrower" title="Narrower">−</button><button type="button" class="arr-b arr-w" data-w="1" aria-label="Make ' + nm + ' wider" title="Wider">+</button>';
      c.appendChild(bar);
      var rs = document.createElement("span"); rs.className = "arr-rs"; rs.setAttribute("data-nocap", ""); rs.setAttribute("aria-hidden", "true"); rs.title = "Drag to change the width"; c.appendChild(rs);
    });
    var ph = document.createElement("div"); ph.className = "arr-ph"; ph.setAttribute("aria-hidden", "true"); ph.setAttribute("data-nocap", ""); board.appendChild(ph);

    // ----- order (narrow screens, and the reading order of a free layout) -----
    function setOrder(ids) {
      var m = byId(), list = ids.filter(function (id) { return m[id]; });
      DEF.forEach(function (id, i) { if (list.indexOf(id) < 0) list.splice(Math.min(i, list.length), 0, id); });
      list.forEach(function (id) { board.insertBefore(m[id], ph); });
    }
    function readingOrder(P) { return Object.keys(P).sort(function (a, b) { return P[a].y - P[b].y || P[a].x - P[b].x; }); }
    function flowOrder() { return ORD || (L ? readingOrder(L) : DEF); }

    // ----- free layout -----
    var H = {}, R = {}, free = false, drag = null, sz = null, ld = null;
    function ids() { var m = byId(); return Object.keys(L || {}).filter(function (id) { return m[id] && m[id].offsetParent !== null; }); }
    function fill() {
      var m = byId(), bottom = 0;
      Object.keys(L).forEach(function (id) {
        var p = L[id]; if (!m[id]) return;
        p.w = lim(Math.round(+p.w) || COLS, MINW, COLS); p.x = lim(Math.round(+p.x) || 0, 0, COLS - p.w); p.y = Math.max(0, +p.y || 0);
        bottom = Math.max(bottom, (R[id] != null ? R[id] : p.y) + (H[id] || 300) + GAP);
      });
      DEF.forEach(function (id) { if (m[id] && !L[id]) { L[id] = { x: 0, w: COLS, y: bottom }; bottom += 320; } });
    }
    function capture() {
      var br = board.getBoundingClientRect(), st = step(), o = {};
      cards().forEach(function (c) {
        if (c.offsetParent === null) return;
        var r = c.getBoundingClientRect(), w = lim(Math.round((r.width + GAP) / st), MINW, COLS), x = lim(Math.round((r.left - br.left) / st), 0, COLS - w);
        o[idOf(c)] = { x: x, w: w, y: Math.round(r.top - br.top) };
      });
      return o;
    }
    function measure(P) {
      var m = byId(), st = step(), list = ids();
      list.forEach(function (id) { m[id].style.width = (P[id].w * st - GAP) + "px"; });
      list.forEach(function (id) { H[id] = m[id].offsetHeight; });
    }
    // place each card where it wants to be; a card in the way moves down. `fixed` (the card being moved) goes first.
    function resolve(P, fixed) {
      var list = ids().sort(function (a, b) { if (a === fixed) return -1; if (b === fixed) return 1; return P[a].y - P[b].y || P[a].x - P[b].x; });
      var done = [], out = {};
      list.forEach(function (id) {
        var p = P[id], y = Math.max(0, p.y), hit = true;
        while (hit) {
          hit = false;
          for (var i = 0; i < done.length; i++) {
            var q = P[done[i]], qy = out[done[i]], qh = H[done[i]];
            if (p.x < q.x + q.w && q.x < p.x + p.w && y < qy + qh + GAP && qy < y + H[id] + GAP) { y = qy + qh + GAP; hit = true; }
          }
        }
        out[id] = y; done.push(id);
      });
      return out;
    }
    // then close the gaps: in reading order, each card moves up as far as the cards above it allow
    function compact(P, Y) {
      var list = ids().sort(function (a, b) { return Y[a] - Y[b] || P[a].x - P[b].x; }), out = {}, done = [];
      list.forEach(function (id) {
        var p = P[id], y = 0;
        done.forEach(function (q) { var o = P[q]; if (p.x < o.x + o.w && o.x < p.x + p.w) y = Math.max(y, out[q] + H[q] + GAP); });
        out[id] = y; done.push(id);
      });
      return out;
    }
    function place(P, fixed) {
      if (!free) return;
      measure(P); R = compact(P, resolve(P, fixed));
      var m = byId(), st = step(), bottom = 0;
      ids().forEach(function (id) {
        if (!drag || drag.id !== id) { m[id].style.top = R[id] + "px"; m[id].style.left = (P[id].x * st) + "px"; }
        bottom = Math.max(bottom, R[id] + H[id]);
      });
      board.style.height = (bottom + (arranging() ? 280 : 0)) + "px";
    }
    function commit() { Object.keys(R).forEach(function (k) { if (L[k]) L[k].y = R[k]; }); }
    function apply() {
      var on = !!L && wide();
      if (on !== free) {
        free = on; board.classList.toggle("free", on);
        if (!on) { cards().forEach(function (c) { c.style.left = c.style.top = c.style.width = ""; }); board.style.height = ""; }
      }
      if (free) { fill(); place(L); setOrder(readingOrder(L)); } else setOrder(flowOrder());
      var tx = $("arr-tx"); if (tx) tx.textContent = free ? "Drag a card anywhere. Drag its corner, or use − +, to change its width. Cards move to make room and close up gaps." : "Drag a card by ⠿, or use ↑ ↓. On a wider screen you can place cards anywhere.";
      var td = $("arr-tidy"); if (td) td.hidden = true;
      syncReset(); flowFix();
    }
    var raf = 0;
    function relayout() { if (!free || drag || sz) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { place(L); }); }
    if (window.ResizeObserver) { var ro = new ResizeObserver(relayout); cards().forEach(function (c) { ro.observe(c); }); }
    var rzT; window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(apply, 120); });
    document.addEventListener("fullscreenchange", function () { setTimeout(apply, 350); });

    // ----- reset, with undo for 8 seconds -----
    function syncReset() {
      var canUndo = !!undo && Date.now() - undoAt < 8000, custom = (!!L && saved) || !!ORD, t = canUndo ? "Undo reset" : "Reset layout";
      var hb = $("reset-layout"), ht = $("reset-t"), ab = $("arr-reset");
      if (ht) ht.textContent = t; if (hb) { hb.hidden = !(custom || canUndo); hb.setAttribute("aria-label", t); }
      if (ab) { ab.textContent = t; ab.disabled = !(custom || canUndo || (L && dirty)); }
    }
    function reset() {
      undo = { L: L && saved ? copy(L) : null, O: ORD ? ORD.slice() : null }; undoAt = Date.now();
      L = null; ORD = null; dirty = false; store(); apply();
      if (arranging() && wide()) { L = capture(); saved = false; apply(); }
      after(); syncReset(); setTimeout(syncReset, 8100);
    }
    function doUndo() { var u = undo; undo = null; if (!u) return; L = u.L; ORD = u.O; dirty = true; store(); apply(); after(); }
    function resetClick() { if (undo && Date.now() - undoAt < 8000) doUndo(); else reset(); }
    if ($("reset-layout")) $("reset-layout").addEventListener("click", resetClick);
    $("arr-reset").addEventListener("click", resetClick);

    // ----- arrange mode on and off -----
    function setArr(on) {
      if (on && !L && wide()) { L = capture(); saved = false; dirty = false; }
      body.classList.toggle("arrange", on); $("arrange").setAttribute("aria-pressed", on ? "true" : "false");
      if (!on && L && !saved) L = null; // nothing changed: back to the default layout
      apply(); after();
    }
    $("arrange").addEventListener("click", function () { setArr(!arranging()); });
    $("arr-done").addEventListener("click", function () { setArr(false); });
    if ($("arr-link")) $("arr-link").addEventListener("click", function () { copyLink(this); });
    $("arr-tidy").addEventListener("click", function () {
      if (!free) return;
      commit();
      var done = [];
      readingOrder(L).forEach(function (id) {
        var p = L[id], y = 0; if (H[id] == null) return;
        done.forEach(function (q) { var o = L[q]; if (p.x < o.x + o.w && o.x < p.x + p.w) y = Math.max(y, o.y + H[q] + GAP); });
        p.y = y; done.push(id);
      });
      dirty = true; place(L); commit(); store(); after();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && arranging() && !drag && !sz) setArr(false); });

    // ----- buttons on the cards -----
    function nudge(id, dx, dw, dy) {
      commit();
      var p = L[id];
      if (dw) { if (dw > 0 && p.x + p.w >= COLS && p.x > 0) { p.x--; p.w++; } else p.w = lim(p.w + dw, MINW, COLS - p.x); }
      if (dx) p.x = lim(p.x + dx, 0, COLS - p.w);
      if (dy) p.y = Math.max(0, p.y + dy);
      place(L, id); commit(); dirty = true; store(); setOrder(readingOrder(L)); after();
    }
    function listMove(c, d) {
      var sib = d < 0 ? c.previousElementSibling : c.nextElementSibling;
      while (sib && !sib.hasAttribute("data-card")) sib = d < 0 ? sib.previousElementSibling : sib.nextElementSibling;
      if (!sib) return false;
      board.insertBefore(c, d < 0 ? sib : sib.nextSibling); ORD = cards().map(idOf); store(); after(); return true;
    }
    board.addEventListener("click", function (e) {
      var bt = e.target.closest && e.target.closest(".arr-b"); if (!bt) return;
      e.preventDefault();
      var c = bt.closest("[data-card]"), id = idOf(c);
      if (bt.hasAttribute("data-w")) { if (free) nudge(id, 0, +bt.getAttribute("data-w"), 0); }
      else if (!free && listMove(c, +bt.getAttribute("data-d"))) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
      bt.focus();
    });
    board.addEventListener("keydown", function (e) {
      var h = e.target.closest && e.target.closest(".arr-h"); if (!h || !arranging()) return;
      var c = h.closest("[data-card]"), id = idOf(c), k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(k) < 0) return;
      e.preventDefault();
      if (!free) { if (k === "ArrowUp" || k === "ArrowDown") listMove(c, k === "ArrowUp" ? -1 : 1); h.focus(); return; }
      if (k === "ArrowLeft" || k === "ArrowRight") { var d = k === "ArrowLeft" ? -1 : 1; if (e.shiftKey) nudge(id, 0, d, 0); else nudge(id, d, 0, 0); }
      else nudge(id, 0, 0, k === "ArrowUp" ? -(H[id] ? Math.min(H[id], 120) : 40) : 40);
      h.focus(); c.scrollIntoView({ block: "nearest" });
    });

    // ----- pointer: move and resize -----
    function autoScroll(e) { if (e.clientY < 70) window.scrollBy(0, -18); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 18); }
    function snapY(top, id, P) {
      var y = Math.max(0, top), best = null, bd = MAG;
      Object.keys(P).forEach(function (k) {
        if (k === id || H[k] == null || R[k] == null) return;
        [R[k], R[k] + H[k] + GAP].forEach(function (c) { var d = Math.abs(y - c); if (d < bd) { bd = d; best = c; } });
      });
      if (y < MAG) best = 0;
      return best != null ? best : Math.round(y / SNAP) * SNAP;
    }
    function showPh(x, y, w, h) { var st = step(); ph.style.left = (x * st) + "px"; ph.style.top = y + "px"; ph.style.width = (w * st - GAP) + "px"; ph.style.height = h + "px"; ph.classList.add("on"); }
    board.addEventListener("pointerdown", function (e) {
      if (!arranging() || e.button > 0) return;
      var t = e.target, c = t.closest && t.closest("[data-card]"); if (!c || c.parentNode !== board) return;
      if (t.closest(".arr-rs")) {
        if (!free) return;
        e.preventDefault(); commit();
        sz = { id: idOf(c), c: c, left: c.getBoundingClientRect().left, moved: false };
        c.classList.add("sizing"); body.classList.add("dragging-on");
        try { t.setPointerCapture(e.pointerId); } catch (er) {}
        return;
      }
      if (t.closest(".arr-b")) return;
      if (free) {
        e.preventDefault(); commit();
        var r = c.getBoundingClientRect(), id = idOf(c);
        drag = { id: id, c: c, dx: e.clientX - r.left, dy: e.clientY - r.top, base: copy(L), x: L[id].x, y: L[id].y, P: null };
        c.classList.add("dragging"); body.classList.add("dragging-on");
        showPh(L[id].x, R[id], L[id].w, H[id]);
        try { c.setPointerCapture(e.pointerId); } catch (er) {}
        return;
      }
      if (t.closest(".arr-h")) {
        e.preventDefault();
        ld = { c: c }; c.classList.add("dragging"); body.classList.add("dragging-on");
        try { t.setPointerCapture(e.pointerId); } catch (er) {}
      }
    });
    document.addEventListener("pointermove", function (e) {
      if (drag) {
        autoScroll(e);
        var br = board.getBoundingClientRect(), st = step(), p = drag.base[drag.id];
        var left = e.clientX - br.left - drag.dx, top = e.clientY - br.top - drag.dy;
        drag.c.style.left = left + "px"; drag.c.style.top = top + "px";
        var x = lim(Math.round(left / st), 0, COLS - p.w), y = snapY(top, drag.id, drag.base);
        if (x === drag.x && y === drag.y && drag.P) return;
        drag.x = x; drag.y = y;
        var P = copy(drag.base); P[drag.id].x = x; P[drag.id].y = y; drag.P = P;
        place(P, drag.id); showPh(x, R[drag.id], p.w, H[drag.id]);
      } else if (sz) {
        var st2 = step(), q = L[sz.id], w = lim(Math.round((e.clientX - sz.left + GAP) / st2), MINW, COLS - q.x);
        if (w === q.w) return;
        q.w = w; sz.moved = true; place(L, sz.id);
      } else if (ld) {
        autoScroll(e);
        var els = document.elementsFromPoint(e.clientX, e.clientY), tg = null;
        for (var i = 0; i < els.length; i++) { var cc = els[i].closest && els[i].closest("[data-card]"); if (cc && cc !== ld.c && cc.parentNode === board) { tg = cc; break; } }
        if (!tg) return;
        var rr = tg.getBoundingClientRect(), side = rr.width < board.clientWidth * 0.7;
        var before = side ? e.clientX < rr.left + rr.width / 2 : e.clientY < rr.top + rr.height / 2;
        var ref = before ? tg : tg.nextSibling;
        if (ref === ld.c || (before ? tg.previousElementSibling === ld.c : tg.nextElementSibling === ld.c)) return;
        board.insertBefore(ld.c, ref);
      }
    });
    function up() {
      if (drag) {
        var d = drag; drag = null; d.c.classList.remove("dragging"); body.classList.remove("dragging-on"); ph.classList.remove("on");
        if (d.P && (d.P[d.id].x !== d.base[d.id].x || d.P[d.id].y !== d.base[d.id].y)) { L = d.P; place(L, d.id); commit(); dirty = true; store(); }
        else place(L);
        setTimeout(function () { if (free && !drag) setOrder(readingOrder(L)); }, 260);
        after();
      } else if (sz) {
        var s2 = sz; sz = null; s2.c.classList.remove("sizing"); body.classList.remove("dragging-on");
        if (s2.moved) { commit(); dirty = true; store(); }
        after();
      } else if (ld) {
        ld.c.classList.remove("dragging"); body.classList.remove("dragging-on"); ld = null;
        ORD = cards().map(idOf); store(); after();
      }
    }
    document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);

    apply();
    if (qs.get("debug") === "1") window.__arr = { apply: apply, get L() { return L; }, get R() { return R; }, get H() { return H; }, get free() { return free; } };
  })();
  // pull every source now; the page works out all scores from them in the browser
  S.dataAt = Date.now();
  fetchPrice(); fetchHourly(); fetchDaily(); loadData(); loadHist(); loadRecent();
  fetchCM(); fetchFng(); fetchLev(); fetchStable(); fetchPremium(); fetchCbbi();
  // ---------- stay on the newest version ----------
  // Now and then the page reads the published index.html. If it loads a newer app.js than this one, the page loads
  // itself again (once per version in this tab), so an open tab or a cached copy never stays on an old version.
  (function () {
    var me = document.querySelector('script[src^="app.js"]'), cur = me ? me.getAttribute("src") : "";
    if (!cur || !window.fetch) return;
    function check() {
      fetch("index.html?nc=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
        var m = /<script src="(app\.js\?v=([^"]+))"/.exec(t || ""); if (!m || m[1] === cur) return;
        try { var k = "bbm.upd." + m[2]; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { return; }
        var q = new URLSearchParams(location.search); q.set("v", m[2]);
        location.replace(location.pathname + "?" + q.toString() + location.hash);
      }).catch(function () {});
    }
    setTimeout(check, 3000); setInterval(check, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
  })();
  if (qs.get("debug") === "1") window.__bbm = { S: S, alerts: pubAlerts, cheapWindows: cheapWindows, pastDaily: pastDaily, histVal: histVal, histValAt: histValAt, parts: parts, liveRaw: liveRaw, biLive: biLive, clockNow: clockNow, histNear: histNear, scoreAt: scoreAt, closeParts: closeParts, levAt: levAt, fg7: fg7, stable30: stable30 };
  setInterval(function () { if (!document.hidden) fetchPrice(); }, 15000);
  setInterval(renderLiveAge, 1000);
  setInterval(function () { if (!document.hidden) { fetchHourly(); fetchPremium(); if (S.latest) renderHistory(); } }, 5 * 60e3);
  setInterval(function () { if (!document.hidden) { S.dataAt = Date.now(); loadData(); fetchDaily(); } }, 10 * 60e3);
  setInterval(function () { if (!document.hidden) fetchLev(); }, 30 * 60e3);
  setInterval(function () { if (!document.hidden) { fetchCM(); fetchFng(); fetchStable(); } }, 60 * 60e3);
  setInterval(fetchCbbi, 6 * 60 * 60e3);
})();
