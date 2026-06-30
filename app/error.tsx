"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <section className="card max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-600">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-black">We couldn&apos;t finish that request.</h1>
        <p className="mt-3 text-slate-600">{error.message || "Please check your information and try again."}</p>
        <button className="btn-primary mt-6" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
