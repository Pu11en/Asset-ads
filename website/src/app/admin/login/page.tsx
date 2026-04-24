export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error === "1";

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        action="/api/admin-login"
        method="post"
        className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Admin Access</h1>
        <p className="text-sm text-white/60">
          Enter admin password to manage both brands.
        </p>
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          autoFocus
          className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        {error ? (
          <p className="text-sm text-red-400">Incorrect password.</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-md bg-white text-black font-medium py-2 text-sm hover:bg-white/90 transition"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
