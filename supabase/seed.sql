--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)


--
-- Data for Name: contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.contractors VALUES ('8c539ab9-fef1-41ca-bcfe-285643937019', 'Larsen & Toubro Infrastructure Engineering Ltd.', 'Larsen and Toubro Infrastructure Engineering Limited', 'LNT-INFRA-8839', 'U74210TN1998PLC041697', '29AAACL1234F1Z8', '2026-10-13 10:24:05.197593+00');
INSERT INTO public.contractors VALUES ('4afeb59a-b64a-4d30-beec-1db0b6ab20e1', 'KNR Constructions Limited', 'KNR Constructions Limited', 'KNR-HYD-5002', 'L74210TG1995PLC020833', '36AABCK1234G1Z2', '2026-10-13 10:24:05.228547+00');


--
-- Data for Name: data_sources; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_sources VALUES ('876ff5e7-3285-46ec-8f4e-abbe9fb2d581', 'OpenStreetMap India Roads', 'OpenStreetMap Contributors', 'https://download.geofabrik.de/asia/india.html', 'ODbL 1.0', 'extract', 'weekly', '2026-10-13 10:15:39.269783+00', '2026-10-13 10:15:39.269783+00');
INSERT INTO public.data_sources VALUES ('3af14851-536d-46a1-944d-0d9ed5d1ed99', 'Open Government Data Transport', 'Ministry of Road Transport and Highways (MoRTH)', 'https://data.gov.in', 'GODL India', 'api', 'monthly', '2026-10-13 10:15:39.269783+00', '2026-10-13 10:15:39.269783+00');
INSERT INTO public.data_sources VALUES ('e4e2e5fe-d2fc-4012-bce0-3902d7ac8bac', 'Central Public Procurement Portal', 'National Informatics Centre (NIC)', 'https://eprocure.gov.in', 'GODL India', 'web', 'weekly', '2026-10-13 10:15:39.269783+00', '2026-10-13 10:15:39.269783+00');
INSERT INTO public.data_sources VALUES ('ee0fa99f-3885-492b-9cf2-34cbbc79884f', 'OpenStreetMap India Roads', 'OpenStreetMap Contributors', 'https://download.geofabrik.de/asia/india.html', 'ODbL 1.0', 'extract', 'weekly', '2026-10-13 10:16:44.96092+00', '2026-10-13 10:16:44.96092+00');
INSERT INTO public.data_sources VALUES ('340433ef-662f-4b60-8d76-9ac8125d9450', 'Open Government Data Transport', 'Ministry of Road Transport and Highways (MoRTH)', 'https://data.gov.in', 'GODL India', 'api', 'monthly', '2026-10-13 10:16:44.96092+00', '2026-10-13 10:16:44.96092+00');
INSERT INTO public.data_sources VALUES ('c4c99474-f2af-4004-982f-d78b051fddcc', 'Central Public Procurement Portal', 'National Informatics Centre (NIC)', 'https://eprocure.gov.in', 'GODL India', 'web', 'weekly', '2026-10-13 10:16:44.96092+00', '2026-10-13 10:16:44.96092+00');


--
-- Data for Name: localities; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.localities VALUES ('8cada602-4f2c-4a0c-a4ef-6ca8a0a4abc6', 'Bengaluru', 'बेंगलुरु', 'Karnataka', 'Bengaluru Urban', 'city', '0101000020E6100000E78C28ED0D6653405396218E75F12940', '2026-10-13 10:15:39.295117+00');
INSERT INTO public.localities VALUES ('0ba50067-807d-4baf-a96e-844956210ea9', 'Silk Board Junction', 'सिल्क बोर्ड जंक्शन', 'Karnataka', 'Bengaluru Urban', 'junction', '0101000020E6100000569FABADD867534068B3EA73B5D52940', '2026-10-13 10:15:39.328616+00');
INSERT INTO public.localities VALUES ('e98b727b-b392-4149-a103-571c6d39e9ea', 'Ramanagara', 'रामनगर', 'Karnataka', 'Ramanagara', 'town', '0101000020E61000006F1283C0CA515340FED478E926712940', '2026-10-13 10:15:39.330954+00');
INSERT INTO public.localities VALUES ('57ca827f-9aee-4d59-948d-a76b51534441', 'Bidadi', 'बिदादी', 'Karnataka', 'Ramanagara', 'town', '0101000020E61000001B2FDD2406595340D7A3703D0A972940', '2026-10-13 10:15:39.333864+00');
INSERT INTO public.localities VALUES ('ac3f07de-1620-4a7f-a713-8c23dee33d41', 'New Delhi', 'नई दिल्ली', 'Delhi', 'New Delhi', 'city', '0101000020E61000004C378941604D5340B003E78C289D3C40', '2026-10-13 10:15:39.33581+00');
INSERT INTO public.localities VALUES ('77f29567-85a3-4d1f-bc60-d13ffc112e03', 'Mumbai', 'मुंबई', 'Maharashtra', 'Mumbai City', 'city', '0101000020E6100000C0EC9E3C2C385240FA7E6ABC74133340', '2026-10-13 10:15:39.337355+00');
INSERT INTO public.localities VALUES ('824f6144-e024-4c86-9d19-6577222cca18', 'Lucknow', 'लखनऊ', 'Uttar Pradesh', 'Lucknow', 'city', '0101000020E61000006ADE718A8E3C5440F085C954C1D83A40', '2026-10-13 10:15:39.339341+00');
INSERT INTO public.localities VALUES ('e5edce4e-ec2b-4631-9d7a-d3162be42bd7', 'Patna', 'पटना', 'Bihar', 'Patna', 'city', '0101000020E61000007FFB3A70CE485540B98D06F016983940', '2026-10-13 10:15:39.341335+00');
INSERT INTO public.localities VALUES ('8523446d-abdb-415c-946e-60287c55cf56', 'Guwahati', 'गुवाहाटी', 'Assam', 'Kamrup Metropolitan', 'city', '0101000020E61000002CD49AE61DEF5640A245B6F3FD243A40', '2026-10-13 10:15:39.343204+00');
INSERT INTO public.localities VALUES ('717babfb-1780-410e-bc7e-db332b93cab2', 'Bengaluru', 'बेंगलुरु', 'Karnataka', 'Bengaluru Urban', 'city', '0101000020E6100000E78C28ED0D6653405396218E75F12940', '2026-10-13 10:16:44.968829+00');
INSERT INTO public.localities VALUES ('44752bcc-6f5e-4058-80b3-c7f792778691', 'Silk Board Junction', 'सिल्क बोर्ड जंक्शन', 'Karnataka', 'Bengaluru Urban', 'junction', '0101000020E6100000569FABADD867534068B3EA73B5D52940', '2026-10-13 10:16:44.981992+00');
INSERT INTO public.localities VALUES ('a44ab532-4666-47f0-b441-edc994eef8f7', 'Ramanagara', 'रामनगर', 'Karnataka', 'Ramanagara', 'town', '0101000020E61000006F1283C0CA515340FED478E926712940', '2026-10-13 10:16:44.984189+00');
INSERT INTO public.localities VALUES ('38821354-f950-409d-aeb5-b5024b54d4ff', 'Bidadi', 'बिदादी', 'Karnataka', 'Ramanagara', 'town', '0101000020E61000001B2FDD2406595340D7A3703D0A972940', '2026-10-13 10:16:44.986661+00');
INSERT INTO public.localities VALUES ('76bfb58e-4be8-4cfe-a953-7c1796705f3e', 'New Delhi', 'नई दिल्ली', 'Delhi', 'New Delhi', 'city', '0101000020E61000004C378941604D5340B003E78C289D3C40', '2026-10-13 10:16:44.988736+00');
INSERT INTO public.localities VALUES ('f35efcfc-c1bc-41ea-ad3b-5bd616d2047b', 'Mumbai', 'मुंबई', 'Maharashtra', 'Mumbai City', 'city', '0101000020E6100000C0EC9E3C2C385240FA7E6ABC74133340', '2026-10-13 10:16:44.990357+00');
INSERT INTO public.localities VALUES ('b7959c6e-9018-4187-b1bb-695e5a393b3b', 'Lucknow', 'लखनऊ', 'Uttar Pradesh', 'Lucknow', 'city', '0101000020E61000006ADE718A8E3C5440F085C954C1D83A40', '2026-10-13 10:16:44.991936+00');
INSERT INTO public.localities VALUES ('b3fc836a-0ead-400b-ab6d-dd569e30017e', 'Patna', 'पटना', 'Bihar', 'Patna', 'city', '0101000020E61000007FFB3A70CE485540B98D06F016983940', '2026-10-13 10:16:44.993345+00');
INSERT INTO public.localities VALUES ('a2aec05b-5831-4fdf-aadf-46ef57bcaf92', 'Guwahati', 'गुवाहाटी', 'Assam', 'Kamrup Metropolitan', 'city', '0101000020E61000002CD49AE61DEF5640A245B6F3FD243A40', '2026-10-13 10:16:44.994908+00');


--
-- Data for Name: roads; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.roads VALUES ('32b3d12c-7692-403c-87e5-8a4e2b9f68e7', 'Outer Ring Road', 'ORR / NH-44', 'primary', 'BBMP / BDA', 'Karnataka', 'Bengaluru Urban', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.34855+00', '2026-10-13 10:15:39.34855+00');
INSERT INTO public.roads VALUES ('c63e2d1b-3b7a-41af-85c8-2ee9459e691c', 'Hosur Road (Elevated Tollway)', 'NH-44', 'motorway', 'NHAI', 'Karnataka', 'Bengaluru Urban', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.406645+00', '2026-10-13 10:15:39.406645+00');
INSERT INTO public.roads VALUES ('988eb4a4-430b-4293-85a3-1bbb2ba4ad7f', 'Hosur Road (Surface Service Carriageway)', 'Service Lane NH-44', 'secondary', 'BBMP', 'Karnataka', 'Bengaluru Urban', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.414208+00', '2026-10-13 10:15:39.414208+00');
INSERT INTO public.roads VALUES ('1ce9c7b2-15c8-4f02-85fa-1f40fd44c9bb', 'Mahatma Gandhi Road', 'MG Road', 'primary', 'BBMP', 'Karnataka', 'Bengaluru Urban', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.421734+00', '2026-10-13 10:15:39.421734+00');
INSERT INTO public.roads VALUES ('07f129bb-2810-4350-8d9b-8a97a7b94ab6', 'Ramanagara Kanakapura Rural Road', 'MDR-104', 'secondary', 'Karnataka PWD', 'Karnataka', 'Ramanagara', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.42846+00', '2026-10-13 10:15:39.42846+00');
INSERT INTO public.roads VALUES ('dd5c5f13-8db2-48d7-afe4-3f4cc7cf079a', 'Bidadi to Byramangala PMGSY Road', 'KA-25-01', 'unclassified', 'NRIDA / PMGSY', 'Karnataka', 'Ramanagara', '876ff5e7-3285-46ec-8f4e-abbe9fb2d581', '2026-10-13 10:15:39.436134+00', '2026-10-13 10:15:39.436134+00');
INSERT INTO public.roads VALUES ('9b2ff597-363a-4af2-a317-4a039c6f3548', 'Test Lineage Avenue', 'TLA-01', 'primary', NULL, 'Karnataka', 'Bengaluru Urban', NULL, '2026-10-13 10:16:45.00867+00', '2026-10-13 10:16:45.00867+00');


--
-- Data for Name: road_segments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.road_segments VALUES ('e299413e-ffdd-4f6c-9fa9-30134d34fe3a', '32b3d12c-7692-403c-87e5-8a4e2b9f68e7', '0102000020E610000004000000569FABADD867534068B3EA73B5D5294079E92631086853409EEFA7C64BD72940B81E85EB51685340F0164850FCD82940F853E3A59B685340431CEBE236DA2940', 0, 1.2, 'Karnataka', 'Bengaluru Urban', NULL, '{1000101}', 1631.02068943336, 1, true, '2026-10-13 10:15:39.355565+00', '2026-10-13 10:15:39.355565+00');
INSERT INTO public.road_segments VALUES ('c2febf82-3287-4fe1-b98e-b677869c8069', '32b3d12c-7692-403c-87e5-8a4e2b9f68e7', '0102000020E610000004000000F853E3A59B685340431CEBE236DA294046B6F3FDD46853404260E5D022DB294077BE9F1A2F6953400612143FC6DC2940FDF675E09C6953401F85EB51B8DE2940', 1.2, 2.5, 'Karnataka', 'Bengaluru Urban', NULL, '{1000102}', 1962.60779889204, 1, true, '2026-10-13 10:15:39.402648+00', '2026-10-13 10:15:39.402648+00');
INSERT INTO public.road_segments VALUES ('2e097864-fbea-430e-9cca-4eaa24ea7f2c', 'c63e2d1b-3b7a-41af-85c8-2ee9459e691c', '0102000020E610000004000000D578E92631685340B29DEFA7C6CB2940713D0AD7A36853400000000000C029407D3F355EBA695340C1CAA145B6B32940C3F5285C8F6A534021B0726891AD2940', 12, 15.5, 'Karnataka', 'Bengaluru Urban', NULL, '{1000201}', 7826.29541438835, 1, true, '2026-10-13 10:15:39.409038+00', '2026-10-13 10:15:39.409038+00');
INSERT INTO public.road_segments VALUES ('7491aa37-82f5-4b31-b8ce-ec500350e380', '988eb4a4-430b-4293-85a3-1bbb2ba4ad7f', '0102000020E61000000400000039D6C56D34685340B29DEFA7C6CB2940D49AE61DA76853400000000000C02940E09C11A5BD695340C1CAA145B6B32940265305A3926A534021B0726891AD2940', 12, 15.5, 'Karnataka', 'Bengaluru Urban', NULL, '{1000202}', 7826.29541438835, 1, true, '2026-10-13 10:15:39.417573+00', '2026-10-13 10:15:39.417573+00');
INSERT INTO public.road_segments VALUES ('2c76a15d-e8a7-47ec-803c-75b7edc6c1e4', '1ce9c7b2-15c8-4f02-85fa-1f40fd44c9bb', '0102000020E610000004000000022B8716D96653403333333333F32940BA490C022B6753406DE7FBA9F1F22940643BDF4F8D675340A69BC420B0F229400E2DB29DEF675340DF4F8D976EF22940', 0, 1.8, 'Karnataka', 'Bengaluru Urban', NULL, '{1000301}', 1851.93571275154, 1, true, '2026-10-13 10:15:39.424327+00', '2026-10-13 10:15:39.424327+00');
INSERT INTO public.road_segments VALUES ('9767dc92-7d32-4daa-a906-6b087f7df75d', '07f129bb-2810-4350-8d9b-8a97a7b94ab6', '0102000020E6100000040000006F1283C0CA515340FED478E9267129407B14AE47E1525340295C8FC2F56829408716D9CEF753534054E3A59BC460294085EB51B81E555340643BDF4F8D572940', 0, 4.5, 'Karnataka', 'Ramanagara', NULL, '{2000101}', 7906.27397481314, 1, true, '2026-10-13 10:15:39.43153+00', '2026-10-13 10:15:39.43153+00');
INSERT INTO public.road_segments VALUES ('0e34455d-4477-49b4-bf07-72ae695b81df', 'dd5c5f13-8db2-48d7-afe4-3f4cc7cf079a', '0102000020E6100000040000001B2FDD2406595340D7A3703D0A9729407D3F355EBA595340CFF753E3A59B2940C3F5285C8F5A534039B4C876BE9F294008AC1C5A645B53403108AC1C5AA42940', 0, 3.8, 'Karnataka', 'Ramanagara', NULL, '{2000201}', 4947.98520084008, 1, true, '2026-10-13 10:15:39.43841+00', '2026-10-13 10:15:39.43841+00');
INSERT INTO public.road_segments VALUES ('b8ddc92a-5bea-49f2-9234-3374cc3ad6de', '9b2ff597-363a-4af2-a317-4a039c6f3548', '0102000020E6100000020000000000000000605340CDCCCCCCCCCC2940713D0AD7A360534052B81E85EBD12940', 0.0, 1.0, 'Karnataka', 'Bengaluru Urban', NULL, '{99999011}', 1250, 2, true, '2026-10-13 10:16:45.023898+00', '2026-10-13 10:16:45.023898+00');
INSERT INTO public.road_segments VALUES ('82877862-c5e2-49c3-9868-fb42cf8dd33c', '9b2ff597-363a-4af2-a317-4a039c6f3548', '0102000020E610000002000000713D0AD7A360534052B81E85EBD12940E17A14AE47615340D7A3703D0AD72940', 1.0, 2.0, 'Karnataka', 'Bengaluru Urban', NULL, '{99999012}', 1250, 2, true, '2026-10-13 10:16:45.025966+00', '2026-10-13 10:16:45.025966+00');
INSERT INTO public.road_segments VALUES ('4cd1dd2c-363d-48c1-98aa-37a8e8ea2fb7', '9b2ff597-363a-4af2-a317-4a039c6f3548', '0102000020E6100000020000000000000000605340CDCCCCCCCCCC2940E17A14AE47615340D7A3703D0AD72940', 0.0, 2.0, 'Karnataka', 'Bengaluru Urban', NULL, '{9999901}', 2500, 1, false, '2026-10-13 10:16:45.011337+00', '2026-10-13 10:16:45.028696+00');


--
-- Data for Name: road_segment_lineage; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.road_segment_lineage VALUES ('cc7ae54b-95dc-4423-b5aa-5fa775ee4075', 'e299413e-ffdd-4f6c-9fa9-30134d34fe3a', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.39855+00');
INSERT INTO public.road_segment_lineage VALUES ('ab734c1c-8ddc-4ecc-b54a-a545bffeac6a', 'c2febf82-3287-4fe1-b98e-b677869c8069', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.404543+00');
INSERT INTO public.road_segment_lineage VALUES ('0a4e1bdf-d7e9-430f-babc-7ae7d6c237ad', '2e097864-fbea-430e-9cca-4eaa24ea7f2c', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.411197+00');
INSERT INTO public.road_segment_lineage VALUES ('eb3d3df0-3baa-4c23-8d22-bdc1bea1cfbb', '7491aa37-82f5-4b31-b8ce-ec500350e380', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.419408+00');
INSERT INTO public.road_segment_lineage VALUES ('17a4f31d-4e74-4dd4-bda1-59f03e508030', '2c76a15d-e8a7-47ec-803c-75b7edc6c1e4', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.425982+00');
INSERT INTO public.road_segment_lineage VALUES ('3704f304-c5d3-4b67-8f67-39fa85c4e417', '9767dc92-7d32-4daa-a906-6b087f7df75d', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.43373+00');
INSERT INTO public.road_segment_lineage VALUES ('4c784f62-4efe-4c02-a936-8b40414fdda6', '0e34455d-4477-49b4-bf07-72ae695b81df', NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10', '2026-10-13 10:15:39.440132+00');
INSERT INTO public.road_segment_lineage VALUES ('10ba93e1-918f-4cf5-a8ac-6e29ef70d846', '4cd1dd2c-363d-48c1-98aa-37a8e8ea2fb7', NULL, 'initial', 'Initial way import', 'v1.0', '2026-10-13 10:16:45.015976+00');
INSERT INTO public.road_segment_lineage VALUES ('21b7db33-8116-40d1-8147-3d022ef22713', 'b8ddc92a-5bea-49f2-9234-3374cc3ad6de', '4cd1dd2c-363d-48c1-98aa-37a8e8ea2fb7', 'split', 'Way split into two segments in upstream OSM extract', 'v2.0', '2026-10-13 10:16:45.032213+00');
INSERT INTO public.road_segment_lineage VALUES ('3340b5b0-c3a9-426e-a5fb-89aabb0b77be', '82877862-c5e2-49c3-9868-fb42cf8dd33c', '4cd1dd2c-363d-48c1-98aa-37a8e8ea2fb7', 'split', 'Way split into two segments in upstream OSM extract', 'v2.0', '2026-10-13 10:16:45.032213+00');


--
-- Data for Name: works; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.works VALUES ('c77b53e3-feee-4a6c-822b-4cad2988a496', 'Bruhat Bengaluru Mahanagara Palike (BBMP)', 'BBMP/2025-26/RD/WORK_INDENT_5401', 'BBMP/EE/TEC/2025/AGR-882', 'Asphalting and Stormwater Drain Rehabilitation of Outer Ring Road Silk Board to Marathahalli', 'drainage_and_asphalting', 'in_progress', '2025-11-01', '2027-03-31', NULL, 485000000, NULL, '1dd6b8ef-5678-406a-9527-d6b60acdbba1', '2026-10-13 10:24:05.230468+00');
INSERT INTO public.works VALUES ('cd857e8c-57ec-429b-b99d-a29bd7796d68', 'National Highways Authority of India (NHAI)', '2024_NHAI_189201_1', 'NHAI/PIU-BNG/NH-44/2024/CW-04', 'Pavement Resurfacing and Periodic Maintenance of NH-44 Chainage 12.0 km to 15.5 km', 'resurfacing', 'maintenance', '2024-04-01', '2026-08-15', '2026-08-30', 284500000, '2029-08-30', 'bda09da9-eb28-4e09-a3eb-1a0c5888eaaf', '2026-10-13 10:24:05.203242+00');
INSERT INTO public.works VALUES ('c1679c0d-23b3-4768-89f5-cfd14817eadf', 'National Highways Authority of India (NHAI)', 'TENDER-LOOP-1791888710468', 'CONT-LOOP-1791888710468', 'Four-laning & Periodic Renewal Section KA-Loop-99', 'periodic_renewal', 'officially_completed', '2025-01-01', '2025-12-31', '2026-01-15', 450000000, '2029-01-15', '3113fa29-d0f7-497e-a7c3-c1a1f02511dd', '2026-10-13 10:51:50.491731+00');


--
-- Data for Name: work_contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.work_contractors VALUES ('c77b53e3-feee-4a6c-822b-4cad2988a496', '4afeb59a-b64a-4d30-beec-1db0b6ab20e1', 'primary_contractor', 'verified_contract', '1dd6b8ef-5678-406a-9527-d6b60acdbba1');
INSERT INTO public.work_contractors VALUES ('cd857e8c-57ec-429b-b99d-a29bd7796d68', '8c539ab9-fef1-41ca-bcfe-285643937019', 'primary_contractor', 'verified_contract', 'bef108a8-b742-43bd-ac63-7cadf5120d46');
INSERT INTO public.work_contractors VALUES ('c1679c0d-23b3-4768-89f5-cfd14817eadf', '8c539ab9-fef1-41ca-bcfe-285643937019', 'primary_contractor', 'verified_contract', '3113fa29-d0f7-497e-a7c3-c1a1f02511dd');


--
-- Data for Name: work_segments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.work_segments VALUES ('cd857e8c-57ec-429b-b99d-a29bd7796d68', '2e097864-fbea-430e-9cca-4eaa24ea7f2c', 12, 15.5);
INSERT INTO public.work_segments VALUES ('c77b53e3-feee-4a6c-822b-4cad2988a496', 'e299413e-ffdd-4f6c-9fa9-30134d34fe3a', 0, 2.5);
INSERT INTO public.work_segments VALUES ('c77b53e3-feee-4a6c-822b-4cad2988a496', 'c2febf82-3287-4fe1-b98e-b677869c8069', 0, 2.5);
INSERT INTO public.work_segments VALUES ('c1679c0d-23b3-4768-89f5-cfd14817eadf', 'e299413e-ffdd-4f6c-9fa9-30134d34fe3a', 10, 15);
INSERT INTO public.work_segments VALUES ('c1679c0d-23b3-4768-89f5-cfd14817eadf', 'c2febf82-3287-4fe1-b98e-b677869c8069', 10, 15);


--
-- PostgreSQL database dump complete
--


