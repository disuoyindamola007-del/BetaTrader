export function reportCloudSyncError(service, error) {
  const message = error?.message || 'Cloud sync failed.';
  console.error(`[${service}] Cloud sync failed:`, message);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('betatrader:cloud-sync-error', {
      detail: { service, message },
    }));
  }
}
