let activeUserId = null;

export function setStorageUser(userId) {
  activeUserId = typeof userId === 'string' && userId ? userId : null;
}

export function scopedStorageKey(baseKey) {
  return activeUserId ? `${baseKey}:user:${activeUserId}` : `${baseKey}:signed-out`;
}
