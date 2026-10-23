/* PMIC Census front end. Plain JS, no build step.
   Data: data/meta.json, data/papers.json (written by collector/build.py),
         data/annotations.csv (hand-checked values and corrections, optional). */
(function () {
  "use strict";

  var ARCH_COLORS = {
    "Buck": "#1f55c4", "Boost": "#d69a00", "Buck-boost": "#8d5a00", "Multi-level": "#0d8a7d", "Series-capacitor": "#5fb8a8",
    "SIMO": "#b0228c", "Multiphase": "#7a9be8", "Resonant/soft-switching": "#d0365a", "SC topology": "#7d8a1f",
    "GaN/high-V": "#6a2fd0", "Integrated magnetics": "#3b9ad9", "Hysteretic/COT": "#a07a5a", "Digital control": "#5a6b80",
    "Other": "#9aa4b1"
  };
  // the colour of a dot follows the most specific architecture tag
  var PRIMARY = ["SIMO", "Resonant/soft-switching", "Series-capacitor", "Multi-level", "SC topology", "Integrated magnetics", "GaN/high-V",
    "Multiphase", "Buck-boost", "Boost", "Buck", "Hysteretic/COT", "Digital control"];
  var TYPE_COLORS = { "Inductive": "#1f55c4", "Switched-capacitor": "#d69a00", "Hybrid": "#0d8a7d", "System": "#b0228c" };
  var VENUE_ORDER = ["ISSCC", "VLSI", "JSSC", "CICC", "ESSCIRC", "A-SSCC", "SSC-L", "TCAS-I", "TCAS-II", "TVLSI"];
  var KNOWN_APPS = ["Processor/SoC", "Data center/48 V", "Battery/charger", "IoT/harvesting", "Display/LED", "Automotive", "Wireless power", "Biomedical", "Mobile"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var PAGE = 150;

  var $ = function (id) { return document.getElementById(id); };
  var META = {}, ALL = [], VIEW = [], LIMIT = PAGE, BYID = {};
  var F = defaults();
  var YMAX = 0, PG = null;   // latest publication year; geometry of the last drawn plot (zoom, export)

  function defaults() {
    return { q: "", kind: "", y0: "", y1: "", venues: [], apps: [], arch: [], country: "",
      related: false, cal: false, fresh: false, sort: "date",
      chart: "eff_iout", x: "iout", y: "eff", xs: "", ys: "", color: "arch", hl: "", zoom: "", vq: "", rng: "", cmp: [] };
  }

  /* ------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var SI = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"], [1e-18, "a"]];
  function fmtSI(v, unit) {
    if (v == null || !isFinite(v) || v <= 0) return "";
    for (var i = 0; i < SI.length; i++) {
      if (v >= SI[i][0] * 0.9995) {
        var x = v / SI[i][0];
        var s = x >= 100 ? x.toFixed(0) : x >= 10 ? (+x.toFixed(1)).toString() : (+x.toFixed(2)).toString();
        return s + " " + SI[i][1] + unit;
      }
    }
    return v.toExponential(1) + unit;
  }
  function parseSI(s) {
    if (s == null) return null;
    s = String(s).trim().replace(/[μu]/, "µ");
    if (!s) return null;
    var m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([TGMkKµmunpfa]?)/);
    if (!m) return null;
    var mult = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, "": 1, m: 1e-3, "µ": 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18 }[m[2]];
    return parseFloat(m[1]) * mult;
  }
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    var head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }) && !/^#/.test(r[0]); })
      .map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = (r[i] || "").trim(); }); return o; });
  }
  function fmtDate(d) {
    if (!d) return "";
    var m = d.match(/^(\d{4})-(\d{2})/);
    return m ? MONTHS[+m[2] - 1] + " " + m[1] : d;
  }
  function list(s) { return s ? s.split(/\s*;\s*/).filter(Boolean) : []; }
  // canonical tag names; annotations may use these spellings in any case
  var TAG_ALIASES = {
    "buckboost": "Buck-boost", "bb": "Buck-boost", "3level": "Multi-level", "threelevel": "Multi-level", "multilevel": "Multi-level",
    "flyingcapacitor": "Multi-level", "fc": "Multi-level", "seriescapacitor": "Series-capacitor", "sc": "SC topology", "dickson": "SC topology",
    "ladder": "SC topology", "sido": "SIMO", "multioutput": "SIMO", "multiphase": "Multiphase", "interleaved": "Multiphase",
    "resonant": "Resonant/soft-switching", "zvs": "Resonant/soft-switching", "gan": "GaN/high-V", "ivr": "Integrated magnetics",
    "integratedinductor": "Integrated magnetics", "cot": "Hysteretic/COT", "hysteretic": "Hysteretic/COT", "digital": "Digital control",
    "soc": "Processor/SoC", "processor": "Processor/SoC", "datacenter": "Data center/48 V", "48v": "Data center/48 V", "battery": "Battery/charger",
    "charger": "Battery/charger", "iot": "IoT/harvesting", "harvesting": "IoT/harvesting", "led": "Display/LED", "display": "Display/LED",
    "wpt": "Wireless power", "bio": "Biomedical"
  };
  function tagKey(s) { return s.toLowerCase().replace(/[\s_\-\/.]+/g, ""); }
  function canonTags(s, known) {
    var byKey = {};
    known.forEach(function (k) { byKey[tagKey(k)] = k; });
    return list(s).map(function (t) { var k = tagKey(t); return byKey[k] || TAG_ALIASES[k] || t; });
  }

  /* ------------------------------------------------------------ data model */
  function primaryArch(p) {
    for (var i = 0; i < PRIMARY.length; i++) if (p.ar.indexOf(PRIMARY[i]) >= 0) return PRIMARY[i];
    return "Other";
  }
  function derive(p) {
    var s = p.s;
    p.cr = s.vin && s.vout ? s.vout / s.vin : null;                                   // conversion ratio V_OUT / V_IN
    p.poutCalc = s.pout == null && s.vout && s.iout ? s.vout * s.iout : null;
    p.prim = primaryArch(p);
  }
  var ANN_KEYS = ["vin", "vout", "iout", "pout", "eff", "fsw", "ind", "pd", "cd", "iq", "ripple", "dv", "node", "area"];
  var ANN_HEAD = ["id", "exclude", "type", "arch", "app", "vin", "vout", "iout", "pout", "eff", "fsw", "ind", "pd", "cd", "iq", "ripple", "dv", "node", "area", "cal", "note", "by"];
  /* Where each number comes from. Priority when they disagree: checked > ai > abstract/title.
     t/a: parsed from the title/abstract by the collector; ai: an AI tool filled the annotations row (its "by" or
     "source" says so); checked: a person filled the row. */
  var SRC = {
    t: ["T", "Parsed from the title"], a: ["A", "Parsed from the abstract"],
    ai: ["AI", "Extracted by an AI tool, not checked by a person"], checked: ["✓", "Checked by the lab"]
  };
  var RANK = { t: 1, a: 1, ai: 2, survey: 3, checked: 4 };
  var AI_BY = /\b(?:codex|gpt|chatgpt|claude|gemini|copilot|llm|ai)\b/i;
  var DELETE = /^(?:-|–|na|n\/a|none|nr)$/i;   // in annotations.csv: remove the value (not reported / wrong)
  function applyAnnotations(papers, rows) {
    var ann = {};
    rows.forEach(function (r) { if (r.id) ann[r.id] = r; });
    var out = [];
    papers.forEach(function (p) {
      p.s = p.s || {}; p.ar = p.ar || []; p.ap = p.ap || []; p.ver = {}; p.vs = {}; p.conflicts = [];
      Object.keys(p.src || {}).forEach(function (k) { p.vs[k] = p.src[k]; });
      var a = ann[p.id];
      if (a) {
        if (/^(1|y|yes|true|x)$/i.test(a.exclude || "")) return;
        if (a.type) p.ty = /hyb/i.test(a.type) ? "Hybrid" : /sw|^sc$|cap/i.test(a.type) ? "Switched-capacitor" : /ind/i.test(a.type) ? "Inductive" : /sys|pmic|pmu|charg|harv/i.test(a.type) ? "System" : "";
        if (a.arch) p.ar = canonTags(a.arch, Object.keys(ARCH_COLORS));
        if (a.app) p.ap = canonTags(a.app, KNOWN_APPS);
        if (a.cal) p.cal = /^(1|y|yes|true|x|o)$/i.test(a.cal);
        if (a.type || a.arch) p.lv = "core";
        var who = /^(?:ai|auto|machine)/i.test(a.source || "") || (!a.source && AI_BY.test(a.by || "")) ? "ai" : "checked";
        ANN_KEYS.forEach(function (k) {
          var raw = (a[k] || "").trim();
          if (!raw) return;                                         // empty: keep what is there
          if (p.sys && who === "ai") return;                        // AI numbers of a system paper describe the system
          if (RANK[who] < RANK[p.vs[k] || "t"]) { p.conflicts.push(k); return; }
          if (DELETE.test(raw)) { delete p.s[k]; p.vs[k] = who; if (who === "checked") p.ver[k] = "deleted"; else delete p.ver[k]; return; }
          var v = parseSI(raw);
          if (v == null || isNaN(v)) return;
          p.s[k] = v; p.vs[k] = who;
          if (who === "checked") p.ver[k] = "checked"; else delete p.ver[k];
        });
        p.note = who === "ai" ? "" : (a.note || "");   // AI rows carry extraction logs, not notes for readers
      }
      derive(p);
      p.f = fields(p);
      out.push(p);
    });
    return out;
  }

  /* ------------------------------------------------------------ filtering */
  // numeric range filters: "key>=value" pairs in F.rng, e.g. "eff>=90;iout>=1"
  var RANGES = [
    { k: "eff", op: ">=", label: "Peak η ≥", unit: "%", get: function (p) { return p.s.eff; } },
    { k: "iout", op: ">=", label: "I_out ≥", unit: "A", get: function (p) { return p.s.iout; } },
    { k: "vin", op: ">=", label: "V_in ≥", unit: "V", get: function (p) { return p.s.vin; } },
    { k: "vinmax", op: "<=", label: "V_in ≤", unit: "V", get: function (p) { return p.s.vin; } },
    { k: "fsw", op: ">=", label: "f_sw ≥", unit: "Hz", get: function (p) { return p.s.fsw; } },
    { k: "pd", op: ">=", label: "Power density ≥", unit: "W/mm²", get: function (p) { return p.s.pd; } },
    { k: "node", op: "<=", label: "Node ≤", unit: "nm", get: function (p) { return p.s.node; } },
    { k: "area", op: "<=", label: "Area ≤", unit: "mm²", get: function (p) { return p.s.area; } }
  ];
  function rangeMap() {
    var m = {};
    (F.rng || "").split(";").forEach(function (t) { var kv = t.split(/[<>]=/); if (kv.length === 2 && kv[1] !== "") m[kv[0]] = kv[1]; });
    return m;
  }
  function srcRank(p, k) { return p.s[k] == null ? 0 : (RANK[p.vs[k] || "t"] || 1); }
  var VQ = { "": 0, chk: 4 };
  function match(p, skip) {
    if (F.kind && p.ty !== F.kind) return false;
    if (!F.related && p.lv !== "core") return false;
    if (skip !== "year") {
      if (F.y0 && (p.y || 0) < +F.y0) return false;
      if (F.y1 && (p.y || 9999) > +F.y1) return false;
    }
    if (skip !== "venue" && F.venues.length && F.venues.indexOf(p.v) < 0) return false;
    if (skip !== "app" && F.apps.length && !F.apps.some(function (a) { return p.ap.indexOf(a) >= 0; })) return false;
    if (skip !== "arch" && F.arch.length && !F.arch.some(function (a) { return a === "Other" ? p.prim === "Other" : p.ar.indexOf(a) >= 0; })) return false;
    if (skip !== "country" && F.country && (p.cn || []).indexOf(F.country) < 0) return false;
    if (F.cal && !p.cal) return false;
    var rm = rangeMap();
    for (var i0 = 0; i0 < RANGES.length; i0++) {
      var r = RANGES[i0], lim = rm[r.k];
      if (lim == null) continue;
      var lv = parseSI(lim), v = r.get(p);
      if (lv == null || isNaN(lv)) continue;
      if (v == null || (r.op === ">=" ? v < lv : v > lv)) return false;
    }
    if (F.vq && !ANN_KEYS.some(function (k) { return srcRank(p, k) >= VQ[F.vq]; })) return false;
    if (F.fresh && p.first !== META.updated) return false;
    if (F.q) {
      var hay = p._hay || (p._hay = [p.t, (p.au || []).join(" "), (p.org || []).join(" "), p.v, p.vt, p.ar.join(" "), p.ap.join(" "), p.note || ""].join(" ").toLowerCase());
      var terms = F.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }
  function counts(skip, key) {
    var c = {};
    ALL.forEach(function (p) {
      if (!match(p, skip)) return;
      var vals = key(p);
      vals.forEach(function (v) { if (v) c[v] = (c[v] || 0) + 1; });
    });
    return c;
  }
  var SORTS = {
    date: function (a, b) { return (b.d || "").localeCompare(a.d || "") || (b.id > a.id ? 1 : -1); },
    eff: function (a, b) { return (b.s.eff || 0) - (a.s.eff || 0); },
    iout: function (a, b) { return (b.s.iout || 0) - (a.s.iout || 0); },
    fsw: function (a, b) { return (b.s.fsw || 0) - (a.s.fsw || 0); },
    pd: function (a, b) { return (b.s.pd || b.s.cd || 0) - (a.s.pd || a.s.cd || 0); }
  };

  /* ------------------------------------------------------------ URL state */
  function writeHash() {
    var d = defaults(), u = new URLSearchParams();
    Object.keys(F).forEach(function (k) {
      var v = F[k];
      if (Array.isArray(v) ? v.length : v !== d[k]) u.set(k, Array.isArray(v) ? v.join("|") : v);
    });
    var h = u.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function readHash() {
    var u = new URLSearchParams(location.hash.slice(1)), d = defaults();
    Object.keys(d).forEach(function (k) {
      if (!u.has(k)) return;
      var v = u.get(k);
      if (Array.isArray(d[k])) F[k] = v ? v.split("|") : [];
      else if (typeof d[k] === "boolean") F[k] = v === "true";
      else F[k] = v;
    });
  }

  /* ------------------------------------------------------------ rendering: controls */
  function chip(label, n, pressed) {
    return '<button type="button" class="chip" data-v="' + esc(label) + '" aria-pressed="' + pressed + '">' +
      esc(label) + '<span class="n">' + (n || 0) + "</span></button>";
  }
  function renderControls() {
    var vc = counts("venue", function (p) { return [p.v]; });
    var venues = VENUE_ORDER.filter(function (v) { return META.by_venue && META.by_venue[v] || vc[v]; });
    Object.keys(vc).forEach(function (v) { if (venues.indexOf(v) < 0) venues.push(v); });
    $("venues").innerHTML = venues.map(function (v) { return chip(v, vc[v], F.venues.indexOf(v) >= 0); }).join("");

    var ac = counts("app", function (p) { return p.ap; });
    var apps = Object.keys(ac).sort(function (a, b) { return ac[b] - ac[a]; });
    F.apps.forEach(function (a) { if (apps.indexOf(a) < 0) apps.push(a); });
    $("apps").innerHTML = apps.length ? apps.map(function (a) { return chip(a, ac[a], F.apps.indexOf(a) >= 0); }).join("")
      : '<span class="n" style="color:var(--muted)">None in this selection</span>';

    var cc = counts("country", function (p) { return p.cn || []; });
    var countries = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; });
    $("country").innerHTML = '<option value="">All</option>' + countries.map(function (c) {
      return '<option value="' + esc(c) + '"' + (F.country === c ? " selected" : "") + ">" + esc(c) + " (" + cc[c] + ")</option>";
    }).join("");

    Array.prototype.forEach.call($("kind").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === F.kind); });
    $("q").value = F.q;
    $("y0").value = F.y0; $("y1").value = F.y1;
    $("related").checked = F.related; $("cal").checked = F.cal; $("fresh").checked = F.fresh;
    $("sort").value = F.sort;
    $("vq").value = F.vq;
    if (!$("ranges").contains(document.activeElement)) {   // do not rebuild the inputs while someone types in them
      var rm = rangeMap();
      $("ranges").innerHTML = RANGES.map(function (r) {
        return '<label class="rng"><span>' + esc(r.label) + '</span><input type="text" inputmode="decimal" data-rng="' + r.k + '" value="' +
          esc(rm[r.k] || "") + '" placeholder="' + esc(r.unit || "any") + '"></label>';
      }).join("");
    }
  }
  function renderLegend() {
    var c = counts("arch", function (p) { return p.prim === "Other" ? ["Other"] : p.ar; });
    var keys = Object.keys(c).sort(function (a, b) {
      return (a === "Other") - (b === "Other") || c[b] - c[a];
    });
    F.arch.forEach(function (a) { if (keys.indexOf(a) < 0) keys.push(a); });
    $("legend").innerHTML = keys.map(function (k) {
      var on = F.arch.indexOf(k) >= 0, off = F.arch.length && !on;
      return '<li class="' + (off ? "off" : "") + '"><button type="button" data-v="' + esc(k) + '" aria-pressed="' + on + '">' +
        '<span class="sw" style="background:' + (ARCH_COLORS[k] || ARCH_COLORS.Other) + '"></span><span>' + esc(k) +
        '</span><span class="n">' + (c[k] || 0) + "</span></button></li>";
    }).join("");

    var yc = {};
    VIEW.forEach(function (p) { if (p.y) yc[p.y] = (yc[p.y] || 0) + 1; });
    var ys = Object.keys(yc).sort().reverse(), mx = Math.max.apply(null, ys.map(function (y) { return yc[y]; }).concat([1]));
    $("years").innerHTML = ys.map(function (y) {
      return '<div class="yr"><span>' + y + '</span><span class="bar" style="width:' + (100 * yc[y] / mx).toFixed(1) +
        '%"></span><span class="yn">' + yc[y] + "</span></div>";
    }).join("");
  }

  /* ------------------------------------------------------------ plot: data and axes */
  // Plotted values share one set of keys, taken from the parsed specs with annotations on top.
  function fields(p) {
    var s = p.s;
    return { vin: s.vin, vout: s.vout, cr: p.cr, iout: s.iout, pout: s.pout != null ? s.pout : p.poutCalc, eff: s.eff, loss: s.eff != null ? 100 - s.eff : null,
      fsw: s.fsw, ind: s.ind, pd: s.pd, cd: s.cd, iq: s.iq, ripple: s.ripple, dv: s.dv, node: s.node, area: s.area, y: p.y };
  }
  // which spec fields a plotted value is computed from (any one set), to tell checked points from parsed ones
  var BASIS = { cr: [["vin", "vout"]], pout: [["pout"], ["vout", "iout"]], loss: [["eff"]], y: [[]] };
  function quality(p, k) {   // a plotted value is as good as the weakest field it is computed from (best alternative)
    return Math.max.apply(null, (BASIS[k] || [[k]]).map(function (set) {
      return set.length ? Math.min.apply(null, set.map(function (b) { return srcRank(p, b); })) : 9;
    }));
  }
  function curated(p, key) {
    return (BASIS[key] || [[key]]).some(function (set) { return set.every(function (b) { return p.ver[b]; }); });
  }
  function nmFmt(v) { return v >= 1000 ? +(v / 1000).toPrecision(3) + " µm" : +v.toPrecision(3) + " nm"; }
  var AX = {
    eff:    { name: "Peak efficiency", label: "Peak efficiency (%)" },
    loss:   { name: "Loss at peak efficiency", label: "100 − peak efficiency (%)", log: true },
    iout:   { name: "Maximum output current", label: "I_out,max (A)", log: true, unit: "A" },
    pout:   { name: "Output power", label: "P_out (W)", log: true, unit: "W" },
    vin:    { name: "Input voltage", label: "V_IN (V)", log: true, unit: "V" },
    vout:   { name: "Output voltage", label: "V_OUT (V)", log: true, unit: "V" },
    cr:     { name: "Conversion ratio", label: "V_OUT / V_IN", log: true },
    fsw:    { name: "Switching frequency", label: "f_sw (Hz)", log: true, unit: "Hz" },
    ind:    { name: "Inductance", label: "L (H)", log: true, unit: "H" },
    pd:     { name: "Power density", label: "Power density (W/mm²)", log: true },
    cd:     { name: "Current density", label: "Current density (A/mm²)", log: true },
    iq:     { name: "Quiescent current", label: "I_Q (A)", log: true, unit: "A" },
    ripple: { name: "Output ripple", label: "Ripple (V)", log: true, unit: "V" },
    dv:     { name: "Load-transient droop", label: "ΔV_OUT (V)", log: true, unit: "V" },
    node:   { name: "Process node", label: "Process node", log: true, fmt: nmFmt },
    area:   { name: "Area", label: "Area (mm²)", log: true },
    y:      { name: "Year", label: "Year" }
  };
  var CHARTS = {
    eff_iout:  { name: "Efficiency vs. I_out,max", title: "Peak efficiency vs. maximum output current", x: "iout", y: "eff" },
    eff_cr:    { name: "Efficiency vs. conversion ratio", title: "Peak efficiency vs. conversion ratio V_OUT / V_IN", x: "cr", y: "eff" },
    eff_fsw:   { name: "Efficiency vs. f_sw", title: "Peak efficiency vs. switching frequency", x: "fsw", y: "eff" },
    pd_eff:    { name: "Power density vs. efficiency", title: "Power density vs. peak efficiency", x: "eff", y: "pd" },
    loss_trend:{ name: "Loss trend by year", title: "Lowest loss (100 − peak efficiency) over time", x: "y", y: "loss", ref: refLossTrend, faint: true },
    custom:    { name: "Custom axes…", title: "" }
  };
  function chartDef() {
    var c = CHARTS[F.chart] || CHARTS.eff_iout;
    if (c !== CHARTS.custom) return c;
    var x = AX[F.x] ? F.x : "iout", y = AX[F.y] ? F.y : "eff";
    return { title: AX[y].name + " vs. " + AX[x].name, x: x, y: y, custom: true };
  }
  function isLog(key, override) { return override ? override === "log" : !!AX[key].log; }
  function tickText(key, v) {
    var a = AX[key];
    if (a.fmt) return a.fmt(v);
    if (a.unit) return fmtSI(v, a.unit);
    if (key === "y") return String(Math.round(v));
    return String(+v.toPrecision(6));
  }

  /* ------------------------------------------------------------ plot: reference lines */
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function smallest(a, n) { return a.slice().sort(function (p, q) { return p - q; }).slice(0, n); }
  function sweep(lo, hi, n, log) {
    var out = [];
    for (var i = 0; i <= n; i++) { var t = lo + (hi - lo) * i / n; out.push(log ? Math.pow(10, t) : t); }
    return out;
  }
  function fit(xs, ys) {
    var mx = mean(xs), my = mean(ys), num = 0, den = 0;
    xs.forEach(function (x, i) { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    var m = den ? num / den : 0;
    return { m: m, c: my - m * mx };
  }
  // the lowest loss so far: geometric mean of the three best designs up to each year
  function refLossTrend(pts) {
    pts = pts.filter(function (p) { return p.f.loss > 0; });
    if (pts.length < 3) return [];
    var ys = pts.map(function (p) { return p.f.y; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), best = [];
    for (var y = lo; y <= hi; y++) {
      var v = pts.filter(function (p) { return p.f.y <= y; }).map(function (p) { return Math.log10(p.f.loss); });   // cumulative, in decades
      if (v.length >= 3) best.push([y, mean(smallest(v, 3))]);
    }
    if (best.length < 2) return [];
    return [{ cls: "series", color: "#d0365a", marker: true, label: "Lowest loss so far (3-paper geometric mean)",
      pts: best.map(function (b) { return [b[0], Math.pow(10, b[1])]; }) }];
  }

  /* ------------------------------------------------------------ plot: colours */
  var VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  function ramp(t) {
    t = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
    var i = Math.min(Math.floor(t), VIRIDIS.length - 2), u = t - i, a = VIRIDIS[i], b = VIRIDIS[i + 1];
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * u); }).join(",") + ")";
  }
  function colourScale(pts) {
    if (F.color === "arch") return { of: function (p) { return ARCH_COLORS[p.prim] || ARCH_COLORS.Other; } };
    if (F.color === "type") return { of: function (p) { return TYPE_COLORS[p.ty] || ARCH_COLORS.Other; } };
    var key = F.color === "year" ? "y" : "iout", log = key === "iout";
    var vals = pts.map(function (p) { return p.f[key]; }).filter(function (v) { return v > 0; }).map(function (v) { return log ? Math.log10(v) : v; });
    if (!vals.length) return { of: function () { return ARCH_COLORS.Other; } };
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    return {
      of: function (p) { var v = p.f[key]; if (!(v > 0)) return ARCH_COLORS.Other; v = log ? Math.log10(v) : v; return ramp(hi > lo ? (v - lo) / (hi - lo) : 0.5); },
      bar: { lo: log ? fmtSI(Math.pow(10, lo), "A") : String(lo), hi: log ? fmtSI(Math.pow(10, hi), "A") : String(hi),
        name: key === "y" ? "Year" : "I_out,max" }
    };
  }

  /* ------------------------------------------------------------ plot: drawing */
  function niceStep(r) { var e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; }
  function domainOf(vals, log, intOnly) {
    if (!vals.length) return log ? [0, 1] : [0, 10];
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (log) { lo = Math.floor(lo); hi = Math.ceil(hi); if (hi - lo < 1) { lo -= 1; hi += 1; } return [lo, hi]; }
    var pad = (hi - lo) * 0.05 || 1; lo -= pad; hi += pad;
    var st = Math.max(niceStep((hi - lo) / 6), intOnly ? 1 : 0);
    return [Math.floor(lo / st) * st, Math.ceil(hi / st) * st];
  }
  function ticksOf(dom, log, room) {
    var t = [];
    if (log) {
      var step = Math.max(1, Math.ceil((dom[1] - dom[0]) / Math.max(2, room)));
      for (var e = Math.ceil(dom[0] - 1e-9); e <= dom[1] + 1e-9; e += step) t.push(e);
      if (t.length < 3) {   // zoomed into about a decade: 1-2-5 ticks
        t = [];
        for (var d = Math.floor(dom[0]); d <= dom[1]; d++) [1, 2, 5].forEach(function (m) {
          var v = d + Math.log10(m);
          if (v >= dom[0] - 1e-9 && v <= dom[1] + 1e-9) t.push(v);
        });
      }
      return t;
    }
    var st = niceStep((dom[1] - dom[0]) / Math.max(2, room));
    for (var v = Math.ceil(dom[0] / st) * st; v <= dom[1] + st * 1e-9; v += st) t.push(+v.toPrecision(12));
    return t;
  }
  function renderPlotControls(c) {
    $("chart").value = CHARTS[F.chart] ? F.chart : "energy";
    $("axes").hidden = !c.custom;
    if (c.custom) {
      $("ax-x").value = c.x; $("ax-y").value = c.y;
      $("ax-xlog").checked = isLog(c.x, F.xs); $("ax-ylog").checked = isLog(c.y, F.ys);
    }
    $("color").value = F.color;
    $("hl").value = F.hl;
    $("zoom-reset").hidden = !F.zoom;
    $("plot-title").textContent = c.title;
  }
  function renderPlot() {
    var c = chartDef();
    renderPlotControls(c);
    var xlog = c.custom ? isLog(c.x, F.xs) : !!AX[c.x].log, ylog = c.custom ? isLog(c.y, F.ys) : !!AX[c.y].log;
    var ok = function (p) {
      var x = p.f[c.x], y = p.f[c.y];
      return x != null && y != null && isFinite(x) && isFinite(y) && (!xlog || x > 0) && (!ylog || y > 0);
    };
    var vq = VQ[F.vq] || 0;
    var pts = VIEW.filter(function (p) { return p.f && ok(p) && (!vq || (quality(p, c.x) >= vq && quality(p, c.y) >= vq)); });
    var sur = [];
    var tx = function (v) { return xlog ? Math.log10(v) : v; }, ty = function (v) { return ylog ? Math.log10(v) : v; };

    var W = Math.max(320, Math.round($("plot").clientWidth || 820));   // draw at real pixel width so text stays legible
    var narrow = W < 560;
    var H = narrow ? Math.round(W * 0.95) : Math.min(460, Math.round(W * 0.54));
    var L = narrow ? 52 : 66, R = W - (narrow ? 8 : 18), T = 14, B = H - 46;
    var dx = domainOf(pts.map(function (p) { return tx(p.f[c.x]); }), xlog, c.x === "y");
    var dy = domainOf(pts.map(function (p) { return ty(p.f[c.y]); }), ylog, c.y === "y");
    var zm = (F.zoom || "").split(",").map(Number);   // drag-zoom box, in axis units (log10 for log axes)
    if (zm.length === 4 && zm.every(isFinite) && zm[1] > zm[0] && zm[3] > zm[2]) { dx = [zm[0], zm[1]]; dy = [zm[2], zm[3]]; }
    var sx = function (v) { return L + (v - dx[0]) / (dx[1] - dx[0]) * (R - L); };
    var sy = function (v) { return B - (v - dy[0]) / (dy[1] - dy[0]) * (B - T); };
    var X = function (v) { return sx(tx(v)); }, Y = function (v) { return sy(ty(v)); };

    var g = [];
    g.push('<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="pc"><rect x="' + L + '" y="' + T + '" width="' + (R - L) + '" height="' + (B - T) + '"/></clipPath></defs>');
    g.push('<g class="axis">');
    ticksOf(dx, xlog, Math.floor((R - L) / (narrow ? 70 : 80))).forEach(function (v) {
      g.push('<line class="gridline" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + B + '"/>');
      g.push('<text x="' + sx(v) + '" y="' + (B + 18) + '" text-anchor="middle">' + esc(tickText(c.x, xlog ? Math.pow(10, v) : v)) + "</text>");
    });
    ticksOf(dy, ylog, Math.floor((B - T) / 42)).forEach(function (v) {
      g.push('<line class="gridline" x1="' + L + '" x2="' + R + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/>');
      g.push('<text x="' + (L - 8) + '" y="' + (sy(v) + 4) + '" text-anchor="end">' + esc(tickText(c.y, ylog ? Math.pow(10, v) : v)) + "</text>");
    });
    g.push('<line x1="' + L + '" x2="' + R + '" y1="' + B + '" y2="' + B + '"/><line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + B + '"/></g>');
    g.push('<text class="axis-title" x="' + ((L + R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(AX[c.x].label) + "</text>");
    g.push('<text class="axis-title" transform="translate(12 ' + ((T + B) / 2) + ') rotate(-90)" text-anchor="middle">' + esc(AX[c.y].label) + "</text>");

    var refs = c.ref ? c.ref(pts, dx.map(function (v) { return xlog ? Math.pow(10, v) : v; })) : [];
    g.push('<g clip-path="url(#pc)">');
    refs.forEach(function (r) {
      var d = r.pts.filter(function (q) { return isFinite(q[1]) && (!ylog || q[1] > 0); })
        .map(function (q, i) { return (i ? "L" : "M") + X(q[0]).toFixed(1) + " " + Y(q[1]).toFixed(1); }).join("");
      if (d) g.push('<path class="' + r.cls + '" d="' + d + '"' + (r.color ? ' style="stroke:' + r.color + '"' : "") + "/>");
      if (r.marker) r.pts.forEach(function (q) {
        g.push('<rect class="mk" x="' + (X(q[0]) - 3).toFixed(1) + '" y="' + (Y(q[1]) - 3).toFixed(1) + '" width="6" height="6" style="fill:' + r.color + '"/>');
      });
    });
    g.push("</g>");
    refs.forEach(function (r) {   // contour tags where each line leaves the plot
      if (!r.tag) return;
      var last = null;
      r.pts.forEach(function (q) {
        if (!(q[1] > 0) && ylog) return;
        var px = X(q[0]), py = Y(q[1]);
        if (px >= L + 4 && px <= R - 44 && py >= T + 10 && py <= B - 4) last = [px, py];
      });
      if (last) g.push('<text class="fomlabel" x="' + (last[0] + 4) + '" y="' + (last[1] - 4) + '">' + esc(r.tag) + "</text>");
    });
    var named = refs.filter(function (r) { return r.label; });
    if (named.length) {
      var lw = narrow ? 200 : 290, lh = 16, lx = L + 8, ly = T + 6;
      g.push('<g class="curve-legend"><rect x="' + lx + '" y="' + ly + '" width="' + lw + '" height="' + (named.length * lh + 8) + '" rx="4"/>');
      named.forEach(function (r, i) {
        var yy = ly + 12 + i * lh;
        g.push('<line class="' + r.cls + '" x1="' + (lx + 6) + '" x2="' + (lx + 28) + '" y1="' + yy + '" y2="' + yy + '"' + (r.color ? ' style="stroke:' + r.color + '"' : "") + "/>");
        g.push('<text x="' + (lx + 34) + '" y="' + (yy + 4) + '">' + esc(r.label) + "</text>");
      });
      g.push("</g>");
    }

    if (!pts.length) {
      g.push('<text class="placeholder" x="' + ((L + R) / 2) + '" y="' + ((T + B) / 2) + '" text-anchor="middle">' +
        (ALL.length ? "Nothing in this selection reports both values." : "No data yet.") + "</text>");
    }
    var col = colourScale(pts), r0 = narrow ? 3.2 : 4.3;
    g.push('<g clip-path="url(#pc)">');
    // filled: hand-checked numbers; rings: parsed automatically. Newest on top.
    // highlight: papers from the last F.hl years on top, the rest dimmed
    var hot = function (p) { return !F.hl || (p.y || 0) > YMAX - +F.hl; };
    var used = {};
    pts.slice().sort(function (a, b) { return (hot(a) - hot(b)) || (a.d || "").localeCompare(b.d || ""); }).forEach(function (p) {
      var fill = col.of(p), q = Math.min(quality(p, c.x), quality(p, c.y)), ring = q < 3;
      var px = X(p.f[c.x]), py = Y(p.f[c.y]);
      if (F.color === "arch" && px >= L && px <= R && py >= T && py <= B) used[p.prim] = fill;   // legend of what is visible
      g.push('<circle data-id="' + esc(p.id) + '" class="' + (ring ? "ring" : "dot") + (q === 2 ? " ai" : "") + (c.faint ? " faint" : "") + (hot(p) ? "" : " dim") +
        '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r0 + '" style="' + (ring ? "stroke:" + fill : "fill:" + fill) + '"/>');
    });
    g.push("</g></svg>");
    $("plot").innerHTML = g.join("");
    PG = { W: W, H: H, L: L, R: R, T: T, B: B, dx: dx, dy: dy, title: c.title, bar: col.bar,
      legend: Object.keys(used).map(function (k) { return [k, used[k]]; }) };

    var miss = {}, nMiss = 0, shown = {};
    pts.forEach(function (p) { shown[p.id] = 1; });
    VIEW.forEach(function (p) {
      if (shown[p.id]) return;
      nMiss++;
      [c.x, c.y].forEach(function (k) { if (p.f && p.f[k] == null) miss[k] = (miss[k] || 0) + 1; });
    });
    var nSys = VIEW.filter(function (p) { return p.sys && !shown[p.id]; }).length;
    var why = Object.keys(miss).sort(function (a, b) { return miss[b] - miss[a]; })
      .map(function (k) { return miss[k] + " without " + AX[k].name.toLowerCase(); });
    var note = (pts.length ? pts.length + " of " + VIEW.length + " papers shown (filled: checked values; dashed rings: AI-extracted; rings: parsed from titles and abstracts)."
      : "No paper in this selection reports both values.") + (nMiss ? " Not shown: " + (why.length ? why.join(", ") : nMiss + " below the selected value quality") + "." : "") +
      (nSys ? " " + nSys + " of them are papers where the converter is a block, whose numbers are not shown." : "");
    if (c === CHARTS.jp) note += " Dashed lines are constant FoM_J = 10 log[(σ/1 s)²·(P/1 mW)].";
    $("plot-note").innerHTML = (col.bar ? '<span class="cbar"><span>' + esc(col.bar.name + " " + col.bar.lo) +
      '</span><span class="ramp"></span><span>' + esc(col.bar.hi) + "</span></span>" : "");
  }

  /* ------------------------------------------------------------ rendering: rows */
  var SYS_DASH = '<span class="del" title="The converter is a block of a larger system or only mentioned in the abstract; the numbers in the paper are not shown">—</span>';
  var REPO = "https://github.com/mixedcas-lab/pmic-census";
  function fixURL(p) {   // a prefilled GitHub issue: the lab checks it and adds the row to data/annotations.csv
    var vals = Object.keys(p.s).filter(function (k) { return ANN_KEYS.indexOf(k) >= 0; }).map(function (k) {
      return k + " = " + p.s[k] + " (" + (SRC[p.vs[k] || "t"] || ["", "parsed"])[1].toLowerCase() + ")";
    });
    var body = ["Paper: " + p.t, "IEEE id: " + p.id + (p.url ? " (" + p.url + ")" : ""), "",
      "Field(s) to correct (" + ANN_KEYS.join(", ") + "):", "Correct value with unit (or - if the paper does not report it):",
      "Where in the paper (table, figure or page):", "", "Values shown now:"].concat(vals.length ? vals : ["(none)"]).concat(["",
      "annotations.csv row to fill in:", "id," + ANN_HEAD.slice(1).join(","), p.id + "," + ANN_HEAD.slice(1).map(function () { return ""; }).join(",")]).join("\n");
    return REPO + "/issues/new?title=" + encodeURIComponent("Correction: " + p.t.slice(0, 80)) + "&body=" + encodeURIComponent(body);
  }
  function badge() { return ""; }   // sources are in the cell tooltip only (badges made the table busy)
  function spec(p, k, text, lbl) {
    if (p.ver[k] === "deleted") return '<span class="spec"><span class="lbl">' + lbl + '</span><span class="del" title="Removed by the lab: not reported or wrong">—</span></span>';
    if (!text) return '<span class="spec"></span>';
    var src = p.vs[k] || "t";
    return '<span class="spec' + (RANK[src] >= 3 ? "" : src === "ai" ? " ai" : " auto") + '" title="' + esc(SRC[src][1]) + '"><span class="lbl">' + lbl + "</span>" + text + "</span>";
  }
  function dB(v) { return v == null ? "" : v.toFixed(1) + " dB"; }
  function rowHTML(p) {
    var html = rowCells(p);
    return p.sys ? html.split('<span class="spec"></span>').join('<span class="spec">' + SYS_DASH + "</span>") : html;
  }
  function rowCells(p) {
    var au = p.au || [];
    var names = au.filter(function (a) { return a !== "et al."; }).join(", ");   // every author
    var tags = (p.ty ? ['<span class="tag arch" style="background:' + TYPE_COLORS[p.ty] + '">' + esc(p.ty) + "</span>"] : [])
      .concat(p.ar.map(function (a) {
        return '<span class="tag arch" style="background:' + (ARCH_COLORS[a] || ARCH_COLORS.Other) + '">' + esc(a) + "</span>";
      })).concat(p.ap.map(function (a) { return '<span class="tag">' + esc(a) + "</span>"; }));
    if (p.cal) tags.push('<span class="tag">Calibration</span>');
    if (p.ct === "EA") tags.push('<span class="tag">Early access</span>');
    if (p.lv !== "core") tags.push('<span class="tag lv">Converter as a block or in the abstract only</span>');
    if (p.conflicts.length) tags.push('<span class="tag warn" title="An AI-extracted value differs from the checked value; the latter is shown">Review: ' +
      esc(p.conflicts.join(", ")) + "</span>");
    var fresh = p.first === META.updated && META.last_run_new;
    var conv = p.s.vin != null || p.s.vout != null ? (p.s.vin != null ? fmtSI(p.s.vin, "V") : "?") + " → " + (p.s.vout != null ? fmtSI(p.s.vout, "V") : "?") : "";
    var dens = p.s.pd != null ? spec(p, "pd", +p.s.pd.toPrecision(3) + " W/mm²", "Density") : spec(p, "cd", p.s.cd != null ? +p.s.cd.toPrecision(3) + " A/mm²" : "", "Density");
    return '<div class="tr" role="row" data-id="' + esc(p.id) + '">' +
      '<div class="pub" role="cell"><span class="venue">' + esc(p.v) + "</span><span>" + esc(fmtDate(p.d)) + "</span>" +
      (fresh ? '<span class="new">New</span>' : "") +
      '<label class="cmp"><input type="checkbox" data-cmp="' + esc(p.id) + '"' + (F.cmp.indexOf(p.id) >= 0 ? " checked" : "") + "> Compare</label>" +
      (/^m:/.test(p.id) ? "" : '<a class="fix" href="' + esc(fixURL(p)) + '" target="_blank" rel="noopener" title="Open a GitHub issue to correct a value">Report a fix</a>') + "</div>" +
      '<div class="paper" role="cell"><a class="title" href="' + esc(p.url || (p.doi ? "https://doi.org/" + p.doi : "#")) +
      '" target="_blank" rel="noopener">' + esc(p.t) + "</a>" +
      (names ? '<p class="by">' + esc(names) + "</p>" : "") +
      (p.note ? '<p class="by note">' + esc(p.note) + "</p>" : "") +
      ((p.org || []).length ? '<p class="by org">' + esc(p.org.slice(0, 2).join("; ")) + "</p>" : "") +
      (tags.length ? '<div class="tags">' + tags.join("") + "</div>" : "") + "</div>" +
      spec(p, p.s.vin != null ? "vin" : "vout", conv, "V_in → V_out") +
      spec(p, "iout", fmtSI(p.s.iout, "A"), "I_out") +
      spec(p, "eff", p.s.eff != null ? +p.s.eff.toFixed(1) + " %" : "", "Peak η") +
      spec(p, "fsw", fmtSI(p.s.fsw, "Hz"), "f_sw") +
      dens +
      spec(p, "node", p.s.node ? p.s.node + " nm" : "", "Node") + "</div>";
  }
  var CMP_ROWS = [
    ["Venue", function (p) { return esc(p.v + " " + (p.y || "")); }],
    ["Type", function (p) { return esc(p.ty || ""); }],
    ["Architecture", function (p) { return esc(p.ar.join(", ")); }],
    ["Application", function (p) { return esc(p.ap.join(", ")); }],
    ["V_IN", "vin", function (v) { return fmtSI(v, "V"); }], ["V_OUT", "vout", function (v) { return fmtSI(v, "V"); }],
    ["Conversion ratio", function (p) { return p.cr ? +p.cr.toPrecision(3) + "" : ""; }],
    ["I_out,max", "iout", function (v) { return fmtSI(v, "A"); }],
    ["P_out", function (p) { return p.s.pout != null ? fmtSI(p.s.pout, "W") : p.poutCalc ? "≈" + fmtSI(p.poutCalc, "W") + " (calc.)" : ""; }],
    ["Peak efficiency", "eff", function (v) { return +v.toFixed(2) + " %"; }],
    ["Switching frequency", "fsw", function (v) { return fmtSI(v, "Hz"); }], ["Inductance", "ind", function (v) { return fmtSI(v, "H"); }],
    ["Power density", "pd", function (v) { return +v.toPrecision(3) + " W/mm²"; }], ["Current density", "cd", function (v) { return +v.toPrecision(3) + " A/mm²"; }],
    ["Quiescent current", "iq", function (v) { return fmtSI(v, "A"); }], ["Output ripple", "ripple", function (v) { return fmtSI(v, "V"); }],
    ["Load-transient droop", "dv", function (v) { return fmtSI(v, "V"); }],
    ["Node", "node", function (v) { return v + " nm"; }], ["Area", "area", function (v) { return v + " mm²"; }],
    ["Calibration", function (p) { return p.cal ? "yes" : ""; }],
    ["Link", function (p) { return '<a href="' + esc(p.url || (p.doi ? "https://doi.org/" + p.doi : "#")) + '" target="_blank" rel="noopener">IEEE Xplore</a>'; }]
  ];
  function renderCompare() {
    var sel = F.cmp.map(function (id) { return BYID[id]; }).filter(Boolean);
    $("cmpbar").hidden = !sel.length;
    $("cmpn").textContent = sel.length;
    if (!$("cmpdlg").open) return;
    var h = ['<table class="cmptable"><thead><tr><th></th>'];
    sel.forEach(function (p) { h.push('<th><span class="cmpt">' + esc(p.t) + '</span><button type="button" class="link-btn" data-uncmp="' + esc(p.id) + '">Remove</button></th>'); });
    h.push("</tr></thead><tbody>");
    CMP_ROWS.forEach(function (r) {
      h.push("<tr><th>" + esc(r[0]) + "</th>");
      sel.forEach(function (p) {
        var cell;
        if (typeof r[1] === "function") cell = r[1](p);
        else if (p.ver[r[1]] === "deleted") cell = "—";
        else cell = p.s[r[1]] != null ? esc(r[2](p.s[r[1]])) + badge(p, r[1]) : "";
        h.push("<td>" + cell + "</td>");
      });
      h.push("</tr>");
    });
    h.push("</tbody></table>");
    $("cmpbody").innerHTML = h.join("");
  }
  function renderRows() {
    var n = VIEW.length;
    $("count").innerHTML = "<strong>" + n.toLocaleString() + "</strong> " + (F.kind ? F.kind + " " : "") +
      "PMIC paper" + (n === 1 ? "" : "s");
    $("rows").innerHTML = VIEW.slice(0, LIMIT).map(rowHTML).join("");
    $("more").hidden = n <= LIMIT;
    $("more").textContent = "Show " + Math.min(PAGE, n - LIMIT) + " more of " + (n - LIMIT).toLocaleString();
    var empty = $("empty");
    if (!ALL.length) {
      empty.hidden = false;
      empty.innerHTML = "No papers yet. Run <code>python3 collector/build.py</code> on the lab server (see the README).";
    } else if (!n) {
      empty.hidden = false;
      empty.innerHTML = 'No papers match these filters. <button type="button" class="link-btn" id="reset2">Clear filters</button>';
      $("reset2").onclick = reset;
    } else empty.hidden = true;
  }

  function update(opts) {
    VIEW = ALL.filter(function (p) { return match(p); }).sort(SORTS[F.sort] || SORTS.date);
    if (!opts || !opts.keepLimit) LIMIT = PAGE;
    renderControls();
    renderLegend();
    renderPlot();
    renderRows();
    renderCompare();
    writeHash();
  }
  function reset() { F = defaults(); update(); }

  /* ------------------------------------------------------------ interaction */
  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function bind() {
    var t, tr;
    $("ranges").addEventListener("input", function (e) {
      if (!e.target.closest("input[data-rng]")) return;
      clearTimeout(tr);
      tr = setTimeout(function () {
        F.rng = Array.prototype.map.call($("ranges").querySelectorAll("input"), function (i) {
          var r = RANGES.filter(function (x) { return x.k === i.dataset.rng; })[0];
          return i.value.trim() ? r.k + r.op + i.value.trim() : "";
        }).filter(Boolean).join(";");
        update();
      }, 350);
    });
    $("vq").addEventListener("change", function (e) { F.vq = e.target.value; update(); });
    $("rows").addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-cmp]");
      if (!cb) return;
      var id = cb.dataset.cmp, i = F.cmp.indexOf(id);
      if (cb.checked && i < 0) { if (F.cmp.length >= 6) { cb.checked = false; return; } F.cmp.push(id); }
      if (!cb.checked && i >= 0) F.cmp.splice(i, 1);
      renderCompare(); writeHash();
    });
    $("cmpopen").addEventListener("click", function () { $("cmpdlg").showModal(); renderCompare(); });
    $("cmpclear").addEventListener("click", function () {
      F.cmp = []; document.querySelectorAll("input[data-cmp]").forEach(function (c) { c.checked = false; }); renderCompare(); writeHash();
    });
    $("cmpclose").addEventListener("click", function () { $("cmpdlg").close(); });
    $("cmpbody").addEventListener("click", function (e) {
      var b = e.target.closest("[data-uncmp]");
      if (!b) return;
      F.cmp.splice(F.cmp.indexOf(b.dataset.uncmp), 1);
      var c = document.querySelector('input[data-cmp="' + b.dataset.uncmp + '"]'); if (c) c.checked = false;
      renderCompare(); writeHash();
      if (!F.cmp.length) $("cmpdlg").close();
    });
    $("q").addEventListener("input", function (e) { clearTimeout(t); t = setTimeout(function () { F.q = e.target.value.trim(); update(); }, 160); });
    $("kind").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { F.kind = b.dataset.v; F.arch = []; update(); } });
    $("venues").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { toggle(F.venues, b.dataset.v); update(); } });
    $("apps").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { toggle(F.apps, b.dataset.v); update(); } });
    $("legend").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { toggle(F.arch, b.dataset.v); update(); } });
    $("y0").addEventListener("change", function (e) { F.y0 = e.target.value; update(); });
    $("y1").addEventListener("change", function (e) { F.y1 = e.target.value; update(); });
    $("country").addEventListener("change", function (e) { F.country = e.target.value; update(); });
    ["related", "cal", "fresh"].forEach(function (k) { $(k).addEventListener("change", function (e) { F[k] = e.target.checked; update(); }); });
    $("sort").addEventListener("change", function (e) { F.sort = e.target.value; update(); });
    $("reset").addEventListener("click", reset);
    $("more").addEventListener("click", function () { LIMIT += PAGE; renderRows(); });
    $("csv").addEventListener("click", downloadCSV);
    $("chart").addEventListener("change", function (e) { F.chart = e.target.value; F.xs = F.ys = F.zoom = ""; update({ keepLimit: true }); });
    $("ax-x").addEventListener("change", function (e) { F.x = e.target.value; F.xs = F.zoom = ""; update({ keepLimit: true }); });
    $("ax-y").addEventListener("change", function (e) { F.y = e.target.value; F.ys = F.zoom = ""; update({ keepLimit: true }); });
    $("ax-xlog").addEventListener("change", function (e) { F.xs = e.target.checked ? "log" : "lin"; F.zoom = ""; update({ keepLimit: true }); });
    $("ax-ylog").addEventListener("change", function (e) { F.ys = e.target.checked ? "log" : "lin"; F.zoom = ""; update({ keepLimit: true }); });
    $("color").addEventListener("change", function (e) { F.color = e.target.value; update({ keepLimit: true }); });
    $("hl").addEventListener("change", function (e) { F.hl = e.target.value; update({ keepLimit: true }); });
    $("zoom-reset").addEventListener("click", function () { F.zoom = ""; update({ keepLimit: true }); });
    $("dl-png").addEventListener("click", function () { exportPlot("png"); });
    $("dl-svg").addEventListener("click", function () { exportPlot("svg"); });
    bindZoom();

    var tip = $("tooltip"), fig = document.querySelector(".figure");
    $("plot").addEventListener("mousemove", function (e) {
      var c = e.target.closest("circle");
      if (!c) { tip.hidden = true; return; }
      var p = BYID[c.dataset.id];
      if (!p) { tip.hidden = true; return; }
      var f = p.f, ch = chartDef();
      var vals = [ch.x, ch.y].concat(["vin", "vout", "iout", "eff"]).filter(function (k, i, a) { return a.indexOf(k) === i && f[k] != null && k !== "y"; })
        .map(function (k) { return AX[k].name + " " + tickText(k, f[k]); });
      tip.innerHTML = "<b>" + esc(p.t) + "</b>" +
        esc(p.v + ", " + fmtDate(p.d) + (p.ty ? " · " + p.ty : "")) + "<br>" + esc(vals.join(", "));
      var r = fig.getBoundingClientRect();
      tip.hidden = false;
      var x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + 340 > r.width) x = e.clientX - r.left - 340 - 14;
      tip.style.left = Math.max(8, x) + "px"; tip.style.top = y + "px";
    });
    $("plot").addEventListener("mouseleave", function () { tip.hidden = true; });
    $("plot").addEventListener("click", function (e) {
      var c = e.target.closest("circle");
      if (!c) return;
      var idx = VIEW.indexOf(BYID[c.dataset.id]);
      if (idx >= LIMIT) { LIMIT = Math.ceil((idx + 1) / PAGE) * PAGE; renderRows(); }
      var row = document.querySelector('.tr[data-id="' + c.dataset.id + '"]');
      if (row) {
        document.querySelectorAll(".tr.hl").forEach(function (r) { r.classList.remove("hl"); });
        row.classList.add("hl");
        row.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      }
    });
    $("rows").addEventListener("mouseover", function (e) {
      var r = e.target.closest(".tr");
      document.querySelectorAll("#plot circle.hl").forEach(function (c) { c.classList.remove("hl"); });
      if (r) { var c = document.querySelector('#plot circle[data-id="' + r.dataset.id + '"]'); if (c) { c.classList.add("hl"); c.parentNode.appendChild(c); } }
    });
    window.addEventListener("hashchange", function () { F = defaults(); readHash(); update(); });
    var rw, lastW = $("plot").clientWidth;
    window.addEventListener("resize", function () {
      clearTimeout(rw);
      rw = setTimeout(function () { if ($("plot").clientWidth !== lastW) { lastW = $("plot").clientWidth; renderPlot(); } }, 150);
    });
  }

  /* ------------------------------------------------------------ plot: drag-zoom and export */
  function plotXY(e) {   // pointer position in SVG user units
    var svg = $("plot").querySelector("svg"), r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) * PG.W / r.width, (e.clientY - r.top) * PG.H / r.height];
  }
  function bindZoom() {
    var start = null, box = null;
    $("plot").addEventListener("mousedown", function (e) {
      if (e.button !== 0 || !PG) return;
      var q = plotXY(e);
      if (q[0] < PG.L || q[0] > PG.R || q[1] < PG.T || q[1] > PG.B) return;
      start = q;
      e.preventDefault();
    });
    window.addEventListener("mousemove", function (e) {
      if (!start) return;
      var q = plotXY(e), svg = $("plot").querySelector("svg");
      if (!box) { box = document.createElementNS("http://www.w3.org/2000/svg", "rect"); box.setAttribute("class", "zoombox"); svg.appendChild(box); }
      var x0 = Math.max(PG.L, Math.min(start[0], q[0])), x1 = Math.min(PG.R, Math.max(start[0], q[0]));
      var y0 = Math.max(PG.T, Math.min(start[1], q[1])), y1 = Math.min(PG.B, Math.max(start[1], q[1]));
      box.setAttribute("x", x0); box.setAttribute("y", y0); box.setAttribute("width", x1 - x0); box.setAttribute("height", y1 - y0);
    });
    window.addEventListener("mouseup", function (e) {
      if (!start) return;
      var q = plotXY(e), a = start;
      start = null;
      if (box) { box.remove(); box = null; }
      if (Math.abs(q[0] - a[0]) < 8 || Math.abs(q[1] - a[1]) < 8) return;   // a click, not a drag
      var ux = function (px) { return PG.dx[0] + (Math.max(PG.L, Math.min(PG.R, px)) - PG.L) / (PG.R - PG.L) * (PG.dx[1] - PG.dx[0]); };
      var uy = function (py) { return PG.dy[0] + (PG.B - Math.max(PG.T, Math.min(PG.B, py))) / (PG.B - PG.T) * (PG.dy[1] - PG.dy[0]); };
      var z = [ux(Math.min(a[0], q[0])), ux(Math.max(a[0], q[0])), uy(Math.max(a[1], q[1])), uy(Math.min(a[1], q[1]))];
      F.zoom = z.map(function (v) { return +v.toPrecision(5); }).join(",");
      update({ keepLimit: true });
    });
    $("plot").addEventListener("dblclick", function () { if (F.zoom) { F.zoom = ""; update({ keepLimit: true }); } });
  }
  var STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity",
    "font-size", "font-family", "font-weight", "font-style"];
  function exportPlot(fmt) {
    var svg = $("plot").querySelector("svg");
    if (!svg || !PG) return;
    var clone = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
    for (var i = 0; i < src.length; i++) {   // CSS variables and classes do not survive outside the page: inline them
      var cs = getComputedStyle(src[i]);
      dst[i].setAttribute("style", STYLE_PROPS.map(function (k) { return k + ":" + cs.getPropertyValue(k); }).join(";").replace(/"/g, "'"));
      dst[i].removeAttribute("class");
    }
    var page = getComputedStyle(document.querySelector(".figure")), ink = getComputedStyle(document.body).color;
    var font = "font-family:" + getComputedStyle(document.body).fontFamily.replace(/"/g, "'") + ";fill:" + ink;
    var leg = PG.legend.slice(0, 18), lw = leg.length || PG.bar ? 190 : 0, th = 34, fh = 22;
    var W = PG.W + lw, H = PG.H + th + fh, o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">');
    o.push('<rect width="' + W + '" height="' + H + '" style="fill:' + page.backgroundColor + '"/>');
    o.push('<text x="14" y="23" style="' + font + ';font-size:16px;font-weight:600">' + esc(PG.title) + "</text>");
    o.push('<g transform="translate(0 ' + th + ')">' + clone.innerHTML + "</g>");
    var ly = th + PG.T + 8, lx = PG.W + 6;
    if (leg.length) {
      leg.forEach(function (e, k) {
        o.push('<circle cx="' + (lx + 6) + '" cy="' + (ly + k * 18) + '" r="5" style="fill:' + e[1] + '"/>');
        o.push('<text x="' + (lx + 18) + '" y="' + (ly + k * 18 + 4) + '" style="' + font + ';font-size:12px">' + esc(e[0]) + "</text>");
      });
      ly += leg.length * 18 + 8;
    } else if (PG.bar) {
      o.push('<text x="' + lx + '" y="' + ly + '" style="' + font + ';font-size:12px">' + esc(PG.bar.name + ": " + PG.bar.lo + " → " + PG.bar.hi) + "</text>");
      ly += 22;
    }
    if (lw) {
      o.push('<circle cx="' + (lx + 6) + '" cy="' + ly + '" r="4.5" style="fill:' + ink + '"/><text x="' + (lx + 18) + '" y="' + (ly + 4) + '" style="' + font + ';font-size:11px">checked / survey value</text>');
      o.push('<circle cx="' + (lx + 6) + '" cy="' + (ly + 16) + '" r="4.5" style="fill:none;stroke:' + ink + ';stroke-width:1.6"/><text x="' + (lx + 18) + '" y="' + (ly + 20) + '" style="' + font + ';font-size:11px">parsed automatically</text>');
    }
    o.push('<text x="14" y="' + (H - 7) + '" style="' + font + ';font-size:10.5px;fill-opacity:0.6">PMIC Census · ' +
      esc(location.origin + location.pathname) + " · " + esc(META.updated || "") + "</text></svg>");
    var xml = o.join(""), name = "pmic-census-" + (F.chart === "custom" ? F.x + "-vs-" + F.y : F.chart) + "-" + (META.updated || "plot");
    var save = function (blob, ext) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name + "." + ext;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    if (fmt === "svg") return save(new Blob([xml], { type: "image/svg+xml" }), "svg");
    var img = new Image(), scale = 3;
    img.onload = function () {
      var cv = document.createElement("canvas");
      cv.width = W * scale; cv.height = H * scale;
      var cx = cv.getContext("2d"); cx.scale(scale, scale); cx.drawImage(img, 0, 0);
      cv.toBlob(function (b) { save(b, "png"); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  }

  function downloadCSV() {
    var cols = ["id", "date", "venue", "title", "authors", "affiliations", "countries", "type", "architectures", "applications",
      "calibration", "v_in_V", "v_out_V", "i_out_max_A", "p_out_W", "peak_efficiency_pct", "f_sw_Hz", "inductance_H",
      "power_density_W_mm2", "current_density_A_mm2", "i_q_A", "ripple_V", "droop_V", "node_nm", "area_mm2", "value_sources", "url", "doi"];
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.join(",")].concat(VIEW.map(function (p) {
      var s = p.s;
      return [p.id, p.d, p.v, p.t, (p.au || []).join("; "), (p.org || []).join("; "), (p.cn || []).join("; "), p.ty,
        p.ar.join("; "), p.ap.join("; "), p.cal ? "yes" : "", s.vin, s.vout, s.iout, s.pout, s.eff, s.fsw, s.ind, s.pd, s.cd,
        s.iq, s.ripple, s.dv, s.node, s.area,
        Object.keys(p.vs).filter(function (k) { return s[k] != null || p.ver[k] === "deleted"; }).map(function (k) {
          return k + ":" + (p.ver[k] === "deleted" ? "deleted" : { t: "title", a: "abstract" }[p.vs[k]] || p.vs[k]);
        }).join("; "), p.url, p.doi].map(q).join(",");
    }));
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pmic-census-" + (META.updated || "export") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ------------------------------------------------------------ boot */
  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  function getText(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }); }

  Promise.all([getJSON("data/meta.json").catch(function () { return {}; }), getJSON("data/papers.json").catch(function () { return []; }),
    getText("data/annotations.csv")])
    .then(function (res) {
      META = res[0] || {};
      $("chart").innerHTML = Object.keys(CHARTS).map(function (k) { return '<option value="' + k + '">' + esc(CHARTS[k].name) + "</option>"; }).join("");
      var axo = Object.keys(AX).map(function (k) { return '<option value="' + k + '">' + esc(AX[k].name) + "</option>"; }).join("");
      $("ax-x").innerHTML = axo; $("ax-y").innerHTML = axo;
      ALL = applyAnnotations(res[1] || [], parseCSV(res[2] || ""));
      ALL.forEach(function (p) { BYID[p.id] = p; if (p.y > YMAX) YMAX = p.y; });

      var nC = ALL.filter(function (p) { return p.lv === "core"; }).length;
      var venues = Object.keys(META.by_venue || {}).length;
      if (ALL.length) {
        $("lede").innerHTML = "<strong>" + nC.toLocaleString() + " power-management IC papers</strong> (DC-DC converters, PMICs, chargers, harvesters) from " + venues +
          " IEEE circuits venues, " + esc(fmtDate(META.coverage_from)) + " to " + esc(fmtDate(META.coverage_to)) +
          ". Updated automatically on the 15th of every month; last update " + esc(META.updated || "") + (META.last_run_new ? ", with " + META.last_run_new + " papers added in the latest update." : ".");
      } else {
        $("lede").textContent = "A monthly index of power-management IC papers in ISSCC, VLSI, JSSC, CICC, ESSCIRC, A-SSCC, SSC-L, TCAS-I/II and TVLSI.";
      }
      $("fresh").parentNode.hidden = !META.last_run_new;

      var years = ALL.map(function (p) { return p.y; }).filter(Boolean);
      var ymin = years.length ? Math.min.apply(null, years) : 2023, ymax = years.length ? Math.max.apply(null, years) : new Date().getFullYear();
      var opts = "";
      for (var y = ymax; y >= ymin; y--) opts += '<option value="' + y + '">' + y + "</option>";
      $("y0").innerHTML = '<option value="">Any</option>' + opts;
      $("y1").innerHTML = '<option value="">Any</option>' + opts;

      readHash();
      bind();
      update();
    })
    .catch(function (err) {
      $("lede").textContent = "The paper index could not be loaded (" + err.message + ").";
    });
})();
