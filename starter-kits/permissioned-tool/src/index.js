function authorize({ actorId, resource, grant, action, now = Date.now() }) {
  if (resource.ownerId !== actorId) return { allowed: false, reason: "wrong_owner" };
  if (!grant || grant.subjectId !== actorId) return { allowed: false, reason: "missing_grant" };
  if (grant.revokedAt) return { allowed: false, reason: "grant_revoked" };
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) {
    return { allowed: false, reason: "grant_expired" };
  }
  if (!grant.actions.includes(action)) return { allowed: false, reason: "action_not_granted" };
  if (grant.resourceId && grant.resourceId !== resource.id) {
    return { allowed: false, reason: "resource_out_of_scope" };
  }
  return { allowed: true };
}

const actorId = "user-123";
const resource = { id: "project-456", ownerId: actorId };
const grant = {
  subjectId: actorId,
  resourceId: resource.id,
  actions: ["read", "build"],
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
};

console.log("build:", authorize({ actorId, resource, grant, action: "build" }));
console.log("delete:", authorize({ actorId, resource, grant, action: "delete" }));
