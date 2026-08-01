-- ─────────────────────────────────────────────────────────────────────────────
-- 050 — Vehicle seed data (generated from Vehicle Maintenance & Fuel Usage.xlsx
-- via scripts/import-vehicle-workbook.mjs). Idempotent: every INSERT is guarded
-- so re-running this migration is a no-op once the data exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CX-5 ──────────────────────────────────────────────────
WITH v AS (
  INSERT INTO veh_vehicles (name, make, model, model_year, active)
  SELECT 'CX-5', 'Mazda', 'CX-5', 2016, true
  WHERE NOT EXISTS (SELECT 1 FROM veh_vehicles WHERE name = 'CX-5')
  RETURNING id
)
INSERT INTO veh_fuel_logs (vehicle_id, fill_date, odometer, gallons, total_cost)
SELECT v.id, x.fill_date::date, x.odometer::numeric, x.gallons::numeric, x.total_cost::numeric FROM v, (VALUES
  ('2024-01-05', 64049, 12.145, 41.28),
  ('2024-01-08', 64394, 13.588, 45.78),
  ('2024-01-12', 64745, 13.497, 44.53),
  ('2024-01-15', 65106, 12.95, 42.72),
  ('2024-01-18', 65467, 12.657, 40.49),
  ('2024-01-21', 65792, 12.485, 37.57),
  ('2024-01-25', 66102, 11.585, 38.23),
  ('2024-01-28', 66455, 12.549, 41.4),
  ('2024-01-31', 66741, 11.14, 36.75),
  ('2024-02-03', 67076, 12.596, 41.81),
  ('2024-02-08', 67421, 13.461, 45.08),
  ('2024-02-13', 67786, 13.236, 44.48),
  ('2024-02-16', 68099, 12.08, 35.02),
  ('2024-02-19', 68378, 10.493, 36.3),
  ('2024-02-23', 68724, 12.695, 43.15),
  ('2024-02-27', 69000, 11.075, 38.31),
  ('2024-03-02', 69322, 12.443, 43.04),
  ('2024-03-08', 69685, 13.898, 45.57),
  ('2024-03-11', 70008, 10.89, 34.84),
  ('2024-03-15', 70345, 12.727, 41.99),
  ('2024-03-20', 70688, 12.858, 43.32),
  ('2024-03-27', 71030, 12.777, 44.71),
  ('2024-04-01', 71314, 11.331, 37.38),
  ('2024-04-05', 71639, 12.702, 45.71),
  ('2024-04-07', 71983, 12, 39.26),
  ('2024-04-09', 72334, 11.955, 42.67),
  ('2024-04-13', 72670, 12.485, 43.44),
  ('2024-04-16', 72938, 10.37, 36.08),
  ('2024-04-20', 73295, 12.793, 48.09),
  ('2024-04-23', 73618, 11.447, 42.34),
  ('2024-04-27', 74010, 13.265, 47.74),
  ('2024-04-30', 74371, 12.646, 46.75),
  ('2024-05-03', 74697, 11.302, 41.81),
  ('2024-05-06', 75045, 12.22, 44.47),
  ('2024-05-09', 75403, 12.919, 47.53),
  ('2024-05-13', 75770, 12.398, 45.24),
  ('2024-05-16', 76165, 12.478, 45.66),
  ('2024-05-20', 76533, 13.1, 47.15),
  ('2024-05-24', 76913, 13.132, 47.26),
  ('2024-05-27', 77264, 12.843, 46.35),
  ('2024-05-30', 77659, 13.487, 48),
  ('2024-06-02', 78028, 12.868, 45.79),
  ('2024-06-04', 78422, 13.197, 45.12),
  ('2024-06-07', 78766, 12.246, 41.13),
  ('2024-06-09', 79124, 12.462, 43.6),
  ('2024-06-11', 79525, 13.197, 44.33),
  ('2024-06-13', 79877, 11.491, 37.91),
  ('2024-06-15', 80256, 12.784, 44.71),
  ('2024-06-19', 80618, 12.797, 44.01),
  ('2024-06-21', 80974, 11.645, 40.05),
  ('2024-06-22', 81253, 10.75, 36.97),
  ('2024-07-02', 81516, 9.951, 34.82),
  ('2024-07-04', 81866, 12.899, 45.13),
  ('2024-07-05', 82215, 12.858, 43.19),
  ('2024-07-09', 82502, 10.026, 35.08),
  ('2024-07-12', 82851, 12.608, 46.64),
  ('2024-07-17', 83189, 12.519, 45.06),
  ('2024-07-19', 83470, 9.331, 33.58),
  ('2024-07-20', 83861, 13.027, 46.08),
  ('2024-07-24', 84189, 12.721, 45.53),
  ('2024-07-26', 84552, 11.891, 41.49),
  ('2024-07-29', 84894, 13.288, 48.22),
  ('2024-08-01', 85228, 12.037, 43.08),
  ('2024-08-04', 85552, 12.963, 44.84),
  ('2024-08-09', 85886, 12.82, 45.63),
  ('2024-08-11', 86209, 12.238, 43.56),
  ('2024-08-13', 86550, 12.375, 43.8),
  ('2024-08-15', 86887, 12.35, 43.7),
  ('2024-08-17', 87192, 10.57, 37.41),
  ('2024-08-20', 87565, 13.61, 47.62),
  ('2024-08-23', 87897, 11.77, 41.18),
  ('2024-08-25', 88268, 13.65, 47.77),
  ('2024-08-27', 88649, 13.4, 45.28),
  ('2024-08-29', 88881, 8.64, 29.35),
  ('2024-08-30', 89091, 7.93, 27.97),
  ('2024-09-02', 89376, 9.79, 33.28),
  ('2024-09-06', 89611, 9.39, 31.93),
  ('2024-09-08', 90001, 13.79, 46.89),
  ('2024-09-11', 90377, 12.42, 40.48),
  ('2024-09-14', 90706, 12.21, 41.03),
  ('2024-09-15', 91029, 12.281, 41.14),
  ('2024-09-20', 91280, 9.36, 30.7),
  ('2024-09-23', 91619, 13.31, 43.12),
  ('2024-09-25', 91920, 10.38, 34.02),
  ('2024-09-30', 92238, 12.1, 38.99),
  ('2024-10-05', 92537, 10.89, 34.4),
  ('2024-10-06', 92907, 13.43, 42.41),
  ('2024-10-11', 93231, 11.91, 38.08),
  ('2024-10-14', 93538, 12.84, 40.18),
  ('2024-10-18', 93915, 12.45, 37.7),
  ('2024-10-21', 94218, 13.04, 40.68),
  ('2024-10-24', 94627, 12.89, 39.96),
  ('2024-10-29', 94972, 12.6, 38.54),
  ('2024-11-01', 95342, 13.47, 43.1),
  ('2024-11-03', 95712, 13.15, 40.74),
  ('2024-11-05', 96051, 12.65, 38.45),
  ('2024-11-12', 96381, 12.6, 37.78),
  ('2024-11-17', 96736, 14.14, 44.38),
  ('2024-11-24', 97113, 13.94, 43.75),
  ('2024-11-29', 97455, 13.36, 40.33),
  ('2024-12-04', 97782, 13.09, 40.55),
  ('2024-12-12', 98119, 13.37, 42.21),
  ('2024-12-21', 98428, 13.5, 44.54),
  ('2024-12-27', 98722, 12.47, 39.14),
  ('2025-01-05', 98996, 12.75, 40.28),
  ('2025-01-11', 99316, 12.79, 40.4),
  ('2025-01-13', 99669, 13.35, 41.38),
  ('2025-01-19', 100018, 13.33, 43.43),
  ('2025-01-23', 100340, 13.44, 43.79),
  ('2025-01-28', 100666, 12.21, 38.7),
  ('2025-02-05', 100938, 10.95, 35.69),
  ('2025-02-10', 101269, 12.75, 40.02),
  ('2025-02-17', 101596, 13.2, 42.24),
  ('2025-02-21', 101945, 13.69, 43.81),
  ('2025-02-23', 102246, 11.91, 38.08),
  ('2025-02-26', 102611, 13.7, 43.82),
  ('2025-03-01', 102950, 12.62, 39.87),
  ('2025-03-07', 103311, 13.078, 41.84),
  ('2025-03-10', 103623, 12.28, 38.43),
  ('2025-03-16', 103941, 11.57, 37.01),
  ('2025-03-18', 104236, 10.62, 33.97),
  ('2025-03-21', 104588, 12.8, 37.63),
  ('2025-03-24', 104904, 11.95, 31.66),
  ('2025-04-01', 105257, 14.01, 44.27),
  ('2025-04-05', 105558, 10.79, 34.53),
  ('2025-04-08', 105884, 11.94, 36.53),
  ('2025-04-11', 106228, 12.98, 39.97),
  ('2025-04-16', 106550, 11.77, 33.65),
  ('2025-04-21', 106941, 12.88, 40.09),
  ('2025-04-26', 107332, 13.53, 40.02),
  ('2025-04-28', 107657, 11.54, 33.46),
  ('2025-04-30', 108063, 12.83, 39.49),
  ('2025-05-04', 108446, 12.593, 37.93),
  ('2025-05-06', 108829, 13.3, 40.98),
  ('2025-05-10', 109203, 12.51, 37.53),
  ('2025-05-13', 109600, 12.82, 37.67),
  ('2025-05-17', 109967, 12.04, 36.84),
  ('2025-05-21', 110343, 12.42, 37.87),
  ('2025-05-25', 110716, 13.49, 41.27),
  ('2025-05-28', 111073, 11.69, 35.76),
  ('2025-05-31', 111462, 12.65, 38.93),
  ('2025-06-03', 111879, 13.78, 40.92),
  ('2025-06-07', 112240, 13.46, 41.17),
  ('2025-06-10', 112624, 13.57, 37.99),
  ('2025-06-15', 113013, 12.76, 40.82),
  ('2025-06-21', 113416, 13.99, 44.18),
  ('2025-06-23', 113783, 11.88, 37.17),
  ('2025-06-25', 114115, 11.48, 36.72),
  ('2025-06-28', 114493, 12.23, 37.89),
  ('2025-07-01', 114842, 13.37, 41.43),
  ('2025-07-03', 115168, 11.06, 33.82),
  ('2025-07-07', 115528, 12.69, 38.06),
  ('2025-07-18', 115787, 10.09, 30.97),
  ('2025-07-21', 116203, 12.89, 38.66),
  ('2025-07-25', 116568, 12.9, 40.89),
  ('2025-07-28', 116932, 13.1, 40.59),
  ('2025-08-01', 117314, 13.53, 42.87),
  ('2025-08-06', 117662, 12.07, 37.76),
  ('2025-08-10', 118025, 12.12, 37.55),
  ('2025-08-12', 118414, 13.27, 39.12),
  ('2025-08-15', 118798, 12.99, 40.24),
  ('2025-08-17', 119107, 11.32, 35.09),
  ('2025-08-19', 119446, 12, 37.18),
  ('2025-08-22', 119844, 12.39, 40.38),
  ('2025-08-25', 120119, 10.62, 32.92),
  ('2025-08-28', 120499, 11.81, 36.94),
  ('2025-08-29', 120879, 12.69, 39.33),
  ('2025-09-02', 121261, 12.84, 40.55),
  ('2025-09-05', 121524, 8.81, 28.7),
  ('2025-09-06', 121811, 11.35, 37.24),
  ('2025-09-09', 122182, 12.67, 40.92),
  ('2025-09-12', 122604, 13, 42.09),
  ('2025-09-15', 122946, 11.47, 36.46),
  ('2025-09-18', 123318, 12.2, 39.04),
  ('2025-09-21', 123690, 12.99, 40.14),
  ('2025-09-25', 124095, 14.07, 44.46),
  ('2025-09-27', 124490, 12.81, 39.7),
  ('2025-10-01', 124822, 10.75, 33.32),
  ('2025-10-03', 125182, 11.92, 36.83),
  ('2025-10-07', 125547, 12.66, 39.1),
  ('2025-10-13', 125856, 11.61, 34.83),
  ('2025-10-20', 126253, 13.19, 39.82),
  ('2025-10-27', 126657, 13.92, 41.09),
  ('2025-10-29', 127073, 13.22, 40.96),
  ('2025-11-02', 127465, 13.27, 39.8),
  ('2025-11-07', 127785, 12.19, 37.53),
  ('2025-11-11', 128134, 11.39, 34.14),
  ('2025-11-16', 128487, 13.09, 39.26),
  ('2025-11-20', 128868, 13.58, 40.45),
  ('2025-11-25', 129241, 13.23, 39.42),
  ('2025-11-29', 129519, 9.34, 28.57),
  ('2025-12-02', 129871, 13.24, 40.49),
  ('2025-12-06', 130179, 12.05, 36.88),
  ('2025-12-08', 130564, 12.95, 38.83),
  ('2025-12-09', 130934, 13.23, 42.32),
  ('2025-12-13', 131286, 12.99, 38.97),
  ('2025-12-14', 131605, 10.3, 30.9),
  ('2025-12-19', 131916, 12.35, 36.54),
  ('2025-12-21', 132255, 12.28, 36.33),
  ('2025-12-26', 132628, 13.24, 40.5),
  ('2025-12-31', 132980, 3.44, 10.32),
  ('2026-01-02', 133053, 12.05, 36.14),
  ('2026-01-06', 133416, 13.15, 39.43),
  ('2026-01-16', 133774, 13.87, 38.12),
  ('2026-01-19', 134109, 11.75, 34.53),
  ('2026-01-24', 134398, 12.24, 33.7),
  ('2026-01-28', 134721, 13.31, 35.8),
  ('2026-02-01', 135070, 13.62, 38.94),
  ('2026-02-09', 135351, 10.81, 31.43),
  ('2026-02-14', 135709, 13.34, 37.07),
  ('2026-02-18', 136066, 11.9, 31.99),
  ('2026-02-22', 136414, 12.91, 25.5),
  ('2026-02-28', 136739, 12.78, 38.33),
  ('2026-03-05', 137093, 14.04, 45.77),
  ('2026-03-12', 137507, 14.17, 49.57),
  ('2026-03-17', 137865, 12.4, 47.85),
  ('2026-03-21', 138124, 9.3, 35.31),
  ('2026-03-22', 138411, 10.88, 43.52),
  ('2026-03-23', 138694, 12.35, 45.68),
  ('2026-03-27', 139091, 13.52, 51.39),
  ('2026-04-07', 139392, 11.6, 45.23),
  ('2026-04-18', 139758, 12.95, 55.66),
  ('2026-04-23', 140103, 12.12, 47.26),
  ('2026-05-01', 140483, 13.45, 61.3)
) AS x(fill_date, odometer, gallons, total_cost)
WHERE NOT EXISTS (SELECT 1 FROM veh_fuel_logs fl JOIN veh_vehicles vv ON vv.id = fl.vehicle_id WHERE vv.name = 'CX-5');

INSERT INTO veh_service_plan (vehicle_id, service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)
SELECT v.id, x.service, x.interval_months::int, x.interval_miles::int, x.avg_cost::numeric, x.last_completed_date::date, x.last_odometer::numeric, x.sort_order::int
FROM (SELECT id FROM veh_vehicles WHERE name = 'CX-5') v, (VALUES
  ('Replace Spark Plugs', NULL, 100000, NULL, NULL, NULL, 0),
  ('Mile Service', NULL, 10334, 250.2, '2025-03-28', 105024, 1),
  ('Replace Antifreeze/Coolant', 120, 120000, NULL, NULL, NULL, 2),
  ('Wheel Alignment', 12, 15000, 66.316667, '2025-03-28', 105024, 3),
  ('Inspect Brake Fluid', 6, 5000, 0, '2025-07-03', 115099, 4),
  ('Inspect Brakes', 6, 5000, 5.07, '2025-07-03', 115099, 5),
  ('Tire Rotation', NULL, 6000, 0, '2025-07-03', 115099, 6),
  ('Inspect Drive Belts', 24, 20000, 0, '2025-03-28', 105024, 7),
  ('(Re)Balance Tires', 12, 12000, 66.655, '2025-07-03', 115099, 8),
  ('Replace Brake Pads', NULL, 23109, 106.355, '2025-05-26', 110795, 9),
  ('Replace Cabin Air Filter', 24, 30000, 59.925, '2025-03-28', 105024, 10),
  ('Replace Engine Air Filter', 36, 30000, 12.11, '2025-03-28', 105024, 11),
  ('Shop Supplies, Taxes, & Misc.', NULL, 6416, 37.600667, '2025-12-13', 131294, 12),
  ('Labor', NULL, 6910, 137.293571, '2025-12-13', 131294, 13),
  ('Oil Change/Oil Filter', 12, 7500, 52.95, '2025-12-13', 131294, 14),
  ('Replace Brake Rotors', NULL, 70000, 242.153333, '2024-06-10', 79325, 15),
  ('State Inspection', 12, NULL, 18.575, '2025-07-03', 115099, 16),
  ('Registration', 12, NULL, 172.69, '2025-12-11', 131110, 17),
  ('General Repair', NULL, NULL, 91.092, '2025-10-09', 125650, 18),
  ('New Tires Purchased & Mounted', NULL, NULL, 522.646667, '2024-07-26', 84355, 19)
) AS x(service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM veh_service_plan sp JOIN veh_vehicles vv ON vv.id = sp.vehicle_id WHERE vv.name = 'CX-5');

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-12-16', 27521, 'New Tires Purchased & Mounted, Wheel Alignment', 449.35
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2020-12-16' AND sv.odometer = 27521
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('New Tires Purchased & Mounted', 390.35, 'New Tires Purchased & Mounted', 0),
  ('Wheel Alignment', 59, '2 Wheels', 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-10-14', 41467, 'Replace Brake Rotors, Labor, Replace Brake Pads', 555.84
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2021-10-14' AND sv.odometer = 41467
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0),
  ('Inspect Brake Fluid', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('Replace Brake Pads', 67.04, 'Rear Brakes', 3),
  ('Replace Brake Rotors', 246.66, 'Rear Brakes', 4),
  ('Labor', 202.88, NULL, 5),
  ('Shop Supplies, Taxes, & Misc.', 39.26, NULL, 6)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-03-09', 45476, 'New Tires Purchased & Mounted, Labor, Replace Brake Rotors', 2091.95
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2022-03-09' AND sv.odometer = 45476
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0),
  ('Inspect Brake Fluid', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('State Inspection', 18.5, NULL, 3),
  ('New Tires Purchased & Mounted', 1088.79, '4 Tires', 4),
  ('Replace Brake Pads', 89.95, 'Front Brakes', 5),
  ('Replace Brake Rotors', 239.9, 'Front Brakes', 6),
  ('General Repair', 32.37, 'Rear Wiper Blade Replacement', 7),
  ('Labor', 444.13, NULL, 8),
  ('Shop Supplies, Taxes, & Misc.', 178.31, NULL, 9)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-03-16', 54408, 'Wheel Alignment, Replace Cabin Air Filter, Oil Change/Oil Filter', 346.23
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2023-03-16' AND sv.odometer = 54408
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0),
  ('Inspect Brake Fluid', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('Tire Rotation', 0, 'Included for life of Tires', 3),
  ('Wheel Alignment', 139.95, NULL, 4),
  ('State Inspection', 18.5, NULL, 5),
  ('Replace Cabin Air Filter', 79.9, NULL, 6),
  ('Oil Change/Oil Filter', 50.95, NULL, 7),
  ('Labor', 32, NULL, 8),
  ('Shop Supplies, Taxes, & Misc.', 24.93, NULL, 9)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-09-01', NULL, 'Registration', 0
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2023-09-01' AND sv.odometer = NULL
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', NULL, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-02-08', 67538, 'Labor, Oil Change/Oil Filter, Shop Supplies, Taxes, & Misc.', 129.23
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-02-08' AND sv.odometer = 67538
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brake Fluid', 0, NULL, 0),
  ('Inspect Brakes', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('Tire Rotation', 0, NULL, 3),
  ('Inspect Brakes', 0, NULL, 4),
  ('Oil Change/Oil Filter', 50.95, NULL, 5),
  ('Labor', 67, NULL, 6),
  ('Shop Supplies, Taxes, & Misc.', 11.28, NULL, 7)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-05-31', 77669, '(Re)Balance Tires, Oil Change/Oil Filter, Labor', 208.6
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-05-31' AND sv.odometer = 77669
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0),
  ('Inspect Brake Fluid', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('(Re)Balance Tires', 79.96, NULL, 3),
  ('Tire Rotation', 0, NULL, 4),
  ('Oil Change/Oil Filter', 50.95, NULL, 5),
  ('State Inspection', 18.5, NULL, 6),
  ('Labor', 38.55, NULL, 7),
  ('Shop Supplies, Taxes, & Misc.', 20.64, NULL, 8)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-06-10', 79325, 'Labor, Replace Brake Rotors, Shop Supplies, Taxes, & Misc.', 771.2
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-06-10' AND sv.odometer = 79325
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Brake Pads', 80.78, 'Rear Brakes', 0),
  ('Replace Brake Rotors', 239.9, 'Rear Brakes', 1),
  ('Replace Cabin Air Filter', 39.95, NULL, 2),
  ('Labor', 314.95, NULL, 3),
  ('Shop Supplies, Taxes, & Misc.', 95.62, NULL, 4)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-06-14', 79900, 'Replace Engine Air Filter', 12.11
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-06-14' AND sv.odometer = 79900
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Engine Air Filter', 12.11, 'Purchased through Amazon', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-07-26', 84355, 'Mile Service, New Tires Purchased & Mounted, Shop Supplies, Taxes, & Misc.', 508.29
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-07-26' AND sv.odometer = 84355
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0),
  ('Inspect Brake Fluid', 0, NULL, 1),
  ('Inspect Drive Belts', 0, NULL, 2),
  ('Tire Rotation', 0, 'Reset for the new tire install.', 3),
  ('Oil Change/Oil Filter', 50.95, NULL, 4),
  ('New Tires Purchased & Mounted', 88.8, NULL, 5),
  ('Wheel Alignment', 0, 'Completed with 15k Service', 6),
  ('Mile Service', 234.1, '15k Service', 7),
  ('Labor', 49, NULL, 8),
  ('Shop Supplies, Taxes, & Misc.', 85.44, NULL, 9)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-09-07', 89765, 'Inspect Brakes, Shop Supplies, Taxes, & Misc., Tire Rotation', 60.53
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-09-07' AND sv.odometer = 89765
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 50.7, NULL, 0),
  ('Tire Rotation', 0, NULL, 1),
  ('Shop Supplies, Taxes, & Misc.', 9.83, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-10-07', 92918, 'Mile Service, Oil Change/Oil Filter, Shop Supplies, Taxes, & Misc.', 129.23
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-10-07' AND sv.odometer = 92918
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 50.95, NULL, 0),
  ('Mile Service', 67, '5k Service', 1),
  ('Inspect Brake Fluid', 0, NULL, 2),
  ('Labor', 0, NULL, 3),
  ('Shop Supplies, Taxes, & Misc.', 11.28, NULL, 4)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-10-29', 94972, 'Registration', 172.69
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2024-10-29' AND sv.odometer = 94972
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 172.69, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-02-22', 102158, 'Oil Change/Oil Filter, Labor, Shop Supplies, Taxes, & Misc.', 74.27
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-02-22' AND sv.odometer = 102158
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 55.45, NULL, 0),
  ('General Repair', 3.5, 'Washer Fluid', 1),
  ('Labor', 10.5, NULL, 2),
  ('Shop Supplies, Taxes, & Misc.', 4.82, NULL, 3)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-03-28', 105024, 'Labor, Mile Service, General Repair', 1409.77
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-03-28' AND sv.odometer = 105024
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Mile Service', 449.5, '30k Service', 0),
  ('Wheel Alignment', NULL, '30k Service', 1),
  ('Tire Rotation', NULL, '30k Service', 2),
  ('Replace Engine Air Filter', NULL, '30k Service', 3),
  ('Inspect Brake Fluid', NULL, '30k Service', 4),
  ('Inspect Brakes', NULL, '30k Service', 5),
  ('Replace Cabin Air Filter', NULL, '30k Service', 6),
  ('Inspect Drive Belts', NULL, '30k Service', 7),
  ('General Repair', 51.58, 'Replaced Outer Tire Rod End Set', 8),
  ('General Repair', 120.61, 'Replaced 2 Drive Belts', 9),
  ('Labor', 729.6, NULL, 10),
  ('Shop Supplies, Taxes, & Misc.', 58.48, NULL, 11)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-05-26', 110795, 'Replace Brake Pads', 187.65
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-05-26' AND sv.odometer = 110795
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Brake Pads', 187.65, '(Replaced 4x pads w/Eric) Pads & Supplies', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-05-30', 111382, 'Inspect Brakes', 0
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-05-30' AND sv.odometer = 111382
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-06-14', 112983, 'Oil Change/Oil Filter, Labor, Shop Supplies, Taxes, & Misc.', 69
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-06-14' AND sv.odometer = 112983
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 55.45, NULL, 0),
  ('Shop Supplies, Taxes, & Misc.', 3.05, NULL, 1),
  ('Labor', 10.5, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-07-03', 115099, '(Re)Balance Tires, State Inspection, Shop Supplies, Taxes, & Misc.', 83.96
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-07-03' AND sv.odometer = 115099
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('(Re)Balance Tires', 53.35, NULL, 0),
  ('Tire Rotation', 0, NULL, 1),
  ('State Inspection', 18.8, NULL, 2),
  ('Shop Supplies, Taxes, & Misc.', 11.81, NULL, 3),
  ('Labor', 0, 'Included with the Tire rebalancing.', 4),
  ('Inspect Brake Fluid', 0, NULL, 5),
  ('Inspect Brakes', 0, NULL, 6)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-08-29', 120700, 'Oil Change/Oil Filter, Labor, Shop Supplies, Taxes, & Misc.', 71.58
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-08-29' AND sv.odometer = 120700
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 55.45, NULL, 0),
  ('Shop Supplies, Taxes, & Misc.', 4.63, NULL, 1),
  ('Labor', 11.5, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-10-09', 125650, 'General Repair', 247.4
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-10-09' AND sv.odometer = 125650
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 247.4, 'Replaced vehicle battery', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-12-11', 131110, 'Registration', 172.69
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-12-11' AND sv.odometer = 131110
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 172.69, 'Used Affirm to Register', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2025-12-13', 131294, 'Oil Change/Oil Filter, Labor, Shop Supplies, Taxes, & Misc.', 71.58
  FROM veh_vehicles WHERE name = 'CX-5'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'CX-5' AND sv.service_date = '2025-12-13' AND sv.odometer = 131294
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 55.45, NULL, 0),
  ('Shop Supplies, Taxes, & Misc.', 4.63, NULL, 1),
  ('Labor', 11.5, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

-- ── Versa ──────────────────────────────────────────────────
WITH v AS (
  INSERT INTO veh_vehicles (name, make, model, model_year, active)
  SELECT 'Versa', 'Nissan', 'Versa', 2015, true
  WHERE NOT EXISTS (SELECT 1 FROM veh_vehicles WHERE name = 'Versa')
  RETURNING id
)
INSERT INTO veh_fuel_logs (vehicle_id, fill_date, odometer, gallons, total_cost)
SELECT v.id, x.fill_date::date, x.odometer::numeric, x.gallons::numeric, x.total_cost::numeric FROM v, (VALUES
  ('2021-01-02', 101998, 8.86, 21.26),
  ('2021-01-10', 102280, 8.904, 22.25),
  ('2021-01-23', 102576, 9.003, 22.14),
  ('2021-02-01', 102860, 8.664, 21.65),
  ('2021-02-05', 103148, 9.339, 21.94),
  ('2021-02-11', 103431, 9.199, 24.37),
  ('2021-02-20', 103713, 8.643, 22.9),
  ('2021-02-27', 103995, 8.498, 22.08),
  ('2021-03-06', 104289, 9.1875, 23.69),
  ('2021-03-13', 104583, 9.346, 26.72),
  ('2021-03-20', 104899, 9.268, 25.01),
  ('2021-03-27', 105199, 8.747, 23.61),
  ('2021-04-03', 105501, 8.83, 24.19),
  ('2021-04-09', 105821, 9.18, 25.69),
  ('2021-04-16', 106110, 8.577, 24.61),
  ('2021-04-25', 106426, 9.125, 26.45),
  ('2021-04-30', 106753, 9.407, 28.21),
  ('2021-05-05', 107094, 8.829, 26.11),
  ('2021-05-07', 107406, 8.53, 24.98),
  ('2021-05-09', 107742, 9.083, 24.7),
  ('2021-05-15', 108066, 9.551, 27.69),
  ('2021-05-22', 108417, 9.536, 26.69),
  ('2021-05-28', 108730, 9.383, 26.45),
  ('2021-06-03', 109063, 9.402, 26.88),
  ('2021-06-10', 109384, 9.47, 27.45),
  ('2021-06-14', 109691, 9.068, 27.69),
  ('2021-06-20', 109997, 9.093, 26.63),
  ('2021-06-26', 110260, 7.218, 23.45),
  ('2021-06-29', 110557, 8.845, 28.12),
  ('2021-07-10', 110872, 9.39, 29.1),
  ('2021-07-24', 111195, 8.812, 26.43),
  ('2021-08-01', 111534, 9.17, 28.97),
  ('2021-08-11', 111857, 9.612, 31.13),
  ('2021-08-14', 112177, 8.598, 26.6),
  ('2021-08-26', 112428, 7.626, 23.63),
  ('2021-08-27', 112651, 5.919, 19.41),
  ('2021-08-29', 112976, 9.14, 26.13),
  ('2021-09-06', 113275, 8.886, 27.54),
  ('2021-09-16', 113582, 9.081, 28.14),
  ('2021-09-25', 113917, 9.277, 28.76),
  ('2021-10-06', 114270, 9.491, 29.41),
  ('2021-10-17', 114600, 9.012, 29.28),
  ('2021-10-25', 114878, 8.341, 27.93),
  ('2021-11-05', 115117, 7.818, 26.73),
  ('2021-11-11', 115397, 8.393, 29.7),
  ('2021-11-15', 115682, 8.79, 31.2),
  ('2021-11-19', 115988, 9.304, 32.18),
  ('2021-11-21', 116297, 9.196, 31.26),
  ('2021-11-25', 116598, 8.977, 31.09),
  ('2021-11-29', 116897, 9.198, 31.82),
  ('2021-12-04', 117191, 8.624, 28.8),
  ('2021-12-07', 117507, 9.401, 32.52),
  ('2021-12-12', 117814, 9.34, 32.49),
  ('2021-12-18', 118114, 9.267, 32.05),
  ('2021-12-25', 118413, 9.167, 31.71),
  ('2022-01-01', 118674, 6.7, 26),
  ('2022-01-01', 118976, 8.838, 30.75),
  ('2022-01-10', 119254, 9.06, 32.34),
  ('2022-01-21', 119535, 9.454, 32.14),
  ('2022-02-06', 119800, 9.059, 30.79),
  ('2022-02-16', 120085, 8.798, 32.19),
  ('2022-02-27', 120364, 8.874, 33.71),
  ('2022-03-05', 120661, 9.196, 37.69),
  ('2022-03-14', 120964, 8.986, 37.73),
  ('2022-03-19', 121256, 9.003, 38.7),
  ('2022-03-25', 121584, 9.202, 37.72),
  ('2022-03-27', 121905, 9.093, 38.18),
  ('2022-04-02', 122211, 8.671, 35.89),
  ('2022-04-09', 122527, 8.769, 35.94),
  ('2022-04-22', 122841, 8.773, 35.08),
  ('2022-05-03', 123161, 9.037, 39.75),
  ('2022-05-07', 123468, 8.747, 38.92),
  ('2022-05-13', 123811, 9.002, 42.2),
  ('2022-05-19', 124158, 9.059, 43.84),
  ('2022-05-27', 124493, 9.269, 44.48),
  ('2022-06-03', 124844, 9.18, 44.79),
  ('2022-06-10', 125195, 9.137, 43.13),
  ('2022-06-12', 125572, 9.414, 46.22),
  ('2022-06-19', 125932, 9.605, 46.87),
  ('2022-06-25', 126252, 8.469, 42.76),
  ('2022-06-27', 126574, 9.318, 43.48),
  ('2022-07-02', 126930, 9.25, 45.5),
  ('2022-07-06', 127270, 9.315, 42.3),
  ('2022-07-09', 127622, 9.609, 43.62),
  ('2022-07-15', 127956, 9.17, 40.91),
  ('2022-07-18', 128311, 9.513, 42.81),
  ('2022-07-21', 128619, 8.835, 39.41),
  ('2022-07-24', 128954, 8.883, 39.08),
  ('2022-08-06', 129242, 8.972, 40.9),
  ('2022-08-10', 129583, 9.551, 36.2),
  ('2022-08-16', 129936, 9.156, 35.9),
  ('2022-08-19', 130267, 9.259, 35.75),
  ('2022-08-24', 130598, 9.3, 36.27),
  ('2022-08-29', 130950, 9.081, 34.41),
  ('2022-08-31', 131309, 9.606, 36.22),
  ('2022-09-03', 131651, 9.292, 32.06),
  ('2022-09-05', 131970, 9.07, 32.19),
  ('2022-09-08', 132297, 9.184, 33.9),
  ('2022-09-10', 132647, 9.112, 34.62),
  ('2022-09-12', 132940, 8.845, 33.6),
  ('2022-09-16', 133256, 9.312, 35.01),
  ('2022-09-19', 133599, 9.13, 32.86),
  ('2022-09-25', 133908, 9.103, 33.31),
  ('2022-09-27', 134234, 9.124, 30.56),
  ('2022-10-01', 134567, 9.127, 33.76),
  ('2022-10-05', 134878, 8.891, 29.86),
  ('2022-10-07', 135208, 9.219, 33.18),
  ('2022-10-09', 135551, 9.397, 35.7),
  ('2022-10-14', 135862, 8.717, 31.2),
  ('2022-11-04', 136145, 8.325, 34.12),
  ('2022-11-07', 136474, 9.104, 34.77),
  ('2022-11-11', 136782, 9.133, 33.8),
  ('2022-11-18', 137064, 9.135, 35.62),
  ('2022-11-20', 137383, 8.946, 33.99),
  ('2022-11-23', 137685, 8.862, 36.15),
  ('2022-11-26', 137989, 8.974, 35.89),
  ('2022-12-01', 138306, 9.304, 35.39),
  ('2022-12-04', 138605, 9.06, 35.32),
  ('2022-12-07', 138920, 9.147, 34.57),
  ('2022-12-11', 139218, 8.973, 32.47),
  ('2022-12-14', 139529, 9.282, 33.88),
  ('2022-12-15', 139809, 8.489, 28.61),
  ('2022-12-18', 140123, 9.413, 30.11),
  ('2022-12-20', 140449, 9.138, 33.35),
  ('2022-12-27', 140756, 9.339, 29.23),
  ('2022-12-30', 141079, 9.091, 28.73),
  ('2023-01-03', 141397, 9.268, 33.26),
  ('2023-01-05', 141700, 9.031, 29.52),
  ('2023-01-09', 142021, 9.205, 29.08),
  ('2023-01-12', 142325, 8.929, 26.58),
  ('2023-01-16', 142603, 8.677, 27.19),
  ('2023-01-21', 142893, 9.15, 29.83),
  ('2023-01-25', 143193, 9.114, 32.35),
  ('2023-01-28', 143504, 8.971, 30.32),
  ('2023-01-31', 143826, 8.918, 29.24),
  ('2023-02-07', 144109, 9.178, 31.57),
  ('2023-02-10', 144409, 8.782, 30.48),
  ('2023-02-12', 144724, 8.85, 30.7),
  ('2023-02-15', 145045, 9.106, 30.77),
  ('2023-02-20', 145373, 9.284, 31.56),
  ('2023-02-24', 145650, 9.09, 31.17),
  ('2023-02-28', 145948, 9.06, 28),
  ('2023-03-04', 146234, 8.607, 28.22),
  ('2023-03-09', 146551, 8.877, 28.94),
  ('2023-03-14', 146858, 9.035, 29.18),
  ('2023-03-17', 147187, 9.111, 30.64),
  ('2023-03-23', 147545, 9.545, 31.5),
  ('2023-03-26', 147845, 8.9, 28.66),
  ('2023-03-30', 148137, 8.609, 29.26),
  ('2023-04-01', 148445, 9.15, 28.08),
  ('2023-04-11', 148764, 9.173, 30.28),
  ('2023-04-15', 149120, 9.224, 32.05),
  ('2023-04-21', 149458, 9.012, 33.34),
  ('2023-04-26', 149792, 9.187, 33.06),
  ('2023-04-29', 150120, 9.085, 31.43),
  ('2023-05-03', 150435, 9.201, 28.94),
  ('2023-05-05', 150755, 9.019, 28.85),
  ('2023-05-10', 151116, 9.41, 30.32),
  ('2023-05-18', 151473, 9.1, 28.85),
  ('2023-05-22', 151799, 9.045, 28.94),
  ('2023-05-26', 152134, 9.134, 31.51),
  ('2023-06-01', 152459, 9.138, 31.98),
  ('2023-06-09', 152781, 9.214, 32.98),
  ('2023-06-20', 153119, 9.551, 35.04),
  ('2023-06-23', 153447, 9.295, 32.15),
  ('2023-07-05', 153753, 8.95, 32.75),
  ('2023-07-08', 154091, 9.349, 34.68),
  ('2023-07-11', 154406, 9.193, 32.35),
  ('2023-07-13', 154735, 9.072, 33.3),
  ('2023-07-15', 155044, 9.019, 33.36),
  ('2023-07-18', 155375, 9.664, 35.75),
  ('2023-07-22', 155712, 9.626, 30.22),
  ('2023-07-26', 156005, 8.47, 32.35),
  ('2023-07-30', 156299, 9.354, 36.11),
  ('2023-08-03', 156620, 9.245, 31.42),
  ('2023-08-06', 156931, 9.51, 34.89),
  ('2023-08-09', 157300, 9.472, 35.04),
  ('2023-08-16', 157634, 9.288, 36.03),
  ('2023-08-18', 157915, 9.198, 34.02),
  ('2023-08-22', 158209, 9.217, 34.48),
  ('2023-08-25', 158525, 9.307, 36.1),
  ('2023-08-27', 158813, 8.768, 34.62),
  ('2023-08-31', 159121, 9.352, 37.4),
  ('2023-09-02', 159446, 9.48, 36.39),
  ('2023-09-07', 159795, 9.23, 34.54),
  ('2023-09-10', 160085, 9.544, 36.64),
  ('2023-09-13', 160398, 9.423, 36.55),
  ('2023-09-19', 160725, 9.315, 35.95),
  ('2023-09-24', 161040, 9.146, 35.48),
  ('2023-09-28', 161361, 9.243, 33.54),
  ('2023-10-05', 161678, 9.435, 36.41),
  ('2023-10-10', 162001, 9.383, 36.21),
  ('2023-10-16', 162310, 9.643, 35.67),
  ('2023-10-20', 162632, 9.433, 35.84),
  ('2023-10-26', 162938, 9.31, 34.34),
  ('2023-10-29', 163263, 9.405, 33.57),
  ('2023-11-01', 163558, 9.017, 33.35),
  ('2023-11-06', 163876, 9.425, 33.54),
  ('2023-11-10', 164171, 9.2, 30.17),
  ('2023-11-12', 164491, 9.385, 34.72),
  ('2023-11-16', 164800, 9.247, 30.88),
  ('2023-11-20', 165115, 8.946, 29.51),
  ('2023-11-22', 165416, 9.234, 31.57),
  ('2023-11-25', 165724, 9.174, 30.82),
  ('2023-11-28', 166045, 9.055, 30.96)
) AS x(fill_date, odometer, gallons, total_cost)
WHERE NOT EXISTS (SELECT 1 FROM veh_fuel_logs fl JOIN veh_vehicles vv ON vv.id = fl.vehicle_id WHERE vv.name = 'Versa');

INSERT INTO veh_service_plan (vehicle_id, service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)
SELECT v.id, x.service, x.interval_months::int, x.interval_miles::int, x.avg_cost::numeric, x.last_completed_date::date, x.last_odometer::numeric, x.sort_order::int
FROM (SELECT id FROM veh_vehicles WHERE name = 'Versa') v, (VALUES
  ('Replace In-Cabin Air Filter', 54, 45000, 142.768333, '2021-04-06', 105672, 0),
  ('Wheel Alignment', 12, 5000, 99.786, '2023-07-28', 156147, 1),
  ('Tire Rotation', 6, 5000, 17.323529, '2023-07-28', 156147, 2),
  ('(Re)Balance Tires', 6, 5000, 36.266667, '2023-07-28', 156147, 3),
  ('Oil Change/Oil Filter', 6, 5000, 29.446957, '2024-09-07', 168181, 4),
  ('Replace Spark Plugs', 72, 60000, 142.536667, '2021-04-06', 105672, 5),
  ('Inspect Brakes', 12, 10000, 0, '2023-07-25', 156004, 6),
  ('CVT Flush & Fill', 36, 30000, 288.005, '2022-11-25', 137764, 7),
  ('Replace Antifreeze/Coolant', 60, 75000, 144.158333, '2021-04-06', 105672, 8),
  ('Replace Brake Pads', NULL, 25000, 142.771667, '2023-07-25', 156004, 9),
  ('Replace Engine Air Filter', 36, 30000, 12.5775, '2023-10-16', 162310, 10),
  ('Replace Brake Fluid', 48, 40000, 140.24, '2023-07-25', 156004, 11),
  ('Replace Brake Rotors', NULL, 50000, 218.431667, '2023-07-25', 156004, 12),
  ('General Repair', NULL, NULL, 250.882143, '2024-09-07', 168181, 13),
  ('New Tires Purchased & Mounted', NULL, NULL, 643.78, '2023-07-28', 156147, 14),
  ('Registration', 12, NULL, 130.021667, '2023-04-10', 148732, 15),
  ('State Inspection', 12, NULL, 8.333333, '2022-12-30', 141030, 16)
) AS x(service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM veh_service_plan sp JOIN veh_vehicles vv ON vv.id = sp.vehicle_id WHERE vv.name = 'Versa');

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2015-10-09', 4938, 'Tire Rotation, Oil Change/Oil Filter', 58.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2015-10-09' AND sv.odometer = 4938
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0),
  ('Oil Change/Oil Filter', 29, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2015-12-26', 9201, 'Tire Rotation, Oil Change/Oil Filter', 58.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2015-12-26' AND sv.odometer = 9201
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0),
  ('Oil Change/Oil Filter', 29, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2016-03-31', 15068, 'Replace Brake Fluid, Tire Rotation, Oil Change/Oil Filter', 198.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2016-03-31' AND sv.odometer = 15068
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Brake Fluid', 140, NULL, 0),
  ('Tire Rotation', 29.95, NULL, 1),
  ('Oil Change/Oil Filter', 29, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2016-10-13', 26131, 'Tire Rotation, Oil Change/Oil Filter, Replace Engine Air Filter', 71.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2016-10-13' AND sv.odometer = 26131
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0),
  ('Oil Change/Oil Filter', 29, NULL, 1),
  ('Replace Engine Air Filter', 13, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2016-12-04', NULL, 'Tire Rotation', 29.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2016-12-04' AND sv.odometer = NULL
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2017-07-21', 42401, 'Oil Change/Oil Filter', 29
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2017-07-21' AND sv.odometer = 42401
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2017-11-09', NULL, 'Registration', 197
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2017-11-09' AND sv.odometer = NULL
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 197, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2017-12-02', 52179, 'Tire Rotation, Oil Change/Oil Filter', 58.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2017-12-02' AND sv.odometer = 52179
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0),
  ('Oil Change/Oil Filter', 29, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2018-02-17', 58267, 'Oil Change/Oil Filter', 29
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2018-02-17' AND sv.odometer = 58267
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2018-04-08', 61877, 'Tire Rotation, Tire Rotation', 59.9
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2018-04-08' AND sv.odometer = 61877
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 29.95, NULL, 0),
  ('Tire Rotation', 29.95, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2018-06-07', 67657, 'CVT Flush & Fill, Replace In-Cabin Air Filter, Oil Change/Oil Filter', 460
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2018-06-07' AND sv.odometer = 67657
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('CVT Flush & Fill', 288, NULL, 0),
  ('Replace In-Cabin Air Filter', 143, NULL, 1),
  ('Oil Change/Oil Filter', 29, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-02-21', NULL, 'Registration', 175.41
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-02-21' AND sv.odometer = NULL
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 175.41, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-02-22', 79241, 'General Repair', 325.12
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-02-22' AND sv.odometer = 79241
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 325.12, 'Shock Replacement', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-04-06', 81402, 'Oil Change/Oil Filter', 29
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-04-06' AND sv.odometer = 81402
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-04-22', 82089, 'Tire Rotation', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-04-22' AND sv.odometer = 82089
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', NULL, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-10-19', 88520, 'New Tires Purchased & Mounted, Wheel Alignment', 494.59
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-10-19' AND sv.odometer = 88520
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('New Tires Purchased & Mounted', 434.6, NULL, 0),
  ('Wheel Alignment', 59.99, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-10-20', 88545, 'State Inspection', 12.5
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-10-20' AND sv.odometer = 88545
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('State Inspection', 12.5, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2019-11-01', 88880, 'Oil Change/Oil Filter, Replace Engine Air Filter', 39.99
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2019-11-01' AND sv.odometer = 88880
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 27.33, NULL, 0),
  ('Replace Engine Air Filter', 12.66, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-02-28', 93657, 'General Repair', 568.15
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-02-28' AND sv.odometer = 93657
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 568.15, 'Muffler and Resonator replacement', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-02-28', 93692, 'Oil Change/Oil Filter', 27.33
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-02-28' AND sv.odometer = 93692
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 27.33, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-02-29', 93729, 'Registration', 101.6
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-02-29' AND sv.odometer = 93729
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 101.6, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-04-18', 99442, 'Oil Change/Oil Filter', 25.74
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-04-18' AND sv.odometer = 99442
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 25.74, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-09-18', 93729, 'Oil Change/Oil Filter', 29
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-09-18' AND sv.odometer = 93729
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-09-19', 99538, 'Tire Rotation', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-09-19' AND sv.odometer = 99538
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 0, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-11-02', 100167, 'Replace Brake Pads, Replace Brake Rotors', 491.65
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-11-02' AND sv.odometer = 100167
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Brake Pads', 245.825, NULL, 0),
  ('Replace Brake Rotors', 245.825, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2020-11-05', 100406, 'Replace Antifreeze/Coolant, Replace Brake Fluid', 286.26
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2020-11-05' AND sv.odometer = 100406
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Antifreeze/Coolant', 145.78, NULL, 0),
  ('Replace Brake Fluid', 140.48, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-03-07', 104263, 'Registration', 101.6
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-03-07' AND sv.odometer = 104263
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 101.6, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-03-13', 104583, 'Oil Change/Oil Filter', 25.74
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-03-13' AND sv.odometer = 104583
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 25.74, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-03-13', 104590, 'Tire Rotation', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-03-13' AND sv.odometer = 104590
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 0, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-03-26', 105059, 'General Repair', 310.59
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-03-26' AND sv.odometer = 105059
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 310.59, 'Control Arm and Hose Clamps', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-04-06', 105672, 'Replace Antifreeze/Coolant, Replace Spark Plugs, Replace In-Cabin Air Filter', 427.61
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-04-06' AND sv.odometer = 105672
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Antifreeze/Coolant', 142.536667, NULL, 0),
  ('Replace Spark Plugs', 142.536667, NULL, 1),
  ('Replace In-Cabin Air Filter', 142.536667, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-06-26', 110232, 'Wheel Alignment, Tire Rotation', 119
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-06-26' AND sv.odometer = 110232
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Wheel Alignment', 119, NULL, 0),
  ('Tire Rotation', 0, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-06-26', 110237, 'Oil Change/Oil Filter', 32.07
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-06-26' AND sv.odometer = 110237
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 32.07, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-07-03', 100167, 'Inspect Brakes', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-07-03' AND sv.odometer = 100167
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', NULL, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-11-02', 115048, 'Oil Change/Oil Filter', 27.85
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-11-02' AND sv.odometer = 115048
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 27.85, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-11-20', 116161, 'State Inspection', 12.5
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-11-20' AND sv.odometer = 116161
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('State Inspection', 12.5, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2021-11-20', 116198, 'Tire Rotation', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2021-11-20' AND sv.odometer = 116198
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 0, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-03-19', 121083, 'Oil Change/Oil Filter, Replace Engine Air Filter', 42.62
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-03-19' AND sv.odometer = 121083
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29.96, NULL, 0),
  ('Replace Engine Air Filter', 12.66, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-03-19', 121076, 'Tire Rotation', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-03-19' AND sv.odometer = 121076
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 0, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-05-11', 123627, 'Registration', 101.6
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-05-11' AND sv.odometer = 123627
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 101.6, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-07-02', 126975, 'Oil Change/Oil Filter', 29.96
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-07-02' AND sv.odometer = 126975
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29.96, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-07-12', 127751, 'Replace Brake Rotors, Replace Brake Pads, Inspect Brakes', 281.54
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-07-12' AND sv.odometer = 127751
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Brake Rotors', 225.91, NULL, 0),
  ('Replace Brake Pads', 55.63, 'Under Warranty - Replaced (Labor Cost)', 1),
  ('Inspect Brakes', 0, NULL, 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-08-22', 130433, 'General Repair', 110.78
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-08-22' AND sv.odometer = 130433
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 110.78, 'Driver''s side window tint replaced', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-09-08', 132275, 'Wheel Alignment', 79.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-09-08' AND sv.odometer = 132275
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Wheel Alignment', 79.95, 'Front tires alligned, rear checked.', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-09-17', 133295, 'Oil Change/Oil Filter', 29.96
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-09-17' AND sv.odometer = 133295
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29.96, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-11-02', 136934, 'General Repair, Tire Rotation, (Re)Balance Tires', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-11-02' AND sv.odometer = 136934
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 0, 'Installed winter tires that Eric gave me.', 0),
  ('Tire Rotation', 0, 'Installed winter tires that Eric gave me.', 1),
  ('(Re)Balance Tires', 0, 'Tires already came balanced.', 2)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-11-12', 136822, 'General Repair', 41.1
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-11-12' AND sv.odometer = 136822
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 41.1, 'Swap over TPMS sensors from old tires', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-11-16', 136946, 'General Repair', 68.27
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-11-16' AND sv.odometer = 136946
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 68.27, 'TMPS Kit - Repair for flat tires after TPMS swap', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-11-25', 137764, 'CVT Flush & Fill', 288.01
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-11-25' AND sv.odometer = 137764
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('CVT Flush & Fill', 288.01, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-12-10', 139169, 'Oil Change/Oil Filter', 29.96
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-12-10' AND sv.odometer = 139169
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29.96, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2022-12-30', 141030, 'General Repair, General Repair, General Repair', 1480.86
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2022-12-30' AND sv.odometer = 141030
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 642.98, 'Replaced Muffler and Exhaust', 0),
  ('General Repair', 420.99, 'Replaced Lower Control Arm and Ball Assembly', 1),
  ('General Repair', 276.94, 'Replaced Front Sway Bar Links', 2),
  ('Wheel Alignment', 110, NULL, 3),
  ('Tire Rotation', 29.95, NULL, 4),
  ('State Inspection', 0, NULL, 5),
  ('Inspect Brakes', 0, NULL, 6)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-02-24', 145650, 'General Repair', 55.9
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-02-24' AND sv.odometer = 145650
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 55.9, 'Replaced Headlamp Bulbs', 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-02-25', 145673, '(Re)Balance Tires, Tire Rotation', 84.95
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-02-25' AND sv.odometer = 145673
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('(Re)Balance Tires', 60, NULL, 0),
  ('Tire Rotation', 24.95, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-02-25', 145674, 'Oil Change/Oil Filter', 29.96
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-02-25' AND sv.odometer = 145674
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', 29.96, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-04-10', 148732, 'Registration', 102.92
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-04-10' AND sv.odometer = 148732
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Registration', 102.92, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-05-22', 151714, 'Oil Change/Oil Filter', 0
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-05-22' AND sv.odometer = 151714
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Oil Change/Oil Filter', NULL, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-07-25', 156004, 'Replace Brake Rotors, General Repair, Replace Brake Pads', 471.6
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-07-25' AND sv.odometer = 156004
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Inspect Brakes', 0, 'Brakework done with Eric', 0),
  ('Replace Brake Fluid', NULL, 'Brakework done with Eric', 1),
  ('Replace Brake Pads', 126.86, 'Brakework done with Eric', 2),
  ('Replace Brake Rotors', 183.56, 'Brakework done with Eric', 3),
  ('General Repair', 161.18, 'Replaced Calipers', 4)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-07-28', 156147, 'New Tires Purchased & Mounted, Wheel Alignment, (Re)Balance Tires', 1031.75
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-07-28' AND sv.odometer = 156147
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Tire Rotation', 0, 'Summer/Winter Tire Swap - New Tires Mounted', 0),
  ('Wheel Alignment', 129.99, 'Summer/Winter Tire Swap - New Tires Mounted', 1),
  ('(Re)Balance Tires', 48.8, 'Summer/Winter Tire Swap - New Tires Mounted', 2),
  ('New Tires Purchased & Mounted', 852.96, 'Summer/Winter Tire Swap - New Tires Mounted', 3)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-08-13', 158247, 'General Repair, Oil Change/Oil Filter', 363.29
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-08-13' AND sv.odometer = 158247
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 322.36, 'Replaced Brake Drums & Shoes w/Eric', 0),
  ('Oil Change/Oil Filter', 40.93, 'Done with Eric', 1)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2023-10-16', 162310, 'Replace Engine Air Filter', 11.99
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2023-10-16' AND sv.odometer = 162310
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('Replace Engine Air Filter', 11.99, NULL, 0)
) AS x(service_type, cost, notes, sort_order);

WITH visit AS (
  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)
  SELECT id, '2024-09-07', 168181, 'General Repair, Oil Change/Oil Filter', 238.48
  FROM veh_vehicles WHERE name = 'Versa'
  AND NOT EXISTS (
    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id
    WHERE vv.name = 'Versa' AND sv.service_date = '2024-09-07' AND sv.odometer = 168181
  )
  RETURNING id
)
INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)
SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES
  ('General Repair', 207.99, 'Replaced the Battery', 0),
  ('Oil Change/Oil Filter', 30.49, NULL, 1)
) AS x(service_type, cost, notes, sort_order);

