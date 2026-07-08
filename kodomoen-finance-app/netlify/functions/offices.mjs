import { jsonResponse, listOfficesByLocation } from "../lib/wam-core.mjs";

export default async (req) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "GETでアクセスしてください。" }, 405);
  }

  try {
    const url = new URL(req.url);
    const results = await listOfficesByLocation(
      url.searchParams.get("prefecture") || "",
      url.searchParams.get("municipality") || "",
      url.searchParams.get("keyword") || "",
    );
    return jsonResponse({ results });
  } catch (error) {
    return jsonResponse({ error: error.message || "園の一覧取得でエラーが発生しました。" }, 400);
  }
};

export const config = {
  path: "/api/offices",
};
