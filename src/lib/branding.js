import { useEffect } from "react";
import { examApi, uploadUrl, INSTITUTION_CODE, PLATFORM_NAME, readAdmin } from "./api";

/**
 * Puts the institution's own name and mark on the browser tab.
 *
 * The title was baked into index.html at build time, so it carried whatever
 * name the bundle happened to be built under — a candidate mid-exam saw a
 * product name that was not their college's. Applying it at runtime means the
 * tab follows the institution actually being served, and a college that
 * changes its logo does not need the app rebuilt to see it.
 *
 * Runs once for the whole app rather than per screen, because the tab belongs
 * to the window, not to a page — and the exam screen, where it matters most,
 * is precisely where nobody would think to set it.
 */

function setFavicon(href) {
  if (!href) return;
  // Replace rather than append: browsers pick among several icon links
  // unpredictably, and a stale one can win.
  document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

export function applyBranding({ collegeName, collegeLogo } = {}) {
  const name = (collegeName || "").trim();
  if (name) document.title = name;
  if (collegeLogo) setFavicon(uploadUrl(collegeLogo));
}

/** Resolves this deployment's institution once and brands the tab with it. */
export function useInstitutionBranding(signedInAt) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A signed-in member of staff already carries their college with them,
      // so the tab is right immediately rather than after a round trip - and
      // stays right on a single-college install that has no code to resolve.
      const known = readAdmin();
      if (known?.collegeName) applyBranding(known);

      try {
        const institution = await examApi.institution(INSTITUTION_CODE);
        if (!cancelled && institution?.collegeName) applyBranding(institution);
      } catch {
        // Nothing resolved and nobody signed in: the configured name stands,
        // which is a better fallback than blanking the tab.
        if (!cancelled && !known?.collegeName && PLATFORM_NAME) document.title = PLATFORM_NAME;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInAt]);
}
