const $ = (selector) => document.querySelector(selector);

const form = $("#selection-form");
const notice = $("#notice");
const loadingSection = $("#loading-section");
const analysisSection = $("#analysis-section");
const prefectureSelect = $("#prefecture");
const municipalitySelect = $("#municipality");
const officeSelect = $("#office-select");
const officeKeyword = $("#office-keyword");
const refreshButton = $("#refresh-offices");
const analyzeButton = $("#analyze-button");

const state = {
  municipalities: {},
  offices: [],
};

function setNotice(message = "", isError = false) {
  notice.textContent = message;
  notice.classList.toggle("hidden", !message);
  notice.classList.toggle("error", isError);
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
  return data;
}

function resetSelect(select, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  select.disabled = true;
}

function resetOfficeSelect(message = "市町村を選ぶと表示されます") {
  state.offices = [];
  resetSelect(officeSelect, message);
  analyzeButton.disabled = true;
}

function populatePrefectures() {
  prefectureSelect.replaceChildren(new Option("都道府県を選択", ""));
  Object.keys(state.municipalities).forEach((prefecture) => {
    prefectureSelect.append(new Option(prefecture, prefecture));
  });
}

function populateMunicipalities(prefecture) {
  resetOfficeSelect();
  if (!prefecture || !state.municipalities[prefecture]) {
    resetSelect(municipalitySelect, "先に都道府県を選択");
    return;
  }

  municipalitySelect.replaceChildren(new Option("市町村を選択", ""));
  state.municipalities[prefecture].forEach((municipality) => {
    municipalitySelect.append(new Option(municipality, municipality));
  });
  municipalitySelect.disabled = false;
}

function renderOfficeOptions(results) {
  resetOfficeSelect("園名を選択");
  if (!results.length) {
    setNotice("この条件では候補が見つかりませんでした。園名の一部を短くして候補を更新するか、近い市町村も確認してみてください。", true);
    return;
  }

  state.offices = results;
  officeSelect.disabled = false;
  results.forEach((item, index) => {
    const meta = [item.address, item.service].filter(Boolean).join(" / ");
    officeSelect.append(new Option(`${item.office_name}（${meta}）`, String(index)));
  });
  setNotice(`${results.length}件の候補が見つかりました。園名を選んでください。`);
}

async function loadOffices() {
  const prefecture = prefectureSelect.value;
  const municipality = municipalitySelect.value;
  const keyword = officeKeyword.value.trim();
  if (!prefecture || !municipality) {
    resetOfficeSelect();
    return;
  }

  setNotice("WAM NETから園の候補を取得しています。少しだけお待ちください。");
  resetOfficeSelect("候補を取得中...");
  refreshButton.disabled = true;

  try {
    const params = new URLSearchParams({ prefecture, municipality });
    if (keyword) params.set("keyword", keyword);
    const data = await jsonRequest(`/api/offices?${params}`);
    renderOfficeOptions(data.results);
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

function selectedOffice() {
  if (officeSelect.value === "") return null;
  return state.offices[Number(officeSelect.value)] || null;
}

prefectureSelect.addEventListener("change", () => {
  setNotice();
  analysisSection.classList.add("hidden");
  populateMunicipalities(prefectureSelect.value);
});

municipalitySelect.addEventListener("change", () => {
  setNotice();
  analysisSection.classList.add("hidden");
  loadOffices();
});

officeSelect.addEventListener("change", () => {
  analyzeButton.disabled = !selectedOffice();
});

refreshButton.addEventListener("click", () => {
  analysisSection.classList.add("hidden");
  loadOffices();
});

officeKeyword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadOffices();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = selectedOffice();
  if (!item) {
    setNotice("園名を選択してください。", true);
    return;
  }
  await analyze(item);
});

async function analyze(item) {
  setNotice();
  analysisSection.classList.add("hidden");
  loadingSection.classList.remove("hidden");
  analyzeButton.disabled = true;
  analyzeButton.querySelector("span").textContent = "確認中...";
  loadingSection.scrollIntoView({ behavior: "smooth", block: "center" });

  try {
    const data = await jsonRequest("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    renderAnalysis(data);
  } catch (error) {
    setNotice(error.message, true);
    notice.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    loadingSection.classList.add("hidden");
    analyzeButton.disabled = !selectedOffice();
    analyzeButton.querySelector("span").textContent = "この園の財務状況を見る";
  }
}

function formatMetric(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value);
}

function formatYen(value) {
  if (value === null || value === undefined) return "読み取りなし";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)} 億円`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 10000).toLocaleString("ja-JP")} 万円`;
  return `${value.toLocaleString("ja-JP")} 円`;
}

function setContactFormData(data) {
  const pairs = {
    "#form-office-name": data.office_name || "",
    "#form-corporation-name": data.corporation_name || "",
    "#form-address": data.address || "",
    "#form-year": data.year || "",
    "#form-diagnosis": `${data.diagnosis?.stars || ""} ${data.diagnosis?.label || ""}`.trim(),
  };

  Object.entries(pairs).forEach(([selector, value]) => {
    const field = $(selector);
    if (field) field.value = value;
  });
}

function renderAnalysis(data) {
  $("#analysis-title").textContent = data.office_name || data.corporation_name;
  $("#analysis-meta").textContent = [data.corporation_name, data.address].filter(Boolean).join(" ｜ ");
  $("#year-badge").textContent = `${data.year || "最新"}年度 公開資料`;
  $("#scope-badge").textContent = data.scope;
  $("#diagnosis-stars").textContent = data.diagnosis?.stars || "";
  $("#headline").textContent = data.headline;
  $("#summary").textContent = data.summary;
  $("#scope-note").textContent = data.scope_note;

  const summaryCard = $("#summary-card");
  summaryCard.className = `summary-card ${data.overall || "neutral"}`;

  const metricGrid = $("#metric-grid");
  metricGrid.replaceChildren();
  data.metrics.forEach((metric) => {
    const card = document.createElement("article");
    card.className = `metric ${metric.tone}`;
    const top = document.createElement("div");
    top.className = "metric-top";
    top.append(textElement("span", "metric-label", metric.label), textElement("span", "tone-dot", ""));
    const value = document.createElement("div");
    value.className = "metric-value";
    value.append(document.createTextNode(formatMetric(metric.value)));
    value.append(textElement("small", "", metric.unit));
    card.append(top, value, textElement("p", "metric-note", metric.note));
    metricGrid.append(card);
  });

  const strategyList = $("#strategy-list");
  strategyList.replaceChildren();
  (data.strategies || []).forEach((strategy) => {
    const card = document.createElement("article");
    card.className = "strategy";
    card.append(textElement("h4", "", strategy.title), textElement("p", "", strategy.body));
    strategyList.append(card);
  });

  const labels = {
    revenue: "サービス活動収益",
    service_result: "サービス活動増減差額",
    recurring_result: "経常増減差額",
    current_assets: "流動資産",
    current_liabilities: "流動負債",
    cash: "現金預金",
    total_assets: "総資産",
    net_assets: "純資産",
  };
  const amountGrid = $("#amount-grid");
  amountGrid.replaceChildren();
  Object.entries(data.amounts).forEach(([key, number]) => {
    const card = document.createElement("div");
    card.className = "amount";
    card.append(textElement("span", "", labels[key] || key), textElement("strong", "", formatYen(number)));
    amountGrid.append(card);
  });

  $("#source-link").href = data.source_url;
  setContactFormData(data);
  analysisSection.classList.remove("hidden");
  analysisSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function init() {
  try {
    const response = await fetch("/static/municipalities.json");
    state.municipalities = await response.json();
    populatePrefectures();
    resetSelect(municipalitySelect, "先に都道府県を選択");
    resetOfficeSelect();
  } catch (error) {
    prefectureSelect.replaceChildren(new Option("読み込み失敗", ""));
    setNotice("市町村データの読み込みに失敗しました。ページを再読み込みしてください。", true);
  }
}

init();
