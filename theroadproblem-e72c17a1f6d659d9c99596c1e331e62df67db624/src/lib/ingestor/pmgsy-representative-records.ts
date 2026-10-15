export function getPmgsyRepresentativeRecords(options: {
  status?: string;
  includeAmbiguous?: boolean;
  version?: string;
} = {}) {
  const statusParam = options.status || 'awarded';
  const includeAmbiguous = options.includeAmbiguous === true;
  const versionParam = options.version || '1';

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

  const recordKA2502 = {
    source_name: 'PMGSY / OMMAS Rural Road Registry',
    publisher: 'National Rural Infrastructure Development Agency (NRIDA) / KRRDA',
    base_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-02',
    district: 'Ramanagara',
    state: 'Karnataka',
    package_name: 'Package KA-25-02: Kanakapura to Sangama Rural Road Rehabilitation & Shoulder Protection',
    tender_id: 'PMGSY-OMMAS-KA-25-02-2023',
    contract_id: 'CTR-PMGSY-KA25-02',
    work_type: 'Bituminous Rural Road Construction & 5-Year Maintenance',
    official_status: 'officially_completed',
    contract_value_inr: 64500000, // ₹6.45 Cr
    start_date: '2023-09-01',
    target_completion_date: '2024-05-30',
    actual_completion_date: '2024-05-25',
    defect_liability_end_date: '2029-05-25',
    external_key: 'PMGSY-KA-25-02-2023',
    source_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-02',
    sanction_year: '2023-2024',
    sanction_order_no: 'NRIDA/KA/2023/P-III/104',
    sanction_date: '2023-08-20',
    executive_engineer: 'Executive Engineer, KRRDA PIU Ramanagara',
    road_name_hint: 'Ramanagara Kanakapura Rural Road',
    road_ref: 'MDR-104',
    chainage_start_km: 0.0,
    chainage_end_km: 18.5,
    payload_version: versionParam,
    contractor: {
      legal_name: 'Kaveri Infra Projects India Ltd',
      normalized_name: 'kaveri-infra-projects-india',
      vendor_identifier: 'VND-KRRDA-RAM-8841',
      cin: 'U45200KA2012PLC064890',
      gstin: '29AABCK4890K1Z4'
    }
  };

  const recordKA2503 = {
    source_name: 'PMGSY / OMMAS Rural Road Registry',
    publisher: 'National Rural Infrastructure Development Agency (NRIDA) / KRRDA',
    base_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-03',
    district: 'Ramanagara',
    state: 'Karnataka',
    package_name: 'Package KA-25-03: Channapatna Silk Handloom Cluster to Iggalur Rural Connectivity',
    tender_id: 'PMGSY-OMMAS-KA-25-03-2023',
    contract_id: 'CTR-PMGSY-KA25-03',
    work_type: 'All-Weather Rural Road Pavement Construction & CD Works',
    official_status: 'awarded',
    contract_value_inr: 38200000, // ₹3.82 Cr
    start_date: '2024-01-15',
    target_completion_date: '2024-12-20',
    actual_completion_date: null,
    defect_liability_end_date: '2029-12-20',
    external_key: 'PMGSY-KA-25-03-2023',
    source_uri: 'http://omms.nic.in/StateProjects/RoadDetails/KA-25-03',
    sanction_year: '2023-2024',
    sanction_order_no: 'NRIDA/KA/2023/P-III/112',
    sanction_date: '2023-09-10',
    executive_engineer: 'Executive Engineer, KRRDA PIU Ramanagara',
    road_name_hint: 'Bidadi to Byramangala PMGSY Road',
    road_ref: 'KA-25-01',
    chainage_start_km: 0.0,
    chainage_end_km: 4.95,
    payload_version: versionParam,
    contractor: {
      legal_name: 'Sri Channapatna Infratech Enterprises',
      normalized_name: 'sri-channapatna-infratech',
      vendor_identifier: 'VND-KRRDA-RAM-6231',
      cin: 'U45201KA2017PTC091823',
      gstin: '29AAACS9182L1Z3'
    }
  };

  const records = [baseRecord, recordKA2502, recordKA2503];

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

  return records;
}

