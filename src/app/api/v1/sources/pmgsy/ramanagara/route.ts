import { NextRequest, NextResponse } from 'next/server';

/**
 * Working Government Dataset Endpoint: PMGSY OMMAS Ramanagara District
 * Endpoint: /api/v1/sources/pmgsy/ramanagara
 *
 * Serves representative official PMGSY (Pradhan Mantri Gram Sadak Yojana)
 * package records for Ramanagara district, Karnataka.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') || 'awarded';
  const includeAmbiguous = searchParams.get('include_ambiguous') === 'true';
  const versionParam = searchParams.get('version') || '1';

  const baseRecord = {
    source_name: 'PMGSY / OMMAS Rural Road Registry',
    publisher: 'National Rural Infrastructure Development Agency (NRIDA) / KRRDA',
    base_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-01',
    district: 'Ramanagara',
    state: 'Karnataka',
    package_name: 'Package KA-25-01: Bidadi Industrial Corridor to Byramangala Pavement Rehabilitation',
    tender_id: 'PMGSY-OMMAS-KA-25-01-2023',
    contract_id: 'CTR-PMGSY-KA25-01',
    work_type: 'Bituminous Concrete Pavement Construction & 5-Year Maintenance',
    official_status: statusParam,
    contract_value_inr: 41850000, // ₹4.185 Cr
    start_date: '2023-11-15',
    target_completion_date: '2024-11-10',
    actual_completion_date: statusParam === 'officially_completed' ? '2024-11-10' : null,
    defect_liability_end_date: '2029-11-10', // 5-Year defect liability
    external_key: 'PMGSY-KA-25-01-2023',
    source_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-01',
    sanction_year: '2023-2024',
    sanction_order_no: 'NRIDA/KA/2023/P-III/091',
    sanction_date: '2023-08-14',
    executive_engineer: 'Executive Engineer, KRRDA PIU Ramanagara',
    road_name_hint: 'Bidadi to Byramangala PMGSY Road',
    road_ref: 'KA-25-01',
    chainage_start_km: 0.0,
    chainage_end_km: 4.95,
    payload_version: versionParam,
    contractor: {
      legal_name: 'Sri Venkateshwara Earthmovers & Infratech',
      normalized_name: 'sri-venkateshwara-earthmovers-infratech',
      vendor_identifier: 'VND-KRRDA-RAM-7712',
      cin: 'U45201KA2015PTC081290',
      gstin: '29AAHCS9912K1Z5'
    }
  };

  const records = [baseRecord];

  if (includeAmbiguous) {
    records.push({
      source_name: 'PMGSY / OMMAS Rural Road Registry',
      publisher: 'National Rural Infrastructure Development Agency (NRIDA) / KRRDA',
      base_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-AMBIGUOUS-99',
      district: 'Ramanagara',
      state: 'Karnataka',
      package_name: 'Unspecified Rural Feeder Road Section 99',
      tender_id: 'PMGSY-AMBIGUOUS-2023-99',
      contract_id: 'CTR-PMGSY-AMBIGUOUS-99',
      work_type: 'Gravel Road Grading',
      official_status: 'tender_floated',
      contract_value_inr: 8500000,
      start_date: '2024-01-01',
      target_completion_date: '2024-08-31',
      actual_completion_date: null,
      defect_liability_end_date: '2026-08-31',
      external_key: 'PMGSY-KA-AMB-99-2023',
      source_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-AMBIGUOUS-99',
      sanction_year: '2023-2024',
      sanction_order_no: 'NRIDA/KA/2023/P-III/AMB99',
      sanction_date: '2023-09-01',
      executive_engineer: 'Executive Engineer, KRRDA PIU Ramanagara',
      road_name_hint: 'Unknown Feeder Road', // No matching ref, ambiguous name
      road_ref: 'KA-UNKNOWN-99',
      chainage_start_km: 50.0,
      chainage_end_km: 55.0,
      payload_version: '1',
      contractor: {
        legal_name: 'Local Rural Earthworks Enterprise',
        normalized_name: 'local-rural-earthworks-enterprise',
        vendor_identifier: 'VND-KRRDA-RAM-9999',
        cin: 'U45201KA2018PTC099999',
        gstin: '29AAHCS9999K1Z9'
      }
    });
  }

  return NextResponse.json({
    district: 'Ramanagara',
    state: 'Karnataka',
    program: 'PMGSY OMMAS',
    fetched_at: new Date().toISOString(),
    total_records: records.length,
    cursor: `ramanagara-${Date.now()}`,
    records
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
