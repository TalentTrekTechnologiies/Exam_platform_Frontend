import React from "react";
import { uploadUrl } from "../../lib/api";

/**
 * The frame both sign-in screens sit in.
 *
 * A candidate arriving at an exam and a member of staff opening the admin side
 * are looking for the same reassurance first: that this is their college's
 * exam, and not a page that happens to ask for their details. So the
 * institution's own mark and name are given the larger half of the screen, and
 * the form the smaller.
 *
 * Shared so the two sides cannot drift apart. They are the same product seen
 * from two ends, and a candidate who has watched staff use it should recognise
 * the screen.
 */
export default function SignInFrame({ logo, title, tagline, notes, children }) {
  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── The institution ─────────────────────────────────────────────── */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-chrome px-8 py-10 text-white lg:px-14 lg:py-14">
        {/* Two soft washes rather than a flat fill, so a page with no logo yet
            still looks composed instead of unfinished. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-600/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-primary-500/15 blur-3xl" />
        </div>

        <div className="relative">
          {logo ? (
            <div className="inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-lg">
              <img
                src={uploadUrl(logo)}
                alt=""
                className="h-16 w-16 object-contain lg:h-20 lg:w-20"
              />
            </div>
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-2xl font-bold
                            ring-1 ring-white/20 backdrop-blur lg:h-20 lg:w-20 lg:text-3xl">
              {(title || "E").trim().charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="mt-7 text-2xl font-bold leading-tight tracking-tight lg:mt-9 lg:text-[2.1rem]">
            {title}
          </h1>
          {tagline && (
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70 lg:text-base">
              {tagline}
            </p>
          )}
        </div>

        {notes?.length > 0 && (
          <ul className="relative mt-10 space-y-3 lg:mt-0">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-3 text-sm text-white/70">
                <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* ── The form ────────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center px-5 py-12 lg:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
