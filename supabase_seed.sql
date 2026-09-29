-- ============================================================================
-- Seed data — real records reconciled from CHRISTMAS_ORDERS_2026.xlsx, with the
-- product catalog corrected against the shop's actual paper order form.
-- Run AFTER supabase_schema.sql, in the same SQL Editor.
-- Safe to re-run: each insert uses ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------- TURKEY PRICING TIERS ----------
insert into turkey_pricing (id, weight_min, weight_max, price_per_kg) values
('T1', 4, 7.99, 17.55),
('T2', 8, 9.99, 14.80),
('T3', 10, 999, 13.60)
on conflict (id) do nothing;

-- ---------- PRODUCTS ----------
-- Categories and items corrected to match the paper "Shop Christmas Order Form".
-- Kept (per your decision) even though not printed on the current form:
-- Brisket (Beef), Mallard & Hare (Game), Knuckle (Pork and Hams-Gammon) — the
-- form may simply be incomplete, so these stay selectable rather than removed.
insert into products (id, product_name, category, uom, price_per_kg, price_type, notes) values

-- Turkey
('P001','TURKEY WHOLE','Turkey','kg',null,'Tiered','Priced via turkey_pricing weight bands. Also carries Type (White/Bronze), Weight Mode (NYD/EV), Range ± and Turkey Number fields on the order line.'),

-- Turkey Breast Roll (Stuffing type — Sage and Onion / Other — set on the order line)
('P002','PLAIN','Turkey Breast Roll','kg',null,'Quote',''),
('P003','BACON','Turkey Breast Roll','kg',null,'Quote',''),
('P004','STUFFING','Turkey Breast Roll','kg',null,'Quote','Set Stuffing Type on the order line: Sage and Onion or Other'),
('P005','BACON/STUFF','Turkey Breast Roll','kg',null,'Quote','Set Stuffing Type on the order line: Sage and Onion or Other'),

-- Turkey Misc (legs, crown, 3 bird roast etc.) — matches the form's PLAIN/STUFFING/BACON/CROWN/HALF/BONED list
('P006','PLAIN','Turkey Misc','kg',25.00,'Fixed','Observed £25.00/kg (Bridgeman order, "3 Bird Roast")'),
('P007','BACON','Turkey Misc','kg',null,'Quote',''),
('P008','STUFFING','Turkey Misc','kg',null,'Quote','3 Bird Roast bespoke bundles are often quoted as a flat price, not true £/kg — check before saving'),
('P009','BACON/STUFF','Turkey Misc','kg',25.00,'Fixed','Observed £25.00/kg (Beeston order, "3 Bird Roast")'),
('P010','CROWN','Turkey Misc','kg',null,'Quote','On the paper form; no orders observed yet'),
('P011','HALF','Turkey Misc','kg',null,'Quote','On the paper form; no orders observed yet'),
('P012','BONED','Turkey Misc','kg',null,'Quote','On the paper form; no orders observed yet'),

-- Beef
('P013','FILLET','Beef','kg',null,'Quote',''),
('P014','B/WELLINGTON','Beef','kg',null,'Quote',''),
('P015','RIBS','Beef','kg',null,'Quote',''),
('P016','SIRLOIN','Beef','kg',null,'Quote',''),
('P017','SALT BEEF','Beef','kg',null,'Quote',''),
('P018','ROLLED RIBS','Beef','kg',null,'Quote',''),
('P019','OX TONGUE','Beef','kg',null,'Quote',''),
('P020','ROLLED RUMP','Beef','kg',null,'Quote',''),
('P021','TOPSIDE','Beef','kg',null,'Quote',''),
('P022','VEAL','Beef','kg',null,'Quote',''),
('P023','OTHER','Beef','kg',null,'Quote',''),
('P024','BRISKET','Beef','kg',null,'Quote','Not on the current paper form — kept from the earlier catalog in case the form is incomplete'),

-- Pork
('P025','LEG','Pork','kg',null,'Quote',''),
('P026','KNUCKLE','Pork','kg',null,'Quote','Not on the current paper form — kept in case the form is incomplete'),
('P027','LOIN','Pork','kg',null,'Quote',''),
('P028','SHOULDER B/LESS','Pork','kg',null,'Quote',''),
('P029','SHOULDER BONE IN','Pork','kg',null,'Quote',''),
('P030','BELLY','Pork','kg',null,'Quote',''),
('P031','OTHER','Pork','kg',null,'Quote',''),

-- Hams-Gammon
('P032','SMOKED GAMMON','Hams-Gammon','kg',null,'Quote',''),
('P033','UN-SMOKED GAMMON','Hams-Gammon','kg',11.90,'Fixed','Observed £11.90/kg (2 orders, item#24 & #40)'),
('P034','TRADITIONAL HAM','Hams-Gammon','kg',null,'Quote',''),
('P035','HONEY ROAST HAM','Hams-Gammon','kg',14.65,'Fixed','Observed £14.65/kg (item#131)'),
('P036','SMOKED COOKED HAM','Hams-Gammon','kg',null,'Quote',''),
('P037','KNUCKLE','Hams-Gammon','kg',null,'Quote','Not on the current paper form — kept in case the form is incomplete'),
('P038','OTHER','Hams-Gammon','kg',null,'Quote',''),

-- Chicken/Duck/Goose/Lamb (the paper form groups these one box; kept as separate
-- selectable products for a clearer digital catalog — set Quantity on the order
-- line for head count, separate from total weight)
('P039','GOOSE','Other Poultry','kg',null,'Quote','Set Quantity on the order line for head count'),
('P040','DUCK','Other Poultry','kg',15.00,'Fixed','Observed £15.00/kg (Abbullah order). Set Quantity on the order line for head count'),
('P041','CHICKEN','Other Poultry','kg',null,'Quote','Set Quantity on the order line for head count'),
('P042','LAMB','Other Poultry','kg',15.00,'Fixed','Observed £15.00/kg (unassigned item#1). Set Quantity on the order line for head count'),

-- Game (set Quantity on the order line for head count)
('P043','VENISON','Game','kg',null,'Quote',''),
('P044','PHEASANT','Game','kg',null,'Quote','Set Quantity on the order line for head count'),
('P045','GUINEA FOWL','Game','kg',null,'Quote','Set Quantity on the order line for head count'),
('P046','PARTRIDGE','Game','kg',null,'Quote','Set Quantity on the order line for head count'),
('P047','RABBIT','Game','kg',null,'Quote','Set Quantity on the order line for head count'),
('P048','OTHER','Game','kg',null,'Quote',''),
('P049','MALLARD','Game','kg',null,'Quote','Not on the current paper form — kept in case the form is incomplete'),
('P050','HARE','Game','kg',null,'Quote','Not on the current paper form — kept in case the form is incomplete'),

-- Pies (corrected — the form's actual "Pies" list is short)
('P051','PORK','Pies','kg',null,'Quote',''),
('P052','CHICKEN, HAM & APRICOT','Pies','kg',null,'Quote',''),
('P053','GAME','Pies','kg',null,'Quote',''),
('P054','GALA','Pies','kg',null,'Quote',''),

-- Ready Meals (this was wrongly filed as a "pie filling" sub-list before —
-- it's the form's own separate "Ready Meals" column)
('P055','STEAK AND ALE PIE','Ready Meals','kg',null,'Quote',''),
('P056','STEAK AND KIDNEY PIE','Ready Meals','kg',null,'Quote',''),
('P057','CHICKEN HAM LEEK PIE','Ready Meals','kg',null,'Quote',''),
('P058','LASAGNE','Ready Meals','kg',null,'Quote',''),
('P059','LAMB TAGINE','Ready Meals','kg',null,'Quote','Not previously in the catalog — found on the paper form'),
('P060','SHEPHERDS/COTTAGE PIE','Ready Meals','kg',null,'Quote',''),
('P061','VENISON STEW','Ready Meals','kg',null,'Quote','Not previously in the catalog — found on the paper form'),

-- The form's third "Other" column under Pies/Meals
('P062','FROZEN MINI SAUSAGE ROLLS','Pies/Meals - Other','kg',null,'Quote','Not previously in the catalog — found on the paper form'),
('P063','FROZEN REGULAR SAUSAGE ROLLS','Pies/Meals - Other','kg',null,'Quote','Not previously in the catalog — found on the paper form'),
('P064','REGULAR SAUSAGE ROLLS','Pies/Meals - Other','kg',null,'Quote','Replaces the previous generic "Sausage Rolls - Reg" entry'),
('P065','COOKED SALT BEEF','Pies/Meals - Other','kg',null,'Quote','Distinct from raw Salt Beef under Beef'),

-- Cooked Product (trimmed — pies/ready meals/sausage rolls moved to their own
-- categories above to match the paper form)
('P066','COOKED BEEF','Cooked Product','kg',null,'Quote',''),
('P067','COOKED OX TONGUE','Cooked Product','kg',null,'Quote',''),
('P068','COOKED TURKEY','Cooked Product','kg',null,'Quote',''),
('P069','SCOTCH EGG','Cooked Product','kg',null,'Quote',''),
('P070','OTHER','Cooked Product','kg',null,'Quote',''),

-- Misc — the paper form is genuinely free-text here ("Cheese, Sausagemeat, etc.")
-- with no fixed sub-items; kept to just the two products actually seen in real
-- orders so far, rather than the invented fixed list used before
('P071','MISC','Misc','kg',null,'Quote','Free-text box on the paper form (e.g. cheese, sausagemeat) — no fixed sub-items'),
('P072','BACON','Misc','kg',null,'Variable','3 bacon sub-types observed at different prices: Green Back £15.64/kg, Green Streaky £15.64/kg, Smoked Back £16.25/kg')
on conflict (id) do nothing;

-- ---------- CUSTOMERS (8 real) ----------
insert into customers (id, name, telephone, address, delivery_method, marketing_opt_in, notes) values
('C001','ABBOTT, NEIL','07932 539505',null,'Unknown','Y','Source: Master Data'),
('C002','ABBULLAH, SHIRAAZ','07950 849866',null,'Unknown','Y','Source: Master Data'),
('C003','SEERY, JOHN','07774 609111',null,'Unknown','Y','Source: DEPOSITS sheet — deposit taken, no items ordered yet'),
('C004','BREACH','020 848891',null,'Unknown','Y','Source: Turkey Whole sheet. Telephone looks truncated — verify with customer record'),
('C005','FORESTER, GEOFFREY','07785 398080',null,'Delivery','Y','Source: MISC sheet. Comment says Dec 2025 — verify this is a genuine 2026 order'),
('C006','SMITH, ARABELLA','07738 759800',null,'Collection','Y','Source: TURKEY MISC sheet. Comment says Dec 2025 — verify, and see pricing anomaly on the order line'),
('C007','BRIDGEMAN, LUKE','07702 020298',null,'Unknown','Y','Source: TURKEY MISC sheet'),
('C008','BEESTON, HOWARD','07801 932350',null,'Unknown','Y','Source: TURKEY MISC sheet')
on conflict (id) do nothing;

-- ---------- ORDERS (one per customer) ----------
insert into orders (id, order_date, customer_id, status, delivery_method, collection_date, delivery_date, entered_on_pc, notes) values
('ORD-C001', current_date, 'C001', 'Pending', 'Unknown', null, null, 'Y', null),
('ORD-C002', current_date, 'C002', 'Pending', 'Unknown', null, null, 'Y', null),
('ORD-C003', current_date, 'C003', 'Pending', 'Unknown', null, null, 'Y', 'Deposit taken, no items chosen yet'),
('ORD-C004', current_date, 'C004', 'Pending', 'Unknown', null, null, 'Y', 'Desired weight not yet decided (NYD) — total is indicative'),
('ORD-C005', current_date, 'C005', 'Pending', 'Delivery', null, '2025-12-24', 'Y', 'Verify order year — comment references Dec 2025'),
('ORD-C006', current_date, 'C006', 'Pending', 'Collection', '2025-12-23', null, 'Y', 'Verify order year, and re-check pricing anomaly on the line item'),
('ORD-C007', current_date, 'C007', 'Pending', 'Unknown', null, null, 'Y', null),
('ORD-C008', current_date, 'C008', 'Pending', 'Unknown', null, null, 'Y', null)
on conflict (id) do nothing;

-- ---------- ORDER LINE ITEMS ----------
insert into order_details (order_id, line_no, product_name, category, weight_kg, price_per_kg, quantity, turkey_type, weight_mode, weight_range_kg, turkey_number, stuffing_type, source_item_no, flag) values
('ORD-C001', 1, 'TURKEY WHOLE', 'Turkey', 5.3, 17.55, null, null, null, null, '117', null, '117', null),
('ORD-C001', 2, 'MISC', 'Misc', 0.63, 7.70, null, null, null, null, null, null, '96', 'Item text: 1 x TUBE CHESTNUT STUFFING — generic MISC product, bespoke price'),
('ORD-C002', 1, 'DUCK', 'Other Poultry', 2.845, 15.00, 1, null, null, null, null, null, '5', 'Item text: 1 x LARGEST DUCK FOR 6 PEOPLE'),
('ORD-C004', 1, 'TURKEY WHOLE', 'Turkey', 6.5, 17.55, null, 'White', 'NYD', null, null, null, null, 'Desired weight (NYD) — turkey not yet physically allocated; total is indicative, not final'),
('ORD-C005', 1, 'BACON', 'Misc', 0.53, 15.64, null, null, null, null, null, null, '27', 'Green back bacon'),
('ORD-C005', 2, 'BACON', 'Misc', 0.53, 15.64, null, null, null, null, null, null, '9', 'Green streaky bacon'),
('ORD-C005', 3, 'BACON', 'Misc', 0.555, 16.25, null, null, null, null, null, null, '35', 'Smoked back bacon'),
('ORD-C006', 1, 'STUFFING', 'Turkey Misc', 1.0, 195.56, 3, null, null, null, null, null, '83', 'SOURCE DATA ANOMALY: weight=1kg / price=£195.56/kg is almost certainly the 3-bird-roast bundle TOTAL entered into the price field — recommend re-pricing as a fixed bundle, not £/kg. Quantity=3 for the goose+duck+guinea fowl combination.'),
('ORD-C007', 1, 'PLAIN', 'Turkey Misc', 2.635, 25.00, 3, null, null, null, null, null, '84', '3 Bird Roast: turkey, chicken, pheasant for 6 people'),
('ORD-C008', 1, 'BACON/STUFF', 'Turkey Misc', 3.245, 25.00, 3, null, null, null, null, null, '85', '3 Bird Roast: turkey breast, duck breast, chicken breast, bacon, stuffing for 8 people');

-- ---------- PAYMENTS (3 real deposits) ----------
insert into payments (id, customer_id, order_id, payment_date, amount, type, notes) values
('PAY001', 'C001', 'ORD-C001', current_date, -30, 'Deposit', 'From Master Data'),
('PAY002', 'C002', 'ORD-C002', current_date, -30, 'Deposit', 'From Master Data'),
('PAY003', 'C003', 'ORD-C003', current_date, -30, 'Deposit', 'From DEPOSITS sheet')
on conflict (id) do nothing;

-- ---------- UNASSIGNED TRANSACTIONS (£286.89 with no customer attached) ----------
insert into unassigned (source_sheet, item_no, product, weight_kg, price_per_kg, issue) values
('OTHER', '1', 'LAMB', 15, 15.00, 'No customer name or telephone recorded anywhere for this order'),
('HAMS-GAMMON', '24', 'UN-SMOKED GAMMON', 2.14, 11.90, 'No customer name recorded (item #24 is also reused by a blank Chicken placeholder in the OTHER sheet — duplicate ticket number)'),
('HAMS-GAMMON', '131', 'HONEY ROAST HAM', 0.492, 14.65, 'No customer name recorded'),
('HAMS-GAMMON', '40', 'UN-SMOKED GAMMON', 2.455, 11.90, 'No customer name recorded');
