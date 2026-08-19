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
    <div className="flex min-h-screen flex-col bg-white lg:grid lg:grid-cols-[1fr_1.05fr]">

      {/* ── The form ────────────────────────────────────────────────────── */}
      {/* Second on a narrow screen, so the college is what greets you; first
          on a wide one, because the crest belongs on the right. */}
      <main className="order-2 flex flex-1 items-center justify-center px-5 py-12 lg:order-1 lg:px-14">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      {/* ── The college ─────────────────────────────────────────────────── */}
      {/* Cream, which is the backdrop this crest was drawn for and what the
          college's own site opens on. The animation carries an alpha channel,
          so whatever sits behind it shows through — putting it on the colour it
          was designed against is what makes it look like the college's mark
          rather than a logo pasted onto a screen. */}
      <aside className="relative order-1 flex flex-col items-center justify-center overflow-hidden
                        border-b border-black/5 bg-[#f4f3ef] px-8 py-10 text-center text-slate-900
                        lg:order-2 lg:min-h-screen lg:border-b-0 lg:border-l lg:px-14 lg:py-16">

        {/* One very soft wash, so the panel has some depth without becoming a
            second colour. Cream carries itself; anything stronger here fights
            the crest. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full
                          bg-primary-600/[0.06] blur-3xl" />
        </div>

        {/* Name first, then the crest, then what the tool does — read top to
            bottom it says whose exam this is, shows their mark, and explains
            what the screen behind it will do. */}
        <div className="relative flex w-full flex-col items-center lg:h-full lg:justify-between lg:py-2">

          {/* ── Whose exam this is ────────────────────────────────────── */}
          <h1 className="max-w-md text-lg font-bold leading-snug tracking-tight text-chrome
                         sm:text-2xl lg:text-[2rem] lg:leading-[1.2]">
            {title}
          </h1>

          {/* ── Their mark, drawing itself ────────────────────────────── */}
          <div className="relative my-6 h-28 w-28 sm:h-40 sm:w-40 lg:my-0 lg:h-[16rem] lg:w-[16rem]">
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
                            transition-opacity duration-200 ${playing ? "opacity-100" : "opacity-0"}`}
              />
            )}
            <img
              src={still}
              alt={title ? `${title} crest` : "College crest"}
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              className={`absolute inset-0 h-full w-full object-contain
                          transition-opacity duration-200 ${playing ? "opacity-0" : "opacity-100"}`}
            />
          </div>

          {/* ── What this screen leads to ─────────────────────────────── */}
          <div className="flex flex-col items-center">
            {tagline && (
              <>
                <span aria-hidden className="mb-6 hidden h-px w-16 bg-slate-300 sm:block" />
                <p className="hidden max-w-sm text-sm leading-relaxed text-slate-600 sm:block lg:text-[0.95rem]">
                  {tagline}
                </p>
              </>
            )}

            {notes?.length > 0 && (
              <ul className="mt-7 hidden space-y-3 text-left lg:block">
                {notes.map((note) => (
                  <li key={note} className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
                    <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-600" />
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
