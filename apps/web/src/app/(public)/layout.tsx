export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-2xl font-bold tracking-tight">Ezly</div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
