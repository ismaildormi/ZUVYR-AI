/**
 * Educational pattern: ownership alone is not enough.
 * Evaluate explicit permission, scope, expiry and revocation before execution.
 */

export function authorizeAction({ actorId, resource, grant, action, now = Date.now() }) {
  if (!resource || resource.ownerId !== actorId) {
    return { allowed: false, reason: "wrong_owner" };
  }

  if (!grant || grant.subjectId !== actorId) {
    return { allowed: false, reason: "missing_grant" };
  }

  if (grant.revokedAt) {
    return { allowed: false, reason: "grant_revoked" };
  }

  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now) {
    return { allowed: false, reason: "grant_expired" };
  }

  if (!grant.actions?.includes(action)) {
    return { allowed: false, reason: "action_not_granted" };
  }

  if (grant.resourceId && grant.resourceId !== resource.id) {
    return { allowed: false, reason: "resource_out_of_scope" };
  }

  return { allowed: true };
}
