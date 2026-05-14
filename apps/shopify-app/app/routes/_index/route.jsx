import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  throw redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
