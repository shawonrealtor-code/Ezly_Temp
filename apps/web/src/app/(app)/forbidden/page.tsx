import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function ForbiddenPage() {
  await requireUser();
  return (
    <div className="mx-auto mt-12 max-w-md rounded-lg border bg-white p-6 text-center">
      <h1 className="mb-2 text-lg font-semibold">You don&apos;t have access to that page</h1>
      <p className="mb-4 text-sm text-slate-600">Your role doesn&apos;t include it. Ask an admin if you need access.</p>
      <Link href="/" className="text-blue-700 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
