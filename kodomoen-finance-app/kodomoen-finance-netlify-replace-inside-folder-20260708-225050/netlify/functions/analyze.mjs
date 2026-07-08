import { downloadLatestFinancials, jsonResponse } from "../lib/wam-public-data.mjs";
import { analyzeFinancialZip } from "../lib/wam-core.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "POSTでアクセスしてください。" }, 405);
  }

  try {
    const payload = JSON.parse(event.body || "{}");
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
}
