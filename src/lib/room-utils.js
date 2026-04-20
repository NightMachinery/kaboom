import { getPlaysetById } from "../helpers/playsets";

export function calculatePlaysetDisabled(playset, playerCount) {
  if (!playset) return false;
  if (typeof playset.min_players === "number" && playerCount < playset.min_players) return true;
  if (typeof playset.max_players === "number" && playerCount > playset.max_players) return true;
  return false;
}

export function recommendBuryFor(playset, playerCount) {
  if (!playset) return false;
  if (playset?.odd_card && playset?.odd_card?.id !== "drunk") return false;
  return ((playset?.cards?.filter((card) => card?.id !== "p001")?.length || 0) + (playset?.odd_card ? 1 : 0)) % 2 !== (playerCount % 2);
}

export async function loadPlayset(id) {
  return getPlaysetById(id || "t0001");
}
