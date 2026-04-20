import tutorial from "../config/playsets/tutorial.json";
import official from "../config/playsets/official.json";
import friends from "../config/playsets/friends.json";
import necroboomicon from "../config/playsets/necroboomicon.json";
import dev from "../config/playsets/dev.json";

import { getCardFromId } from "./cards.js";

export const PLAYSET_COLORS = {
  tutorial: "#c342ff",
  official: "#427bff",
  friends: "#0da312",
  necroboomicon: "#9cde47",
  dev: "#FBBD23",
};

const PLAYSETS = { tutorial, official, friends, necroboomicon, dev };

export function getPlaysetsWithCards() {
  const out = {};

  for (const [key, value] of Object.entries(PLAYSETS)) {
    out[key] = value.map((playset) => {
      const cards = playset?.cards?.map((cid) => getCardFromId(cid)) || [];
      const primaries = playset?.primaries?.map((cid) => getCardFromId(cid)) || [];
      const defaultCards = playset?.default_cards?.map((cid) => getCardFromId(cid)) || null;
      const oddCard = playset?.odd_card ? getCardFromId(playset.odd_card) : null;

      return {
        ...playset,
        cards,
        primaries,
        default_cards: defaultCards,
        odd_card: oddCard,
        color: PLAYSET_COLORS[key],
        verified: key === "official",
        official: key === "official",
        dev: key === "dev",
      };
    });
  }

  return out;
}

export function getAllPlaysetsArray() {
  return Object.values(getPlaysetsWithCards()).flat();
}

export async function getPlaysetById(id) {
  return getAllPlaysetsArray().find((playset) => playset.id === id) || null;
}

export function minimizePlayset(playset) {
  if (!playset) return null;

  const copy = JSON.parse(JSON.stringify(playset));
  copy.primaries = copy?.primaries?.map((card) => card?.id || card);
  copy.default_cards = copy?.default_cards?.map((card) => card?.id || card);
  copy.cards = copy?.cards?.map((card) => card?.id || card);
  copy.odd_card = copy?.odd_card?.id || copy?.odd_card || null;
  return copy;
}

export function maximizePlayset(playset) {
  if (!playset) return null;

  const copy = JSON.parse(JSON.stringify(playset));
  copy.primaries = copy?.primaries?.map((cid) => getCardFromId(cid?.id || cid));
  copy.default_cards = copy?.default_cards?.map((cid) => getCardFromId(cid?.id || cid));
  copy.cards = copy?.cards?.map((cid) => getCardFromId(cid?.id || cid));
  copy.odd_card = getCardFromId(copy?.odd_card?.id || copy?.odd_card) || null;
  return copy;
}

export function allCardsInRow(playset) {
  const cards = playset?.cards || [];
  const oddCard = playset?.odd_card || null;
  const primaries = playset?.primaries || [];
  const defaultCards = playset?.default_cards || [];

  return [...cards, ...primaries, oddCard, ...defaultCards]
    .filter(Boolean)
    .map((card) => getCardFromId(card?.id || card));
}
