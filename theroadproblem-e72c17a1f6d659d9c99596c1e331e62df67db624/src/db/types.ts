export type UserRole = 'citizen' | 'verifier' | 'moderator' | 'admin';

export type IncidentCategory =
  | 'pothole'
  | 'dug_open'
  | 'damaged_surface'
  | 'flooded'
  | 'unsafe_workzone'
  | 'debris_blockage'
  | 'collapsed_culvert'
  | 'other';

export type IncidentLifecycle = 'active' | 'repair_reported' | 'resolved';

export type VerificationState =
  | 'unverified'
  | 'corroborated'
  | 'field_reviewed'
  | 'disputed'
  | 'resolved'
  | 'stale';

export type ObservedStatus =
  | 'dug_open'
  | 'partially_blocked'
  | 'damaged'
  | 'pothole'
  | 'flooded'
  | 'unsafe_workzone'
  | 'temporary_restoration'
  | 'repaired'
  | 'deteriorated'
  | 'normal'
  | 'unknown';

export type OfficialWorkStatus =
  | 'planned'
  | 'tendered'
  | 'awarded'
  | 'mobilized'
  | 'in_progress'
  | 'officially_completed'
  | 'maintenance'
  | 'cancelled'
  | 'unknown';

export interface User {
  id: string;
  display_name: string | null;
  email_private: string;
  role: UserRole;
  is_anonymous_public: boolean;
  reputation: number;
  locale: string;
  deleted_at: string | null;
  created_at: string;
}

export interface Road {
  id: string;
  name: string;
  ref: string | null;
  road_class: string;
  authority_name: string | null;
  state: string;
  district: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoadSegment {
  id: string;
  road_id: string;
  geom: any;
  chainage_from: number | null;
  chainage_to: number | null;
  state: string;
  district: string;
  local_body: string | null;
  osm_ids: number[];
  length_m: number;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Incident {
  id: string;
  road_segment_id: string | null;
  category: IncidentCategory;
  lifecycle_status: IncidentLifecycle;
  verification_state: VerificationState;
  predecessor_incident_id: string | null;
  first_observed_at: string;
  last_observed_at: string;
  resolved_at: string | null;
  centroid: any;
  merged_into_incident_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  incident_id: string;
  reporter_id: string;
  road_segment_id: string | null;
  observed_point: any;
  snap_distance_m: number | null;
  category: IncidentCategory;
  observed_status: ObservedStatus;
  description: string;
  observed_at: string;
  idempotency_key: string | null;
  publication_status: 'pending_checks' | 'published' | 'held' | 'rejected' | 'removed';
  moderation_reason: string | null;
  created_at: string;
}

export interface ReportMedia {
  id: string;
  report_id: string;
  storage_key_quarantine: string;
  storage_key_derivative: string | null;
  mime_type: string;
  file_size_bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  review_status: 'quarantined' | 'approved' | 'rejected' | 'redacted' | 'removed';
  processed_at: string | null;
  created_at: string;
}

export interface Corroboration {
  id: string;
  incident_id: string;
  actor_id: string;
  observation_time: string;
  verdict: 'confirms_problem' | 'confirms_repair' | 'disputes_problem';
  comment: string | null;
  created_at: string;
}

export interface Contractor {
  id: string;
  legal_name: string;
  normalized_name: string;
  vendor_identifier: string | null;
  cin: string | null;
  gstin: string | null;
  created_at: string;
}

export interface Work {
  id: string;
  authority_name: string;
  tender_id: string | null;
  contract_id: string | null;
  package_name: string;
  work_type: string;
  official_status: OfficialWorkStatus;
  start_date: string | null;
  target_completion_date: string | null;
  actual_completion_date: string | null;
  contract_value_inr: number | null;
  defect_liability_end_date: string | null;
  source_record_id: string | null;
  created_at: string;
}

export interface WorkContractor {
  work_id: string;
  contractor_id: string;
  role: 'primary_contractor' | 'subcontractor' | 'maintenance_concessionaire' | 'supervision_consultant';
  confidence: 'verified_contract' | 'letter_of_award' | 'provisional_match';
  source_record_id: string | null;
}

export interface EventRecord {
  id: string;
  entity_type: 'incident' | 'report' | 'work' | 'road_segment' | 'contractor' | 'corroboration';
  entity_id: string;
  event_type: string;
  old_state: any;
  new_state: any;
  actor_id: string | null;
  effective_at: string;
  source_record_id: string | null;
  reason: string | null;
}
