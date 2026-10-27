import { requireUser } from "@/lib/auth";
import { RaterForm } from "./rater-form";

export default async function RaterPage() {
  await requireUser("quotes:run");
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Quote Rater</h1>
      <RaterForm />
    </>
  );
}
