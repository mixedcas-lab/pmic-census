"""Classification and spec extraction for power-management IC papers: switching DC-DC converters
(inductive, switched-capacitor, hybrid), PMICs/PMUs, battery chargers and energy-harvesting power stages.

Pure functions (no network, no files) so they can be unit-tested and re-run over the
cached records whenever the rules change. Abstracts are inputs only; they are never
written to the output.
"""
import re

I = re.IGNORECASE

# ---------------------------------------------------------------- relevance
PMIC_PAT = re.compile(
    r"\bDC[- –]?DC\b|\bbuck\b|\bboost (?:converter|regulator)|buck[- –]boost|switched[- ]capacitor (?:DC|converter|voltage regulator|power|regulator)|"
    r"\bSC (?:converter|DC|regulator)|hybrid (?:DC|converter|buck|switched|step)|\bPMIC\b|\bPMU\b|power[- ]management (?:IC|unit|circuit|system|chip)|"
    r"battery charg|charger\b|energy[- ]harvest(?:ing|er)\b|harvesting (?:rectifier|interface)|integrated voltage regulator|\bIVR\b|\bSIMO\b|"
    r"single[- ]inductor (?:multiple|dual|triple)[- ]output|(?:power|step[- ](?:down|up)|switching) converter|\b(?:48|24|12)\s*-?\s*V[- ]to[- ]|"
    r"flying[- ]capacitor|multi[- ]?level (?:buck|converter|DC)|three[- ]level (?:buck|boost|converter)|series[- ]capacitor|"
    r"resonant (?:switched|SC|DC|converter)|charge[- ]pump (?:converter|DC|regulator)|voltage regulator module|\bVRM\b|point[- ]of[- ]load", I)
# power electronics at system scale (grids, motors, PV plants) is not an IC paper
POWER_SYSTEM = re.compile(r"three[- ]phase|grid[- ](?:connected|tied|forming)|\bmicrogrid|motor drive|photovoltaic (?:system|array|inverter)|"
                          r"\bkW\b|traction|wind turbine|electric vehicle (?:charger|charging station)|power system stabil|HVDC", I)
# an LDO alone belongs to ldo-census
LDO_ONLY = re.compile(r"\bLDO|low[- ]drop|linear regulator", I)
HOST = re.compile(r"\b(?:processor|SoC|microcontroller|\bMCU\b|transceiver|receiver|radio|sensor node|neural|implant\w*|system|platform)s?\b"
                  r".{0,80}?\b(?:with|using|featuring|including|integrat\w*)\b", I)

NON_PAPER = re.compile(
    r"^(front cover|back cover|table of contents|contents|author index|index|"
    r"call for papers|editorial|guest editorial|reviewers|session \d+ overview|"
    r"(?:tutorials?|short course|evening (?:event|session)|forum|panel)(?=\s*:|\s*$)|"
    r"(ieee )?(transactions|journal) .*information|blank page|copyright)\b", I)


def relevance(title, abstract):
    """Return 'core', 'related' or None."""
    t = title or ""
    m = PMIC_PAT.search(t)
    if m:
        if POWER_SYSTEM.search(t):
            return None
        if LDO_ONLY.search(t) and not re.search(r"\bDC[- –]?DC|buck|boost|switched[- ]capacitor|\bPMU|\bPMIC|charger|harvest", t, I):
            return None
        h = HOST.search(t)
        if h and h.start() < m.start():
            return "related"
        return "core"
    if re.search(r"\bDC[- –]?DC converter|buck converter|switched[- ]capacitor converter|\bPMIC\b", abstract or "", I) and not POWER_SYSTEM.search(t):
        return "related"
    return None


# ------------------------------------------------------------- type / architecture / application
def pmic_type(title, abstract):
    text = (title or "") + " " + (abstract or "")
    t = title or ""
    if re.search(r"hybrid|series[- ]capacitor|flying[- ]capacitor|multi[- ]?level|(?:three|four|five|six|seven|eight)[- ]level|[2-9][- ]level|resonant switched|"
                 r"switched[- ]capacitor[- ](?:buck|inductor)|\bSC[- ](?:buck|inductor)", t, I):
        return "Hybrid"
    if re.search(r"switched[- ]capacitor|\bSC\b (?:converter|DC|regulator)|charge[- ]pump", t, I):
        return "Switched-capacitor"
    if re.search(r"\bbuck|\bboost|inductor|\bSIMO\b|magnetic|\bVRM\b", t, I):
        return "Inductive"
    if re.search(r"charger|harvest|\bPMU\b|\bPMIC\b|power[- ]management", t, I):
        return "System"
    if re.search(r"switched[- ]capacitor", text, I):
        return "Switched-capacitor"
    if re.search(r"\bbuck|\bboost|inductor", text, I):
        return "Inductive"
    return ""


ARCH_RULES = [
    ("Buck",              r"\bbuck\b(?![- –]boost)"),
    ("Boost",             r"(?<!buck-)(?<!buck–)(?<!buck )\bboost\b"),
    ("Buck-boost",        r"buck[- –]boost|non[- ]?inverting"),
    ("Multi-level",       r"multi[- ]?level|(?:three|four|five|six|seven|eight|nine|ten|twelve)[- ]level|[3-9][- ]level|1[0-9][- ]level|flying[- ]capacitor"),
    ("Series-capacitor",  r"series[- ]capacitor|dual[- ]path|star[- ]delta"),
    ("SIMO",              r"\bSIMO\b|\bSIDO\b|single[- ]inductor (?:multiple|dual|triple)|multi[- ]output|dual[- ]output"),
    ("Multiphase",        r"multi[- ]?phase|[2-9][- ]phase|interleav"),
    ("Resonant/soft-switching", r"resonant|\bZVS\b|\bZCS\b|zero[- ]voltage switching|soft[- ]switch"),
    ("SC topology",       r"dickson|ladder|series[- ]parallel|fibonacci|reconfigurable (?:SC|switched)"),
    ("GaN/high-V",        r"\bGaN\b|high[- ]voltage|\b(?:48|60|100)\s*-?\s*V\b"),
    ("Integrated magnetics", r"integrated inductor|on[- ]chip inductor|magnetic[- ]core|air[- ]core|package inductor|\bIVR\b|fully[- ]integrated"),
    ("Hysteretic/COT",    r"hysteretic|constant[- ]on[- ]time|\bCOT\b|ripple[- ]based"),
    ("Digital control",   r"digital(?:ly)?[- ]control|digital PWM|\bDPWM\b"),
]
ARCH_RX = [(n, re.compile(p, I)) for n, p in ARCH_RULES]


def architectures(title, abstract):
    def scan(text):
        return [n for n, rx in ARCH_RX if rx.search(text or "")]
    tags = scan(title)
    if abstract:
        first = " ".join(re.split(r"(?<=[.!?])\s+", abstract)[:2])
        for t in scan(first):
            if t not in tags:
                tags.append(t)
    return tags


APP_RULES = [
    ("Processor/SoC",     r"processor|\bCPU\b|\bGPU\b|\bSoC\b|\bDVFS\b|digital load|computing|\bAI\b|accelerator"),
    ("Data center/48 V",  r"data[- ]?cent|\b48\s*-?\s*V\b|server|\bVRM\b|point[- ]of[- ]load"),
    ("Battery/charger",   r"battery|charg(?:er|ing)|Li[- ]?ion|USB"),
    ("IoT/harvesting",    r"harvest|\bIoT\b|thermoelectric|photovoltaic cell|\bPV\b|solar|\bTEG\b|nW\b|ultra[- ]low[- ]power|wearable"),
    ("Display/LED",       r"\bLED\b|display|\bOLED\b|AMOLED|backlight"),
    ("Automotive",        r"automotive|vehicle"),
    ("Wireless power",    r"wireless power|inductive link|\bWPT\b|rectifier"),
    ("Biomedical",        r"implant|biomedical|neural|medical"),
    ("Mobile",            r"mobile|smartphone|handheld|portable"),
]
APP_RX = [(n, re.compile(p, I)) for n, p in APP_RULES]
CAL_RX = re.compile(r"calibrat|trimm|background (?:correction|estimation)|auto[- ]tun", I)


def applications(title, abstract):
    text = (title or "") + " " + (abstract or "")
    return [n for n, rx in APP_RX if rx.search(text)]


def has_calibration(title, abstract):
    return bool(CAL_RX.search((title or "") + " " + (abstract or "")))


# ------------------------------------------------------------- spec parsing
NUM = r"(\d+(?:\.\d+)?)"
_SI = {"a": 1e-18, "f": 1e-15, "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6,
       "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9, "T": 1e12}
_FIXES = [(re.compile(r"(\d)\.\s(\d)"), r"\1.\2"), (re.compile(r"(\d)\s*-?\s*mu(m|W|A|V|s|F|H)\b"), r"\1 µ\2"),
          (re.compile(r"([µμ])\s+([mAVFsH])\b"), r"\1\2"), (re.compile(r"\\?hbox\s*"), ""),
          (re.compile(r"~|\b(?:boldsymbol|mathrm|mathbf|text)\s*"), " ")]


def _norm(text):
    for rx, rep in _FIXES:
        text = rx.sub(rep, text)
    return text


def _si(v, pre):
    pre = (pre or "").replace("u", "µ")
    return float(v) * _SI.get(pre, _SI.get(pre.lower(), 1.0))   # case-insensitive patterns may hand over "P", "N"


EFF_RX = [   # peak efficiency
    re.compile(r"(?:peak|maximum|max\.?|highest)\s+(?:power[- ]conversion\s+|conversion\s+|end[- ]to[- ]end\s+)?efficiency[^.;\d]{0,25}?(?:of\s+|is\s+|reaches\s+|up to\s+)?" + NUM + r"\s*%", I),
    re.compile(NUM + r"\s*%\s+(?:peak|maximum|max\.?)\s+(?:power[- ]conversion\s+|conversion\s+)?efficiency", I),
    re.compile(NUM + r"\s*%[- ](?:peak[- ])?(?:efficiency|efficient)", I),
    re.compile(r"efficiency[^.;\d]{0,30}?(?:of\s+|is\s+|reaches\s+|up to\s+|achiev\w+\s+)" + NUM + r"\s*%", I),
]
FSW_RX = re.compile(r"(?:switching[- ]frequenc\w*|f_?SW|operat\w+ at|switch\w* at)[^.;\d]{0,20}?(?:of\s+|up to\s+|is\s+)?(?:[\d.]+\s*(?:[kMG]Hz)?\s*(?:-|–|to)\s*)?" +
                    NUM + r"\s*-?\s*([kMG])Hz|" + NUM + r"\s*-?\s*([kMG])Hz\s+(?:\w+\s+)?(?:switching|f_?SW)", I)
VCONV_RX = re.compile(r"(?<![\d.])(\d+(?:\.\d+)?)\s*-?\s*V\s*(?:-|–)?\s*(?:to|-to-|→)\s*-?\s*(\d+(?:\.\d+)?)\s*-?\s*V\b", I)
# "from a 1.8 V input to 0.9 V output", "3.3-V input and 1-V output"
VIO_RX = re.compile(NUM + r"\s*-?\s*V\s+(?:input|supply|battery)\b[^.;\d]{0,20}?" + NUM + r"\s*-?\s*V\s+output", I)
VIN_RX = re.compile(r"(?:input[- ]voltage|\bV_?IN\b)[^.;\d]{0,25}?(?:of\s+|from\s+|range\s+of\s+|is\s+)?(?:[\d.]+\s*(?:V\s*)?(?:-|–|to)\s*)?" + NUM + r"\s*-?\s*V\b", I)
VOUT_RX = re.compile(r"(?:output[- ]voltage|\bV_?OUT\b)[^.;\d]{0,25}?(?:of\s+|from\s+|range\s+of\s+|is\s+)?(?:[\d.]+\s*(?:V\s*)?(?:-|–|to)\s*)?" + NUM + r"\s*-?\s*V\b", I)
IOUT_RX = [
    re.compile(r"(?:maximum|max\.?|peak|full|rated)\s+(?:load|output)\s+current[^.;\d]{0,25}?(?:of\s+|up to\s+|is\s+)?" + NUM + r"\s*-?\s*([µμunm]?)A\b", I),
    re.compile(r"(?:load|output)\s+current(?:\s+range)?[^.;\d]{0,20}?(?:of\s+|up to\s+|from\s+[\d.]+\s*[µμunm]?A\s+to\s+)" + NUM + r"\s*-?\s*([µμunm]?)A\b", I),
    re.compile(NUM + r"\s*-?\s*([µμunm]?)A\s+(?:maximum\s+|max\.?\s+|peak\s+)?(?:load|output)(?:\s+current)?\b", I),
    re.compile(r"(?:deliver\w*|supplies|supports|provid\w+)[^.;\d]{0,15}?(?:up to\s+)?" + NUM + r"\s*-?\s*([µμunm]?)A\b", I),
    re.compile(NUM + r"\s*-?\s*([µμunm]?)A[- ](?:[\w-]+[- ]){0,2}?(?:buck|boost|converter|regulator|DC[- –]?DC|PMIC|charger)", I),
]
POUT_RX = re.compile(r"(?:output|maximum output|load)\s+power[^.;\d]{0,20}?(?:of\s+|up to\s+|is\s+)?" + NUM + r"\s*-?\s*([µμnmk]?)W\b|" +
                     NUM + r"\s*-?\s*([µμnmk]?)W[- ](?:output|load|[\w-]+[- ]?(?:converter|charger|regulator|DC[- –]?DC))", I)
DENS_RX = re.compile(NUM + r"\s*-?\s*([mµμ]?)(W|A)\s*/\s*mm\s*(?:2|²|\^2)", I)
IND_RX = re.compile(NUM + r"\s*-?\s*([npµμu])H\b", I)
IQ_RX = re.compile(r"(?:quiescent|standby|no[- ]load)\s+(?:current|power)[^.;\d]{0,25}?(?:of\s+|is\s+|only\s+)?" + NUM + r"\s*-?\s*([µμunp]?)(A|W)\b|" +
                   NUM + r"\s*-?\s*([µμunp]?)(A|W)\s+(?:of\s+)?(?:the\s+)?quiescent", I)
RIPPLE_RX = re.compile(r"(?:output|voltage)\s+ripple[^.;\d]{0,25}?(?:of\s+|is\s+|below\s+|less than\s+|within\s+)?" + NUM + r"\s*-?\s*(m?)V|" +
                       NUM + r"\s*-?\s*(m?)V(?:P-?P|pp)?\s+(?:output\s+)?ripple", I)
DV_RX = re.compile(r"(?:undershoot|droop|overshoot|voltage dip)[^.;\d]{0,25}?(?:of\s+|is\s+|only\s+|within\s+|less than\s+)?" + NUM + r"\s*-?\s*(m?)V\b|" +
                   NUM + r"\s*-?\s*(m?)V\s+(?:of\s+)?(?:voltage\s+|output\s+)?(?:undershoot|droop|overshoot)", I)
NODE_NM_RX = re.compile(r"(?<![\w.])(\d{1,3})\s*-?\s*nm\b", I)
NODE_UM_RX = re.compile(r"(?<![\w.])(0\.\d{1,3})\s*-?\s*[µμu]m\b|(?<![\w.])([1-3](?:\.\d)?)\s*-?\s*[µμu]m\s+(?:\w+\s+){0,2}"
                        r"(?:CMOS|BiCMOS|process|technology|SOI|BCD)", I)
AREA_RX = re.compile(NUM + r"\s*-?\s*mm\s*(?:2|²|\^2)(?!\s*/)", I)


def _first(rxs, *texts):
    for text in texts:
        for rx in rxs:
            m = rx.search(text or "")
            if m:
                return m
    return None


def parse_specs(title, abstract):
    t, a = _norm(title or ""), _norm(abstract or "")
    out = {}
    m = _first(EFF_RX, t, a)
    if m:
        v = float(m.group(1))
        if 20 <= v <= 100:
            out["eff"] = v
    m = FSW_RX.search(t) or FSW_RX.search(a)
    if m:
        val, pre = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        out["fsw"] = _si(val, pre)
    m = VCONV_RX.search(t) or VCONV_RX.search(a)
    if m:
        v1, v2 = float(m.group(1)), float(m.group(2))
        if 0.1 <= v1 <= 1000 and 0.1 <= v2 <= 1000 and v1 != v2:
            out["vin"], out["vout"] = v1, v2
    m = VIO_RX.search(t) or VIO_RX.search(a)
    if "vin" not in out and m and 0.1 <= float(m.group(1)) <= 1000 and 0.1 <= float(m.group(2)) <= 1000:
        out["vin"], out["vout"] = float(m.group(1)), float(m.group(2))
    if "vin" not in out:
        m = VIN_RX.search(a) or VIN_RX.search(t)
        if m and 0.1 <= float(m.group(1)) <= 1000:
            out["vin"] = float(m.group(1))
        m = VOUT_RX.search(a) or VOUT_RX.search(t)
        if m and 0.1 <= float(m.group(1)) <= 1000:
            out["vout"] = float(m.group(1))
    m = _first(IOUT_RX, t, a)
    if m:
        v = _si(m.group(1), m.group(2))
        if 1e-9 <= v <= 500:
            out["iout"] = v
    m = POUT_RX.search(t) or POUT_RX.search(a)
    if m:
        val, pre = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        out["pout"] = _si(val, pre)
    m = DENS_RX.search(t) or DENS_RX.search(a)
    if m:
        v = _si(m.group(1), m.group(2))
        out["pd" if m.group(3).upper() == "W" else "cd"] = v
    m = IND_RX.search(a) or IND_RX.search(t)
    if m:
        out["ind"] = _si(m.group(1), m.group(2))
    m = IQ_RX.search(a) or IQ_RX.search(t)
    if m:
        val, pre, unit = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(4), m.group(5), m.group(6))
        out["iq" if unit.upper() == "A" else "pq"] = _si(val, pre)
    m = RIPPLE_RX.search(a) or RIPPLE_RX.search(t)
    if m:
        val, pre = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        v = float(val) * (1e-3 if pre else 1)
        if v <= 1:
            out["ripple"] = v
    m = DV_RX.search(a) or DV_RX.search(t)
    if m:
        val, pre = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        v = float(val) * (1e-3 if pre else 1)
        if v <= 2:
            out["dv"] = v
    m = NODE_NM_RX.search(t) or NODE_NM_RX.search(a)
    if m and 2 <= int(m.group(1)) <= 500:
        out["node"] = int(m.group(1))
    else:
        m = NODE_UM_RX.search(t) or NODE_UM_RX.search(a)
        if m:
            out["node"] = int(round(float(m.group(1) or m.group(2)) * 1000))
    m = AREA_RX.search(a) or AREA_RX.search(t)
    if m:
        out["area"] = float(m.group(1))
    return {k: float("%.6g" % v) if isinstance(v, float) else v for k, v in out.items()}   # 1e-5, not 9.999999999999999e-06


def spec_sources(title, abstract):
    """parse_specs() plus where each value came from: {"key": "t" | "a"}."""
    full = parse_specs(title, abstract)
    only_title = parse_specs(title, "")
    return full, {k: ("t" if only_title.get(k) == v else "a") for k, v in full.items()}


def derived(specs):
    d = {}
    if specs.get("vin") and specs.get("vout"):
        d["cr"] = round(specs["vout"] / specs["vin"], 4)
    if "pout" not in specs and specs.get("vout") and specs.get("iout"):
        d["pout_calc"] = float("%.4g" % (specs["vout"] * specs["iout"]))
    return d


# ------------------------------------------------------------- affiliations
ORG_HINT = re.compile(r"universit|institut|college|school|KAIST|POSTECH|UNIST|DGIST|GIST|\bETH\b|EPFL|\bMIT\b|"
                      r"laborator|\blabs?\b|inc\b|ltd|corp|company|co\.|electronics|semiconductor|technolog|"
                      r"research|centre|center|academy|imec|tsmc|samsung|sk hynix|intel|mediatek|qualcomm|"
                      r"apple|google|huawei|broadcom|analog devices|texas instruments", I)


US_STATES = ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK "
             "OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC").split()
COUNTRY_ALIASES = {"thenetherlands": "Netherlands", "netherlands": "Netherlands", "holland": "Netherlands",
                   "uk": "UK", "unitedkingdom": "UK", "england": "UK", "scotland": "UK", "greatbritain": "UK",
                   "republicofsingapore": "Singapore", "hongkong": "Hong Kong", "hongkongsar": "Hong Kong",
                   "rocchina": "Taiwan", "taiwanroc": "Taiwan", "taiwan,roc": "Taiwan", "roc": "Taiwan",
                   "korearepublicof": "South Korea", "southkorea": "South Korea", "usa": "USA", "us": "USA"}
COUNTRY_ALIASES.update({st.lower(): "USA" for st in US_STATES})
COUNTRY_ALIASES.update({"uae": "United Arab Emirates", "türkiye": "Turkey", "turkiye": "Turkey", "macao": "Macau", "hk": "Hong Kong",
                        "kr": "South Korea", "korea": "South Korea", "republicofkorea": "South Korea", "korea(south)": "South Korea",
                        "sg": "Singapore", "taiwan(roc)": "Taiwan", "prc": "China", "prchina": "China", "peoplesrepublicofchina": "China",
                        "people'srepublicofchina": "China", "unitedstates": "USA", "unitedstatesofamerica": "USA", "california": "USA",
                        "oregon": "USA", "texas": "USA", "massachusetts": "USA", "czechia": "Czech Republic", "russianfederation": "Russia"})
COUNTRIES = {"USA", "China", "South Korea", "Taiwan", "Netherlands", "Japan", "Belgium", "Canada", "Germany", "Italy", "India",
             "Switzerland", "Singapore", "Spain", "UK", "Ireland", "Austria", "France", "Sweden", "Finland", "Portugal", "Hong Kong",
             "United Arab Emirates", "Norway", "Iran", "Israel", "Saudi Arabia", "Egypt", "Argentina", "Australia", "Brazil", "Denmark",
             "Turkey", "Qatar", "Malaysia", "Vietnam", "Greece", "Colombia", "Macau", "Lebanon", "Romania", "Hungary", "Tunisia",
             "Czech Republic", "Philippines", "Poland", "Mexico", "Russia", "Chile", "Bahrain", "Iraq", "Indonesia", "Pakistan",
             "Thailand", "Kazakhstan", "New Zealand", "Estonia", "Mauritius", "Ukraine", "Slovenia", "Slovakia", "Serbia", "Croatia",
             "Bulgaria", "Luxembourg", "Cyprus", "Morocco", "Algeria", "Jordan", "Kuwait", "Oman", "Nigeria", "South Africa", "Kenya",
             "Bangladesh", "Sri Lanka", "Nepal", "Peru", "Uruguay", "Venezuela", "Ecuador", "Iceland", "Lithuania", "Latvia",
             "Belarus", "Armenia"}
# affiliation parts that name a city or an institution instead of a country
PLACE_COUNTRY = [(re.compile(p, I), c) for p, c in (
    (r"\b(?:delft|eindhoven|twente|enschede)\b", "Netherlands"), (r"\b(?:dallas|san diego|corvallis|san jose|santa clara)\b", "USA"),
    (r"\b(?:daejeon|seoul|pohang|ulsan|suwon|samsung|sk hynix|kaist|postech)\b", "South Korea"),
    (r"\b(?:beijing|shanghai|tsinghua|peking|zhejiang|fudan|xi'?an|nanjing|shenzhen|hangzhou|chengdu)\b", "China"),
    (r"\b(?:tokyo|osaka|kyoto|hiroshima)\b", "Japan"), (r"\bmaca[uo]\b", "Macau"), (r"\bnational taiwan\b|\bhsinchu\b|\btaipei\b", "Taiwan"),
    (r"\btu berlin\b|\bbosch\b|\bmunich\b", "Germany"), (r"\bcesson|\bparis\b|\bgrenoble\b", "France"),
    (r"\b(?:oregon state|brigham young|university of utah|emory|purdue|university of florida|university of washington|northeastern|"
     r"intel|qualcomm)\b", "USA"), (r"\banalog devices canada\b", "Canada"))]


def _country(parts, aff):
    """The country of an affiliation, or None: the parts from the end first, then known cities and institutions."""
    for raw in reversed(parts):
        c = re.sub(r"\s+\d[\d\- ]*$", "", raw).strip()
        c = COUNTRY_ALIASES.get(re.sub(r"[\s.]", "", c).lower(), c)
        if c.isupper() and len(c) > 3:
            c = c.title()                    # "MEXICO", "SPAIN"
        if c in COUNTRIES:
            return c
    for rx, c in PLACE_COUNTRY:
        if rx.search(aff):
            return c
    return None


def org_and_country(aff):
    if not aff:
        return None, None
    parts = [p.strip() for p in aff.split(",") if p.strip()]
    if not parts:
        return None, None
    country = _country(parts, aff)
    org = None
    for p in parts:
        if ORG_HINT.search(p) and not re.match(r"(department|dept|school of|faculty|division)\b", p, I):
            org = p
            break
    if org is None:
        org = parts[1] if len(parts) > 2 else parts[0]
    return org, country


# ------------------------------------------------------------- dates
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def parse_month(pubdate, year):
    """'19-23 Feb. 2025' -> '2025-02'; falls back to 'YYYY'."""
    s = (pubdate or "").lower()
    y = None
    years = re.findall(r"(?:19|20)\d{2}", s)
    if years:
        y = years[-1]
    elif year:
        y = str(year)
    mon = None
    for tok in re.findall(r"[a-z]{3,}", s):
        if tok[:3] in MONTHS:
            mon = MONTHS[tok[:3]]
            break
    if y and mon:
        return "%s-%02d" % (y, mon)
    return y or ""
