import { jsonResponse, listOfficesByLocation } from "../lib/wam-public-data.mjs";

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return jsonResponse({ error: "GETでアクセスしてください。" }, 405);
  }

  try {
    const url = new URL(event.rawUrl || `https://netlify.local${event.path}?${event.rawQuery || ""}`);
    const results = await listOfficesByLocation(
      url.searchParams.get("prefecture") || "",
      url.searchParams.get("municipality") || "",
      url.searchParams.get("keyword") || "",
    );
    return jsonResponse({ results });
  } catch (error) {
    return jsonResponse({ error: error.message || "園の一覧取得でエラーが発生しました。" }, 400);
  }
}
