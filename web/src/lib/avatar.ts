import { createAvatar } from "@dicebear/core"
import { personas } from "@dicebear/collection"
import type { Options } from "@dicebear/core"

import type { Candidate } from "@/lib/types"

// Avatars illustrés des candidats (fictifs) : générés localement à partir de l'id (déterministe, hors ligne).
// Volontairement des dessins, jamais des photos : les candidats sont simulés.

// Prénoms féminins du générateur (sources/flexsis_fictif.py) ; les autres sont masculins.
const FEMININ = new Set(["Ana", "Céline", "Elodie", "Inês", "Laura", "Marta", "Sarah", "Sofia"])

const COMMON: Partial<personas.Options & Options> = {
  eyes: ["open", "happy", "glasses"],
  mouth: ["smile", "bigSmile", "smirk"],
  hairColor: ["362c47", "6c4545", "4a312c", "a55728", "d6b370", "2c1b18"],
  backgroundColor: ["dbeafe", "e0e7ff", "ede9fe", "dcfce7", "fef3c7", "ffe4e6", "e0f2fe"],
}

const FEMME: typeof COMMON = { ...COMMON, hair: ["long", "bobCut", "curly", "curlyBun", "bobBangs", "straightBun", "extraLong"], facialHairProbability: 0 }
const HOMME: typeof COMMON = {
  ...COMMON,
  hair: ["shortCombover", "buzzcut", "fade", "balding", "bald", "curlyHighTop", "shortComboverChops", "cap", "beanie"],
  facialHairProbability: 35,
}

const cache = new Map<string, string>()

export function candidateAvatar(c: Pick<Candidate, "id" | "prenom">): string {
  let uri = cache.get(c.id)
  if (!uri) {
    const opts = FEMININ.has(c.prenom) ? FEMME : HOMME
    uri = createAvatar(personas, { seed: c.id, ...opts }).toDataUri()
    cache.set(c.id, uri)
  }
  return uri
}
