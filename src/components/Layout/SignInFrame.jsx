import React, { useEffect, useRef, useState } from "react";
import { uploadUrl, appPath, SIGNIN_MEDIA } from "../../lib/api";

/**
 * The frame both sign-in screens sit in.
 *
 * A candidate arriving at an exam and a member of staff opening the admin side
 * are looking for the same reassurance first: that this is their college's
 * exam, and not a page that happens to ask for their details. So the college's
 * own mark takes one half of the screen and the form the other — the
 * institution is what you see, the form is what you do.
 *
 * The mark is the college's animated crest, the same one the main site opens
 * with, so arriving at the exam from the college website feels like staying in
 * the same building. It keeps drawing itself until the sign-in is made.
 *
 * Shared so the two sides cannot drift apart. They are the same product seen
 * from two ends, and a candidate who has watched staff use it should recognise
 * the screen.
 */

/**
 * Whether the crest should animate at all.
 *
 * A viewer who has asked their system for less motion has asked for exactly
 * this, and gets the finished crest instead. Narrow screens get the still too:
 * the panel there is a header band a few centimetres tall, and spending a
 * candidate's mobile data on a clip that small buys nothing.
 */
function useWantsMotion() {
  const [wants, setWants] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 640px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setWants(wide.matches && !still.matches);

    decide();
    wide.addEventListener("change", decide);
    still.addEventListener("change", decide);
    return () => {
      wide.removeEventListener("change", decide);
      still.removeEventListener("change", decide);
    };
  }, []);

  return wants;
}

export default function SignInFrame({ logo, title, tagline, notes, paused = false, children }) {
  const videoRef = useRef(null);
  const wantsMotion = useWantsMotion();
  // The still stands in until the first frame paints, and stays if the clip
  // cannot play — Safari has never supported WebM with an alpha channel, and a
  // browser that cannot draw the animation should still show the crest.
  const [playing, setPlaying] = useState(false);

  // "Until the login is performed": the moment the form is working, the crest
  // settles on its finished state. Nothing should be competing for the machine
  // while a hall of candidates is being let in.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) el.pause();
    else el.play().catch(() => {});
  }, [paused, wantsMotion]);

  // Two different things, and they were briefly conflated. The animated crest
  // belongs to the deployment — a college that ships one is saying "this is our
  // mark, in motion". The uploaded logo belongs to the account, and is the
  // still: it is what shows before the clip starts, and what stands in its
  // place on a browser that cannot play it. A host serving many colleges ships
  // no animation, and then the uploaded logo is all there is.
  const uploaded = logo ? uploadUrl(logo) : null;
  const still = uploaded || appPath(SIGNIN_MEDIA.logoStill);
  const showAnimation = wantsMotion && !!SIGNIN_MEDIA.logoIntro;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:grid lg:grid-cols-[1fr_1.05fr]">

      {/* ── The form ────────────────────────────────────────────────────── */}
      {/* Second on a narrow screen, so the college is what greets you; first
          on a wide one, because the crest belongs on the right. */}
      <main className="order-2 flex flex-1 items-center justify-center px-5 py-12 lg:order-1 lg:px-14">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      {/* ── The college ─────────────────────────────────────────────────── */}
      <aside className="relative order-1 flex flex-col items-center justify-center overflow-hidden
                        bg-chrome px-8 py-10 text-center text-white
                        lg:order-2 lg:min-h-screen lg:px-14 lg:py-16">

        {/* Two soft washes rather than a flat fill, so the panel has depth
            behind the crest instead of reading as a black rectangle. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-28 -top-24 h-80 w-80 rounded-full bg-primary-600/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-primary-500/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_40%,rgba(255,255,255,0.06),transparent_70%)]" />
        </div>

        <div className="relative flex flex-col items-center">

          {/* ── The crest ─────────────────────────────────────────────── */}
          <div className="relative h-28 w-28 sm:h-40 sm:w-40 lg:h-[15rem] lg:w-[15rem]">
            {showAnimation && (
              <video
                ref={videoRef}
                src={appPath(SIGNIN_MEDIA.logoIntro)}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden
                onPlaying={() => setPlaying(true)}
                onError={() => setPlaying(false)}
                className={`absolute inset-0 h-full w-full object-contain
                            transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
              />
            )}
            <img
              src={still}
              alt={title ? `${title} crest` : "College crest"}
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              className={`absolute inset-0 h-full w-full object-contain
                          transition-opacity duration-500 ${playing ? "opacity-0" : "opacity-100"}`}
            />
          </div>

          {/* ── Name ──────────────────────────────────────────────────── */}
          <h1 className="mt-7 max-w-md text-lg font-bold leading-snug tracking-tight
                         sm:text-2xl lg:mt-10 lg:text-[2rem] lg:leading-[1.2]">
            {title}
          </h1>

          {tagline && (
            <>
              <span aria-hidden className="mt-5 hidden h-px w-16 bg-white/25 sm:block" />
              <p className="mt-5 hidden max-w-sm text-sm leading-relaxed text-white/70 sm:block lg:text-[0.95rem]">
                {tagline}
              </p>
            </>
          )}

          {notes?.length > 0 && (
            <ul className="mt-9 hidden space-y-3 text-left lg:block">
              {notes.map((note) => (
                <li key={note} className="flex items-start gap-3 text-sm leading-relaxed text-white/65">
                  <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
