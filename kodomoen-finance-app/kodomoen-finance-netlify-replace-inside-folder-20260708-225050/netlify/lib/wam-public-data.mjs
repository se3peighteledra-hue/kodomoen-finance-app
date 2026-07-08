import { load } from "cheerio";

const BASE_URL = "https://www.wam.go.jp/wamnet/zaihyoukaiji/pub/";
const TOP_URL = BASE_URL + "PUB0200000E00.do";
const SEARCH_URL = BASE_URL + "PUB0212000E01.do";
const DETAIL_URL = BASE_URL + "PUB0201000E00.do";
const FINANCIAL_DOWNLOAD_URL = BASE_URL + "PUB0201000E08.do";
const DEFAULT_OFFICE_KEYWORDS = ["こども園", "保育園", "保育所", "幼稚園"];
const CHILDCARE_HINTS = ["こども園", "保育園", "保育所", "幼稚園", "認定こども園", "保育"];

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
  headers.set("user-agent", "Kodomoen-Finance-Guide/0.3 (netlify public-data viewer)");
  headers.set("accept-language", "ja,en;q=0.5");
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
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
