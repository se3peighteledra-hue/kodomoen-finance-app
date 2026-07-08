import { load } from "cheerio";

const BASE_URL = "https://www.wam.go.jp/wamnet/zaihyoukaiji/pub/";
const TOP_URL = BASE_URL + "PUB0200000E00.do";
const SEARCH_URL = BASE_URL + "PUB0212000E01.do";
const DETAIL_URL = BASE_URL + "PUB0201000E00.do";
const FINANCIAL_DOWNLOAD_URL = BASE_URL + "PUB0201000E08.do";
const DEFAULT_OFFICE_KEYWORDS = ["こども園", "保育園", "保育所", "幼稚園"];
const CHILDCARE_HINTS = ["こども園", "保育園", "保育所", "幼稚園", "認定こども園", "保育"];
const NUMBER = "(-?[0-9][0-9,]*)";
let jsZipModule;
let pdfjsModule;

function ensurePdfJsNodePolyfills() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        } else {
          this.a = 1;
          this.b = 0;
          this.c = 0;
          this.d = 1;
          this.e = 0;
          this.f = 0;
        }
      }

      multiplySelf(other) {
        const a = this.a * other.a + this.c * other.b;
        const b = this.b * other.a + this.d * other.b;
        const c = this.a * other.c + this.c * other.d;
        const d = this.b * other.c + this.d * other.d;
        const e = this.a * other.e + this.c * other.f + this.e;
        const f = this.b * other.e + this.d * other.f + this.f;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
      }

      translateSelf(x = 0, y = 0) {
        this.e += x;
        this.f += y;
        return this;
      }

      scaleSelf(x = 1, y = x) {
        this.a *= x;
        this.d *= y;
        return this;
      }
    };
  }

  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {};
  }
}

export function jsonResponse(data, status = 200) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(data),
  };
}

class WamError extends Error {}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  add(response) {
    const values =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")]
          : [];

    for (const raw of values) {
      const pair = raw.split(";")[0];
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request(jar, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("user-agent", "Kodomoen-Finance-Guide/0.2 (netlify public-data viewer)");
  headers.set("accept-language", "ja,en;q=0.5");
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    throw new WamError("WAM NETへの接続に失敗しました。少し待ってから再試行してください。");
  }
  jar.add(response);

  if (!response.ok) {
    throw new WamError(`WAM NETへの接続に失敗しました（HTTP ${response.status}）。`);
  }
  return response;
}

async function getText(jar, url, params = undefined) {
  const target = new URL(url);
  if (params) {
    Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value ?? ""));
  }
  const response = await request(jar, target);
  return response.text();
}

async function postBuffer(jar, url, form) {
  const response = await request(jar, url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  return new Uint8Array(await response.arrayBuffer());
}

function hiddenFields(html) {
  const $ = load(html);
  const values = {};
  $('input[type="hidden"][name]').each((_, element) => {
    const name = $(element).attr("name");
    if (name) values[name] = $(element).attr("value") || "";
  });
  return values;
}

function corporationId(href) {
  try {
    const parsed = new URL(href, BASE_URL);
    const value = parsed.searchParams.get("vo_headVO_corporationId") || "";
    return /^\d+$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchOffices(officeName, location = "") {
  officeName = String(officeName || "").trim();
  location = String(location || "").trim();
  if (officeName.length < 2) {
    throw new WamError("園名は2文字以上入力してください。");
  }

  const jar = new CookieJar();
  const top = await getText(jar, TOP_URL);
  const token = hiddenFields(top)._TOKEN || "";
  if (!token) {
    throw new WamError("WAM NETの検索用情報を取得できませんでした。");
  }

  const page = await getText(jar, SEARCH_URL, {
    _FRAMEID: "root",
    _TARGETID: "root",
    _LUID: "",
    _TOKEN: token,
    _FORMID: "PUB0200000",
    _SUBINDEX: "",
    vo_headVO_searchCorporationName: "",
    vo_headVO_searchLocation: "",
    vo_headVO_searchOfficeName: officeName,
    vo_headVO_searchLocationForOffice: location,
    vo_headVO_location: "",
    vo_headVO_searchCorporationNo: "",
    vo_headVO_prefCode: "",
  });

  const $ = load(page);
  const results = [];
  const seen = new Set();

  $('a.linkDetail[href*="vo_headVO_corporationId="]').each((_, link) => {
    const id = corporationId($(link).attr("href") || "");
    const row = $(link).closest("tr");
    if (!id || !row.length) return;

    const cells = row
      .children("td")
      .map((__, td) => normalizeSpace($(td).text()))
      .get();
    if (cells.length < 4) return;

    const office = cells[0];
    const address = cells[1];
    const service = cells[2];
    const status = cells.length > 4 ? cells[4] : "";
    const key = `${id}|${office}|${address}`;
    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      corporation_id: id,
      corporation_name: normalizeSpace($(link).text()),
      office_name: office,
      address,
      status,
      service,
    });
  });

  return results.slice(0, 100);
}

function looksChildcare(item) {
  const text = `${item.office_name || ""} ${item.service || ""}`;
  return CHILDCARE_HINTS.some((word) => text.includes(word));
}

function dedupeResults(items) {
  const results = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.corporation_id}|${item.office_name}|${item.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

export async function listOfficesByLocation(prefecture, municipality, keyword = "") {
  prefecture = String(prefecture || "").trim();
  municipality = String(municipality || "").trim();
  keyword = String(keyword || "").trim();

  if (!prefecture) throw new WamError("都道府県を選択してください。");
  if (!municipality) throw new WamError("市町村を選択してください。");
  if (keyword && keyword.length < 2) {
    throw new WamError("園名で絞り込む場合は2文字以上入力してください。");
  }

  const searchLocation = `${prefecture}${municipality}`;
  const keywords = keyword ? [keyword] : DEFAULT_OFFICE_KEYWORDS;
  const collected = [];
  for (const word of keywords) {
    collected.push(...(await searchOffices(word, searchLocation)));
  }

  return dedupeResults(collected)
    .filter((item) => item.address.includes(municipality))
    .filter((item) => keyword || looksChildcare(item))
    .sort((a, b) => `${a.office_name}${a.address}`.localeCompare(`${b.office_name}${b.address}`, "ja"))
    .slice(0, 200);
}

export async function downloadLatestFinancials(corporationId) {
  if (!/^\d{6,20}$/.test(String(corporationId || ""))) {
    throw new WamError("法人IDが正しくありません。");
  }

  const jar = new CookieJar();
  const detailParams = {
    _FORMID: "PUB0219000",
    vo_headVO_corporationId: corporationId,
  };
  const detailUrl = new URL(DETAIL_URL);
  Object.entries(detailParams).forEach(([key, value]) => detailUrl.searchParams.set(key, value));
  const detail = await getText(jar, DETAIL_URL, detailParams);
  const form = hiddenFields(detail);
  form.vo_headVO_corporationIdHidden = form.vo_headVO_corporationIdHidden || corporationId;

  const $ = load(detail);
  const choices = [];
  $('a[href*="PUB0201000E08"]').each((_, link) => {
    const href = $(link).attr("href") || "";
    const match = href.match(/PUB0201000E08','(\d+)'/);
    if (!match) return;
    const index = Number(match[1]);
    const yearValue = form[`vo_tbl04_fiscalYearValue_${String(index).padStart(3, "0")}`] || "";
    choices.push({ year: /^\d+$/.test(yearValue) ? Number(yearValue) : -1, index });
  });
  if (!choices.length) {
    throw new WamError("この法人にはダウンロード可能な計算書類が見つかりません。");
  }

  const latest = choices.sort((a, b) => b.year - a.year)[0];
  form._SUBINDEX = String(latest.index);
  const archive = await postBuffer(jar, FINANCIAL_DOWNLOAD_URL, form);
  if (archive[0] !== 0x50 || archive[1] !== 0x4b) {
    throw new WamError("計算書類の形式を確認できませんでした。");
  }

  return {
    archive,
    year: latest.year,
    sourceUrl: detailUrl.toString(),
  };
}

async function pdfPages(data) {
  if (!pdfjsModule) {
    ensurePdfJsNodePolyfills();
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  const loadingTask = pdfjsModule.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: true,
    verbosity: pdfjsModule.VerbosityLevel.ERRORS,
  });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

async function findPdf(zip, marker) {
  const names = Object.keys(zip.files);
  for (const name of names) {
    const file = zip.files[name];
    if (!file.dir && name.includes(marker) && name.toLowerCase().endsWith(".pdf")) {
      return pdfPages(await file.async("uint8array"));
    }
  }
  return [];
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replaceAll("サービス区分", "")
    .replaceAll("サービス会計", "")
    .replaceAll("拠点区分", "")
    .replaceAll("拠点", "")
    .replaceAll("認定", "")
    .replace(/[\s　・]/g, "");
}

function locationText(pages, officeName) {
  const key = normalizeName(officeName);
  if (key.length < 3) return "";
  for (let index = 0; index < pages.length; index += 1) {
    const normalized = normalizeName(pages[index]);
    if (normalized.includes(key) || normalized.includes(key.slice(0, Math.min(7, key.length)))) {
      return `${pages[index]}\n${pages[index + 1] || ""}`;
    }
  }
  return "";
}

function values(text, label) {
  const pattern = new RegExp(`${escapeRegex(label)}[^\\n0-9-]*${NUMBER}(?:\\s+${NUMBER})?`);
  const match = pattern.exec(text || "");
  if (!match) return [null, null];
  const current = Number(match[1].replaceAll(",", ""));
  const previous = match[2] ? Number(match[2].replaceAll(",", "")) : null;
  return [current, previous];
}

function safeRatio(numerator, denominator, multiplier = 100) {
  if (numerator === null || numerator === undefined || !denominator) return null;
  return (numerator / denominator) * multiplier;
}

function round(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function metric(key, label, value, unit, tone, note) {
  return { key, label, value: round(value), unit, tone, note };
}

function toneHigh(value, good, keep) {
  if (value === null || value === undefined) return "neutral";
  if (value >= good) return "good";
  if (value >= keep) return "attention";
  return "watch";
}

function toneMargin(value) {
  if (value === null || value === undefined) return "neutral";
  if (value >= 3) return "good";
  if (value >= 0) return "attention";
  return "watch";
}

const LEVELS = {
  5: {
    stars: "★★★★★",
    label: "とても安定感があります",
    message: "公開資料の主要な指標を見る限り、収支・短期資金・蓄積のバランスが整って見えます。",
  },
  4: {
    stars: "★★★★☆",
    label: "安定感を確認しやすい状態です",
    message: "大きく気になる偏りは少なく、今後も前年差や事業計画と合わせて見ると判断しやすい状態です。",
  },
  3: {
    stars: "★★★☆☆",
    label: "おおむね落ち着いて見られる状態です",
    message: "単年度の数字だけで決めつけず、数年の推移や一時的な支出を合わせて確認したい状態です。",
  },
  2: {
    stars: "★★☆☆☆",
    label: "整えるポイントが見つけやすい状態です",
    message: "いくつかの指標に見直し余地があります。慌てる材料ではなく、背景を分けて見ると打ち手を整理しやすくなります。",
  },
  1: {
    stars: "★☆☆☆☆",
    label: "丁寧に整えると伸びしろが大きい状態です",
    message: "費用の出方や資金の持ち方を一つずつ確認すると、改善につながるヒントを見つけやすい状態です。",
  },
};

function diagnosisLevel(metrics) {
  const valuesByKey = Object.fromEntries(metrics.map((item) => [item.key, item.value]));
  let score = 3;

  const serviceMargin = valuesByKey.service_margin;
  if (serviceMargin !== null && serviceMargin !== undefined) {
    score += serviceMargin >= 3 ? 1 : serviceMargin < 0 ? -1 : 0;
  }

  const currentRatio = valuesByKey.current_ratio;
  if (currentRatio !== null && currentRatio !== undefined) {
    score += currentRatio >= 200 ? 1 : currentRatio < 100 ? -1 : 0;
  }

  const netAssetRatio = valuesByKey.net_asset_ratio;
  if (netAssetRatio !== null && netAssetRatio !== undefined) {
    score += netAssetRatio >= 50 ? 1 : netAssetRatio < 30 ? -1 : 0;
  }

  const cashMonths = valuesByKey.cash_months;
  if (cashMonths !== null && cashMonths !== undefined) {
    score += cashMonths >= 3 ? 1 : cashMonths < 1 ? -1 : 0;
  }

  const revenueChange = valuesByKey.revenue_change;
  if (revenueChange !== null && revenueChange !== undefined) {
    score += revenueChange >= 3 ? 1 : revenueChange < -5 ? -1 : 0;
  }

  return Math.max(1, Math.min(5, score));
}

function overallTone(level) {
  if (level >= 4) return "good";
  if (level === 3) return "neutral";
  return "attention";
}

function strategies(metrics) {
  const valuesByKey = Object.fromEntries(metrics.map((item) => [item.key, item.value]));
  const results = [];

  if (valuesByKey.service_margin !== null && valuesByKey.service_margin < 3) {
    results.push({
      title: "月次の収支を1枚に見える化する",
      body: "人件費、給食費、委託費、修繕費、補助金の入金時期を月ごとに並べると、どこを整えると効果が出やすいか見えやすくなります。",
    });
  } else {
    results.push({
      title: "良い状態を続けるために月次で確認する",
      body: "収入・人件費・修繕費・補助金入金のタイミングを毎月同じ形で見ると、早めに小さな変化に気づきやすくなります。",
    });
  }

  if (valuesByKey.cash_months !== null && valuesByKey.cash_months < 3) {
    results.push({
      title: "大きな支出を年単位でならす",
      body: "修繕、備品更新、採用関連費などを年間計画に置き、積立や補助金活用の可能性を早めに確認すると資金の見通しを作りやすくなります。",
    });
  } else {
    results.push({
      title: "修繕・採用・備品更新の優先順位を決める",
      body: "余裕がある時期ほど、次年度以降の大きな支出を整理しておくと、職員配置や保育環境への投資判断がしやすくなります。",
    });
  }

  return results.slice(0, 2);
}

export async function analyzeFinancialZip(zipBytes, officeName = "") {
  if (!jsZipModule) {
    jsZipModule = await import("jszip");
  }
  let zip;
  try {
    zip = await jsZipModule.default.loadAsync(zipBytes);
  } catch (error) {
    throw new WamError("計算書類ZIPを読み取れませんでした。");
  }

  const corporateCash = (await findPdf(zip, "1-1.")).join("\n");
  const corporateActivity = (await findPdf(zip, "2-1.")).join("\n");
  const corporateBalance = (await findPdf(zip, "3-1.")).join("\n");
  if (!corporateActivity || !corporateBalance) {
    throw new WamError("必要な財務諸表（事業活動計算書・貸借対照表）が見つかりません。");
  }

  const locationCash = locationText(await findPdf(zip, "1-4."), officeName);
  const locationActivity = locationText(await findPdf(zip, "2-4."), officeName);
  const locationBalance = locationText(await findPdf(zip, "3-4."), officeName);
  const isLocation = Boolean(locationActivity && locationBalance);

  const cashText = locationCash || corporateCash;
  const activityText = locationActivity || corporateActivity;
  const balanceText = locationBalance || corporateBalance;

  let [revenue, previousRevenue] = values(activityText, "サービス活動収益計（１）");
  if (revenue === null) {
    [revenue, previousRevenue] = values(activityText, "サービス活動収益計");
  }
  const [serviceResult] = values(activityText, "サービス活動増減差額");
  const [recurringResult] = values(activityText, "経常増減差額");
  const [personnel] = values(activityText, "人件費");
  const [currentAssets] = values(balanceText, "流動資産");
  const [currentLiabilities] = values(balanceText, "流動負債");
  const [cash] = values(balanceText, "現金預金");
  const [totalAssets] = values(balanceText.replaceAll("純資産の部合計", "純資産合計"), "資産の部合計");
  const [netAssets] = values(balanceText, "純資産の部合計");
  const [operatingExpenses] = values(cashText, "事業活動支出計");

  const serviceMargin = safeRatio(serviceResult, revenue);
  const recurringMargin = safeRatio(recurringResult, revenue);
  const currentRatio = safeRatio(currentAssets, currentLiabilities);
  const netAssetRatio = safeRatio(netAssets, totalAssets);
  const personnelRatio = safeRatio(personnel, revenue);
  const cashMonths = safeRatio(cash, operatingExpenses, 12);
  const revenueChange = revenue !== null && previousRevenue ? ((revenue - previousRevenue) / previousRevenue) * 100 : null;

  const metrics = [
    metric(
      "service_margin",
      "本業の収支差額率",
      serviceMargin,
      "%",
      toneMargin(serviceMargin),
      "日常の保育・福祉サービスで、収益に対してどれだけ差額を残せたかを見ます。単年度だけでなく数年の推移が大切です。",
    ),
    metric(
      "current_ratio",
      "流動比率",
      currentRatio,
      "%",
      toneHigh(currentRatio, 200, 100),
      "1年以内の支払いに対する短期的な備えです。一般的には100%超がひとつの目安になります。",
    ),
    metric(
      "net_asset_ratio",
      "純資産比率",
      netAssetRatio,
      "%",
      toneHigh(netAssetRatio, 50, 30),
      "総資産のうち、返済不要の純資産が占める割合です。長期的な安定感を見る材料です。",
    ),
    metric(
      "cash_months",
      "現金の手元月数",
      cashMonths,
      "か月",
      toneHigh(cashMonths, 3, 1),
      "現金預金が、通常の事業支出のおよそ何か月分に当たるかを示します。",
    ),
    metric(
      "personnel_ratio",
      "人件費比率",
      personnelRatio,
      "%",
      "neutral",
      "収益に占める人件費の割合です。保育は人が中心なので、この比率だけで良し悪しは決まりません。",
    ),
    metric(
      "revenue_change",
      "収益の前年比",
      revenueChange,
      "%",
      revenueChange !== null && revenueChange >= 0 ? "good" : "attention",
      "サービス活動収益の前年度からの変化です。定員、給付費、事業構成の変化も影響します。",
    ),
  ];

  const available = metrics.slice(0, 4).filter((item) => item.value !== null);
  let diagnosis;
  let headline;
  let summary;
  let overall;
  if (available.length) {
    const level = diagnosisLevel(metrics);
    diagnosis = { level, ...LEVELS[level] };
    headline = diagnosis.label;
    summary = diagnosis.message;
    overall = overallTone(level);
  } else {
    diagnosis = {
      level: null,
      stars: "—",
      label: "主要指標を十分に読み取れませんでした",
      message: "公開PDFの様式が通常と異なる可能性があります。WAM NETの原本もあわせて確認してください。",
    };
    headline = diagnosis.label;
    summary = diagnosis.message;
    overall = "neutral";
  }

  return {
    scope: isLocation ? "園・拠点区分" : "運営法人全体",
    scope_note: isLocation
      ? "選んだ園名に対応する拠点区分を公開PDF内で確認できたため、その区分の数値を表示しています。"
      : "選んだ園単独の拠点区分を特定できなかったため、運営法人全体の数値を表示しています。",
    headline,
    summary,
    overall,
    diagnosis,
    strategies: strategies(metrics),
    metrics,
    amounts: {
      revenue,
      service_result: serviceResult,
      recurring_result: recurringResult,
      current_assets: currentAssets,
      current_liabilities: currentLiabilities,
      cash,
      total_assets: totalAssets,
      net_assets: netAssets,
    },
  };
}
