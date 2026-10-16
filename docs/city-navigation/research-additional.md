# Additional city boundary sources

Checked 16 October 2026. This note supports six additional cities; Vijayawada and Visakhapatnam are covered by [the separate Andhra note](research-andhra.md). It records evidence and acquisition gaps, not imported or certified geometry.

## Patna

- [PMC's official property-tax page](https://www.pmc.bihar.gov.in/ptaxAssessment.aspx) explicitly describes six municipal circles. The [ward-area roster](https://www.pmc.bihar.gov.in/wardwisearea.aspx) contains 75 entries, including letter-suffixed wards; do not count only the largest numeric ward label.
- [PMC IT initiatives](https://www.pmc.bihar.gov.in/ITinitiative.aspx) links GET MY WARD, municipal asset GIS and 2026 drainage mapping. Those are acquisition entry points; a supported complete current public vector export was not verified.
- The [2019–20 official budget](https://pmc.bihar.gov.in/siteassets/pdfs/19-20.pdf), table 15, names Patliputra, New Capital, Kankarbagh, Bankipore, Azimabad and Patna City circles and lists their wards. It duplicates ward 55 across two circle rows and includes a separate Ganga engineering division. Treat it as historical evidence requiring a current reconciled crosswalk, not seed data.
- [An official ward map example](https://www.pmc.bihar.gov.in/siteassets/pdfs/Drainage/Map%20Pdf/PCC/70.pdf) shows ward-level mapped infrastructure. Request originating vector data, map date and reuse terms. [Bihar SEC GIS](https://gis.bihar.gov.in/DEPTS/secb.aspx) is another official map discovery route.
- Revenue administration is different: [Patna district](https://patna.nic.in/administrative-setup/) lists 23 revenue circles. [PMAA zonal development plans](https://pmaa.bihar.gov.in/node/920) are planning geography. Neither should replace PMC's six civic circles.

## Bhubaneswar

- [BMC's zones/wards page](https://www.bmc.gov.in/about/zones-wards) provides three territorial ward groupings, map links and notification links. The linked [final 2022 notification](https://cms.bhubaneswarone.in/uploadDocuments/content/1556-BMC_Final_Notification.pdf) explicitly divides BMC into 67 wards and includes boundary descriptions.
- [Official ward map PDF](https://cms.bhubaneswarone.in/uploadDocuments/content/Ward_Map_1.pdf); [zone image](https://cms.bhubaneswarone.in/uploadDocuments/content/Zone-Map_img_0.jpg). These are map artifacts, not a verified vector download. Bhubaneswar One is the official viewer acquisition route.
- A reported 2026 change from three to six zones is an unresolved discovery lead. No operative current official zone-reorganization order was obtained in this research. Obtain it before publishing administrative-zone shapes or a current count.
- The BMC page displays a CC BY 4.0 notice. Capture and check the terms applicable to each linked dataset rather than assume every separately hosted map has identical terms.
- Keep BMC municipal geography separate from BDA's planning/development area and from Odisha Works/highway road custody. Candidate road-agency names require actual asset, contract or transfer evidence.

## Guwahati

- [Official Our Zones page](https://gmc.assam.gov.in/about-us/detail/our-zones) says six zones for trade licence, property tax and assessment: Central, East, South, West, Dispur and Lokhra. It includes old/new ward crosswalks. This establishes a service-area scheme, not necessarily road-maintenance divisions.
- [Final 60-ward delimitation map index](https://gmc.assam.gov.in/latest/final-delimitation-of-60-wards-map-of-guwahati-municipal-corporation); [official map PDF](https://gmc.assam.gov.in/sites/default/files/swf_utility_folder/departments/gmc_webcomindia_org_oid_5/this_comm/ward_map_gmc_modified_0.pdf). Archive the exact final notification and later corrections, not similarly named draft proposals.
- Obtain vector geometry and current legal version from GMC/state GIS. GMDA's metropolitan planning area and Kamrup Metropolitan district are distinct from the municipal footprint.

## Ranchi

- [District government election publication](https://ranchi.nic.in/notice/ranchi-nagar-nigam-election-2025/), dated 18 March 2025, links an RMC 1–53 ward document. This provides a more recent identity check than relying only on old municipal introduction text.
- [RMC fact sheet](https://www.ranchimunicipal.com/AboutUs.aspx?uid=2) says 53 wards, but includes dated demographic/asset figures. Do not treat all figures on a live page as measured in 2026.
- A current complete ward vector release and current intermediate engineering/service-area polygons were not verified. Begin with RMC and state urban-development/GIS data requests. Use a direct city-to-ward navigation path until a documented intermediate layer is obtained.
- Keep RMC, state Road Construction Department and JUIDCO project roles separate, resolving them through dated asset/work/handover records.

## Raipur

- [Current official contact directory](https://nagarnigamraipur.nic.in/en/contact-us) lists zones 1–10, each with a commissioner and executive engineer. The [2025–26 budget](https://nagarnigamraipur.nic.in/sites/default/files/budget2025-26.pdf) also refers to zones 1–10.
- [Official operational ward list](https://nagarnigamraipur.nic.in/en/node/3055/wardmaptrack.php?ward_no=15) contains 70 actual ward rows and an extra operational row labelled “Zone extra”. The latter is not a new electoral ward. Validate against the final ward notification before import.
- [Ward boundary entry point](https://nagarnigamraipur.nic.in/hi/ward-boundaries); [legacy whole-city map](https://www.nagarnigamraipur.nic.in/sites/default/files/rmc-rmc-map.pdf). The legacy map says eight zones and must not be presented as the current ten-zone geometry.
- Request latest zone/ward GIS and current notification. Atal Nagar/Naya Raipur and its development authority require a separate footprint and source registry.

## Madurai

- [Current official council roster](https://maduraicorporation.co.in/aboutus/council/) lists 100 wards under five municipal zones: East I, North II, Central III, South IV, West V.
- [Zones/wards map entry](https://maduraicorporation.co.in/aboutus/general-infozones-and-wards/). Obtain current final boundaries and source GIS; a complete supported current vector download was not established in this research.
- The [official water-project document](https://maduraicorporation.co.in/document/15_Appendix%20FINAL%20RP%20Madurai%20Water%20Supply.pdf) contains project/water-distribution maps. Its hydraulic zones cannot substitute for the five civic zones. Older four-zone/72-ward material is historical.
- Municipal engineering, Tamil Nadu Highways and highway agencies need separate evidenced responsibility assignments; a municipal ward label alone does not decide custody.

## National acquisition backbone

- [Ministry explanation of LGD](https://panchayat.gov.in/en/lgd/) confirms unique codes and maintenance of reorganized local bodies. [LGD download directory](https://lgdirectory.gov.in/demo/downloadDirectory.do) is the identity/roster acquisition route; access may require interactive steps. Do not promise unattended access or universal polygons.
- [data.gov.in LGD catalogue](https://data.gov.in/catalog/local-government-directory-lgd) is another government discovery route. Evaluate actual resources/schema/access during adapter implementation.
- [Bhuvan viewer](https://bhuvan-app1.nrsc.gov.in/bhuvan2d/bhuvan/bhuvan2d.php) and [service inventory](https://bhuvan-app1.nrsc.gov.in/2dresources/bhuvanstore.php) can help find government map layers. Some layers are old thematic releases; WMS/WMTS display availability does not establish current ward vector data or unrestricted republication.

All six cities still require a documented legal/version/reuse/geometry review before their polygons can become an authoritative published release. This is compatible with showing clearly labelled city discovery markers earlier.
