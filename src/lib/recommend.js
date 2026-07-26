// recommend.js — a lightweight, explainable "match score" for your
// Want-to-Watch movies. No ML/external service: it builds a genre + cast
// affinity profile from your rated/watched history (weighted so a 5-star
// favorite counts far more than something you watched once and shrugged
// at), then scores each unwatched movie by weighted overlap against that
// profile, with a small nudge from TMDB's own rating so it doesn't just
// chase niche genre/cast matches over generally-good movies.

const MAX_CAST = 10; // top-billed only — bit parts shouldn't dilute the signal

function movieWeight(movie) {
  if (movie.rating) return movie.rating; // 1-5, explicit signal wins
  if (movie.rewatch_count > 0) return 3 + Math.min(movie.rewatch_count, 2); // 4-5
  return 1; // watched once, unrated — still counts, just lightly
}

export function buildProfile(watchedMovies, metaByTmdbId) {
  const genreWeights = new Map(); // genre name -> total weight
  const actorWeights = new Map(); // person id -> { name, weight }

  for (const movie of watchedMovies) {
    const meta = metaByTmdbId.get(movie.tmdb_id);
    if (!meta) continue;
    const weight = movieWeight(movie);

    for (const genre of meta.raw_json?.genres ?? []) {
      genreWeights.set(genre.name, (genreWeights.get(genre.name) ?? 0) + weight);
    }

    const cast = meta.raw_json?.credits?.cast ?? [];
    cast.slice(0, MAX_CAST).forEach((actor, i) => {
      const billing = 1 - i / (MAX_CAST * 2); // top-billed counts more than bit parts
      const existing = actorWeights.get(actor.id);
      actorWeights.set(actor.id, { name: actor.name, weight: (existing?.weight ?? 0) + weight * billing });
    });
  }

  return { genreWeights, actorWeights };
}

export function hasEnoughData(profile) {
  return profile.genreWeights.size > 0;
}

// Returns 0-100, or null if there's no metadata to score against yet (the
// caller should show "pending" rather than a misleading 0%).
export function scoreMovie(meta, profile) {
  if (!meta || !hasEnoughData(profile)) return null;

  const genres = meta.raw_json?.genres ?? [];
  const cast = (meta.raw_json?.credits?.cast ?? []).slice(0, MAX_CAST);

  const maxGenreWeight = Math.max(1, ...profile.genreWeights.values());
  const genreScore = genres.reduce((sum, g) => sum + (profile.genreWeights.get(g.name) ?? 0), 0);
  const genreNorm = genres.length ? Math.min(1, genreScore / (genres.length * maxGenreWeight)) : 0;

  const actorWeightValues = [...profile.actorWeights.values()].map((a) => a.weight);
  const maxActorWeight = Math.max(1, ...actorWeightValues);
  const castScore = cast.reduce((sum, actor) => sum + (profile.actorWeights.get(actor.id)?.weight ?? 0), 0);
  const castNorm = cast.length ? Math.min(1, castScore / (cast.length * maxActorWeight)) : 0;

  const ratingNorm = (meta.raw_json?.vote_average ?? 0) / 10;

  const combined = genreNorm * 0.55 + castNorm * 0.35 + ratingNorm * 0.10;
  return Math.round(combined * 100);
}
