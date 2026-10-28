import { redirect } from "next/navigation";

// The old quick-quote sandbox moved: quotes are now run from a client's Quotes tab.
export default function RaterPage() {
  redirect("/quotes");
}
