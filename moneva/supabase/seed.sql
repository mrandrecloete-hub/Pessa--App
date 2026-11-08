-- Reference data only. No fake user financial data is ever seeded.
insert into public.currencies(code,name,minor_units,symbol) values
 ('NAD','Namibian Dollar',2,'N$'),('ZAR','South African Rand',2,'R'),('USD','US Dollar',2,'$'),('EUR','Euro',2,'€'),
 ('GBP','Pound Sterling',2,'£'),('BWP','Botswana Pula',2,'P'),('AUD','Australian Dollar',2,'A$'),('CAD','Canadian Dollar',2,'C$')
on conflict do nothing;
insert into public.exchange_rate_sources(id,description) values ('identity','Same currency, rate 1'),('manual','Entered by the user')
on conflict do nothing;
insert into public.transaction_categories(slug,name,kind) values
 ('housing','Housing and rent','expense'),('groceries','Groceries','expense'),('transport','Transport','expense'),('fuel','Fuel','expense'),
 ('electricity','Electricity','expense'),('water','Water','expense'),('internet','Internet','expense'),('mobile','Mobile communication','expense'),
 ('healthcare','Healthcare','expense'),('education','Education','expense'),('restaurants','Restaurants','expense'),('entertainment','Entertainment','expense'),
 ('shopping','Shopping','expense'),('clothing','Clothing','expense'),('personal_care','Personal care','expense'),('insurance','Insurance','expense'),
 ('debt','Debt repayments','expense'),('subscriptions','Subscriptions','expense'),('travel','Travel','expense'),('other','Other','expense'),
 ('salary','Salary','income'),('business','Business income','income'),('freelance','Freelance income','income'),('rental','Rental income','income'),
 ('investment','Investment income','income'),('bonus','Bonus','income'),('gift','Gift','income'),('other_income','Other income','income')
on conflict do nothing;
