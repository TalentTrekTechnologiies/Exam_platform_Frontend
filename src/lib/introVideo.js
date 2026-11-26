import { uploadUrl } from "./api";

/**
 * The 11-character id from any of the ways YouTube links are shared:
 * watch?v=, youtu.be/, /shorts/, /embed/, /live/. Null when it is not one.
 */
export const youtubeId = (value) => {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v")
      || (url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
};

/**
 * What the lobby should play for a stored introduction: an uploaded file's
 * name, a YouTube link, or a direct link to a video file.
 */
export const introMedia = (value) => {
  if (!value) return null;
  const id = youtubeId(value);
  if (id) {
    // nocookie: no tracking cookies on an exam machine. rel=0 keeps the
    // end screen to this channel instead of suggesting anything on YouTube.
    const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1", playsinline: "1" });
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?${params}` };
  }
  return { kind: "file", src: uploadUrl(value) };
};
