"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Req = {
  request_id: string;
  title: string;
  description: string;
  response_count: number;
  created_at: string;
  skills: string[];
  category_id: string | null;
};

type CategoryRow = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
};

export default function RequestsListPage() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [listCategoryFilter, setListCategoryFilter] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "30" });
    if (listCategoryFilter.trim()) {
      params.set("category_id", listCategoryFilter.trim());
    }
    const res = await fetch(`/api/requests?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed");
      setRequests([]);
      return;
    }
    setErr(null);
    setRequests((data.requests as Req[]) ?? []);
  }, [listCategoryFilter]);

  useEffect(() => {
    let c = false;
    (async () => {
      const catRes = await fetch("/api/categories");
      if (catRes.ok && !c) {
        const catJson = await catRes.json();
        setCategories((catJson.categories as CategoryRow[]) ?? []);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [load]);

  async function onPost(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    const skills = skillsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        category_id: categoryId.trim() ? categoryId.trim() : null,
        skills,
      }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    setTitle("");
    setDescription("");
    setCategoryId("");
    setSkillsText("");
    await load();
  }

  const categoryNameById = new Map(categories.map((c) => [c.category_id, c.name]));

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">
          Marketplace
        </p>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="mt-2 text-sm text-white/75">
          Public asks; active experts can respond with a message.
        </p>

        <section className="mt-10 rounded-xl border border-white/15 bg-white/5 p-5">
          <h2 className="font-medium text-[var(--convene-hero)]">Post a request</h2>
          <form onSubmit={(e) => void onPost(e)} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-white/80">Title</span>
              <input
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Description</span>
              <textarea
                required
                rows={4}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Category (optional)</span>
              <select
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.icon ? `${c.icon} ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Skills (optional, comma-separated, max 10)</span>
              <input
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder="e.g. React, SQL, interview prep"
              />
            </label>
            <button
              type="submit"
              disabled={posting}
              className="rounded-md bg-[var(--convene-hero)] px-4 py-2 text-sm font-medium text-[var(--convene-primary)] disabled:opacity-60"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </form>
        </section>

        {err ? <p className="mt-6 text-sm text-red-300">{err}</p> : null}

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-medium text-[var(--convene-hero)]">Open requests</h2>
            <label className="block shrink-0 text-sm">
              <span className="text-xs text-white/80">Filter by category</span>
              <select
                className="mt-1 w-full min-w-[12rem] rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)] sm:w-auto"
                value={listCategoryFilter}
                onChange={(e) => setListCategoryFilter(e.target.value)}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-white/60">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">None yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {requests.map((r) => (
                <li key={r.request_id} className="rounded-lg border border-white/15 bg-black/20 px-4 py-3">
                  <Link
                    href={`/requests/${r.request_id}`}
                    className="font-medium text-[var(--convene-hero)] hover:underline"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-white/65">{r.description}</p>
                  {r.category_id ? (
                    <p className="mt-2 text-xs text-[var(--convene-hero)]">
                      {categoryNameById.get(r.category_id) ?? r.category_id}
                    </p>
                  ) : null}
                  {r.skills?.length ? (
                    <p className="mt-1 text-xs text-white/50">{r.skills.join(" · ")}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-white/45">
                    {r.response_count} responses · {r.created_at}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
