import { redirect } from "react-router";

function getFallbackAppPath(request) {
  const url = new URL(request.url);
  const reload = url.searchParams.get("shopify-reload");

  if (reload) {
    try {
      const target = new URL(reload, url.origin);
      if (target.origin === url.origin) return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      // fall through to the safe app entry
    }
  }

  return `/app/orders${url.search}`;
}

export const loader = ({ request }) => redirect(getFallbackAppPath(request));

export default function NotFoundRecovery() {
  return <p>앱 화면을 다시 여는 중입니다.</p>;
}
