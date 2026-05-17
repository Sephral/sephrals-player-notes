import { PLAYER_TYPE_HINTS, TRACKING_MODES } from "./constants.js";
import { normalizeText } from "./utils.js";

export function getActorTrackingMode(actorUuid, worldState) {
  return worldState?.actorTracking?.[actorUuid] ?? TRACKING_MODES.AUTO;
}

export function isActorLikelyPlayerControlled(actor) {
  if (!actor) return false;

  const hasAssignedCharacter = game?.users?.some((user) => !user.isGM && user.character?.uuid === actor.uuid);
  const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const hasNonGmOwner = game?.users?.some((user) => !user.isGM && actor.testUserPermission?.(user, ownerLevel));
  const typeHint = PLAYER_TYPE_HINTS.includes(normalizeText(actor.type));

  return Boolean(hasAssignedCharacter || hasNonGmOwner || typeHint);
}

export function shouldTrackActor(actor, worldState, noteCount = 0) {
  const mode = getActorTrackingMode(actor.uuid, worldState);
  if (mode === TRACKING_MODES.HIDDEN) return false;
  if (mode === TRACKING_MODES.TRACKED) return true;
  return isActorLikelyPlayerControlled(actor) || noteCount > 0;
}
