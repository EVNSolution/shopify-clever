import { redirect } from "react-router";

export const loader = () => redirect("/privacy");

export default function PrivacyPolicyRedirect() {
  return null;
}
