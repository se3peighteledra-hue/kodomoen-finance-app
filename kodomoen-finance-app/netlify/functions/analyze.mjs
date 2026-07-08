import { analyzeFinancialZip, downloadLatestFinancials, jsonResponse } from "../lib/wam-core.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "POSTでアクセスしてください。" }, 405);
  }

  try {
    const payload = await req.json();
    const corporationId = String(payload.corporation_id || "");
    const officeName = String(payload.office_name || "").slice(0, 200);
    const { archive, year, sourceUrl } = await downloadLatestFinancials(corporationId);
    const analysis = await analyzeFinancialZip(archive, officeName);

    return jsonResponse({
      ...analysis,
      year,
      source_url: sourceUrl,
      office_name: officeName,
      corporation_name: String(payload.corporation_name || "").slice(0, 200),
      address: String(payload.address || "").slice(0, 300),
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "財務分析でエラーが発生しました。" }, 400);
  }
};

export const config = {
  path: "/api/analyze",
};
