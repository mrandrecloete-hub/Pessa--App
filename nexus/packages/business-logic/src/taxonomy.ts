/** Shared reference lists. Regions are the 14 regions of Namibia. */
export const REGIONS = ['Erongo','Hardap','Karas','Kavango East','Kavango West','Khomas','Kunene','Ohangwena','Omaheke','Omusati','Oshana','Oshikoto','Otjozondjupa','Zambezi'] as const;
export const SECTORS = ['AGRICULTURE','FOOD_PRODUCTION','MANUFACTURING','TOURISM','TECHNOLOGY','RENEWABLE_ENERGY','GREEN_BUSINESS','TRADE_RETAIL','SERVICES','TRANSPORT','EDUCATION','HEALTHCARE_SERVICES','WASTE_MANAGEMENT','WATER_SANITATION','CONSTRUCTION','CREATIVE','OTHER'] as const;
export const STAGES = ['IDEA','START_UP','EARLY_TRADING','ESTABLISHED','EXPANDING'] as const;
export const REGISTRATION_STATUSES = ['NOT_REGISTERED','REGISTRATION_IN_PROGRESS','REGISTERED'] as const;
export const APPLICANT_TYPES = ['YOUTH','WOMEN_OWNED','SME','COMMUNITY_GROUP','COOPERATIVE','PERSON_WITH_DISABILITY'] as const;
export const FUNDING_PURPOSES = ['START_UP_CAPITAL','WORKING_CAPITAL','EQUIPMENT','EXPANSION','INNOVATION','TRAINING','OTHER'] as const;
export const DOCUMENT_CATEGORIES = ['BUSINESS_REGISTRATION','IDENTIFICATION','BUSINESS_PLAN','FINANCIAL_STATEMENTS','BANK_STATEMENTS','SUPPLIER_QUOTATIONS','TAX_DOCUMENTS','CERTIFICATES','PROJECT_PROPOSAL','OTHER'] as const;
export type Region = typeof REGIONS[number]; export type Sector = typeof SECTORS[number];
export type Stage = typeof STAGES[number]; export type RegistrationStatus = typeof REGISTRATION_STATUSES[number];
export const label = (v: string) => v.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
