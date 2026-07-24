import { supabaseBrowser } from "./supabase/client";

const BUCKET = "match-images";

export function matchImagePath(tournamentId, roundIdx, matchIdx, filename) {
  return `${tournamentId}/${roundIdx}-${matchIdx}/${filename}`;
}

export async function uploadMatchImage(tournamentId, roundIdx, matchIdx, blob) {
  const supabase = supabaseBrowser();
  const path = matchImagePath(tournamentId, roundIdx, matchIdx, `${crypto.randomUUID()}.jpg`);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) return { path: null, error };
  return { path, error: null };
}

export async function getMatchImageUrl(path) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// Wipe every screenshot uploaded for a tournament (called on cancel/archive).
export async function purgeTournamentImages(tournamentId) {
  const supabase = supabaseBrowser();
  try {
    const { data: folders } = await supabase.storage.from(BUCKET).list(tournamentId);
    if (!folders || folders.length === 0) return;
    const allPaths = [];
    for (const folder of folders) {
      const { data: files } = await supabase.storage.from(BUCKET).list(`${tournamentId}/${folder.name}`);
      for (const f of files || []) {
        allPaths.push(`${tournamentId}/${folder.name}/${f.name}`);
      }
    }
    if (allPaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(allPaths);
    }
  } catch {
    // best effort — cleanup failures shouldn't block archiving/cancelling
  }
}
