export interface RawSourceItem {
  sourceName: string;
  sourceUri: string;
  externalKey: string;
  authorityName?: string;
  license?: string;
  rawPayload: Record<string, any>;
}

export interface ParsedTender {
  source_name: string;
  authority_name: string;
  tender_id: string;
  contract_id: string;
  package_name: string;
  work_type: string;
  official_status: string;
  contract_value_inr: number;
  start_date: string;
  target_completion_date: string;
  actual_completion_date?: string | null;
  defect_liability_end_date: string;
  external_key: string;
  source_uri: string;
  district?: string;
  road_name_hint: string;
  road_ref?: string;
  chainage_start_km: number;
  chainage_end_km: number;
  contractor: {
    legal_name: string;
    normalized_name: string;
    vendor_identifier: string;
    cin: string;
    gstin: string;
  };
}

export interface ParsedCivicSignal {
  source_name: string;
  external_key: string;
  source_uri: string;
  title: string;
  details: string;
  signal_type: 'official_portal' | 'news_media' | 'reddit_community' | 'twitter_signal' | 'field_evidence';
  road_name: string;
  lat: number;
  lon: number;
  published_at: string;
  verified: false; // External news/social reports never imply verified physical ground condition
  status: 'publisher_reported' | 'citizen_observed' | 'official_gazette';
  disclaimer?: string;
  is_demo?: boolean;
}

export interface IngestRunSummary {
  job: string;
  started_at: string;
  completed_at: string;
  total_discovered: number;
  new_inserted: number;
  updated: number;
  unchanged_skipped: number;
  r2_archived: number;
  errors: string[];
}
