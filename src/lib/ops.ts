// Operational kill switches & health configuration
let submissionsEnabled = true;
let ingestionEnabled = true;

export function getKillswitches() {
  return {
    submissions_enabled: submissionsEnabled,
    ingestion_enabled: ingestionEnabled,
  };
}

export function setKillswitch(key: 'submissions_enabled' | 'ingestion_enabled', value: boolean) {
  if (key === 'submissions_enabled') submissionsEnabled = value;
  if (key === 'ingestion_enabled') ingestionEnabled = value;
}

export function areSubmissionsEnabled(): boolean {
  return submissionsEnabled;
}

export function isIngestionEnabled(): boolean {
  return ingestionEnabled;
}
