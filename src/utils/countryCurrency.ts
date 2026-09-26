/**
 * ISO 3166-1 alpha-2 country code → ISO 4217 currency code mapping.
 * Used to auto-populate the currency field when a country is selected
 * in the Premium Feature Settings country picker.
 * Source: standard ISO mappings; multi-currency countries use the primary currency.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AD: "EUR", AE: "AED", AF: "AFN", AG: "XCD", AI: "XCD", AL: "ALL",
  AM: "AMD", AO: "AOA", AR: "ARS", AT: "EUR", AU: "AUD", AW: "AWG",
  AZ: "AZN", BA: "BAM", BB: "BBD", BD: "BDT", BE: "EUR", BF: "XOF",
  BG: "BGN", BH: "BHD", BI: "BIF", BJ: "XOF", BL: "EUR", BM: "BMD",
  BN: "BND", BO: "BOB", BQ: "USD", BR: "BRL", BS: "BSD", BT: "BTN",
  BW: "BWP", BY: "BYN", BZ: "BZD", CA: "CAD", CD: "CDF", CF: "XAF",
  CG: "XAF", CH: "CHF", CI: "XOF", CK: "NZD", CL: "CLP", CM: "XAF",
  CN: "CNY", CO: "COP", CR: "CRC", CU: "CUP", CV: "CVE", CW: "ANG",
  CY: "EUR", CZ: "CZK", DE: "EUR", DJ: "DJF", DK: "DKK", DM: "XCD",
  DO: "DOP", DZ: "DZD", EC: "USD", EE: "EUR", EG: "EGP", ER: "ERN",
  ES: "EUR", ET: "ETB", FI: "EUR", FJ: "FJD", FK: "FKP", FM: "USD",
  FO: "DKK", FR: "EUR", GA: "XAF", GB: "GBP", GD: "XCD", GE: "GEL",
  GF: "EUR", GH: "GHS", GI: "GIP", GL: "DKK", GM: "GMD", GN: "GNF",
  GP: "EUR", GQ: "XAF", GR: "EUR", GT: "GTQ", GU: "USD", GW: "XOF",
  GY: "GYD", HK: "HKD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF",
  ID: "IDR", IE: "EUR", IL: "ILS", IM: "GBP", IN: "INR", IQ: "IQD",
  IR: "IRR", IS: "ISK", IT: "EUR", JM: "JMD", JO: "JOD", JP: "JPY",
  KE: "KES", KG: "KGS", KH: "KHR", KI: "AUD", KM: "KMF", KN: "XCD",
  KP: "KPW", KR: "KRW", KW: "KWD", KY: "KYD", KZ: "KZT", LA: "LAK",
  LB: "LBP", LC: "XCD", LI: "CHF", LK: "LKR", LR: "LRD", LS: "LSL",
  LT: "EUR", LU: "EUR", LV: "EUR", LY: "LYD", MA: "MAD", MC: "EUR",
  MD: "MDL", ME: "EUR", MF: "EUR", MG: "MGA", MH: "USD", MK: "MKD",
  ML: "XOF", MM: "MMK", MN: "MNT", MO: "MOP", MQ: "EUR", MR: "MRU",
  MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK", MX: "MXN", MY: "MYR",
  MZ: "MZN", NA: "NAD", NC: "XPF", NE: "XOF", NG: "NGN", NI: "NIO",
  NL: "EUR", NO: "NOK", NP: "NPR", NR: "AUD", NU: "NZD", NZ: "NZD",
  OM: "OMR", PA: "PAB", PE: "PEN", PF: "XPF", PG: "PGK", PH: "PHP",
  PK: "PKR", PL: "PLN", PM: "EUR", PR: "USD", PS: "ILS", PT: "EUR",
  PW: "USD", PY: "PYG", QA: "QAR", RE: "EUR", RO: "RON", RS: "RSD",
  RU: "RUB", RW: "RWF", SA: "SAR", SB: "SBD", SC: "SCR", SD: "SDG",
  SE: "SEK", SG: "SGD", SH: "SHP", SI: "EUR", SK: "EUR", SL: "SLL",
  SM: "EUR", SN: "XOF", SO: "SOS", SR: "SRD", SS: "SSP", ST: "STN",
  SV: "USD", SX: "ANG", SY: "SYP", SZ: "SZL", TC: "USD", TD: "XAF",
  TG: "XOF", TH: "THB", TJ: "TJS", TK: "NZD", TL: "USD", TM: "TMT",
  TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD", TW: "TWD",
  TZ: "TZS", UA: "UAH", UG: "UGX", US: "USD", UY: "UYU", UZ: "UZS",
  VA: "EUR", VC: "XCD", VE: "VES", VG: "USD", VI: "USD", VN: "VND",
  VU: "VUV", WF: "XPF", WS: "WST", YE: "YER", YT: "EUR", ZA: "ZAR",
  ZM: "ZMW", ZW: "ZWL",
};

/** Returns the ISO 4217 currency code for a given ISO 3166-1 alpha-2 country code, or "" if unknown. */
export function currencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "";
}

/**
 * English display names for the same ISO 3166-1 alpha-2 codes.
 * Kept as static data (instead of Intl.DisplayNames) because Hermes' Intl
 * support is not guaranteed on every React Native runtime/build, and a missing
 * name would render an empty row in the country selector.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua & Barbuda",
  AI: "Anguilla", AL: "Albania", AM: "Armenia", AO: "Angola", AR: "Argentina",
  AT: "Austria", AU: "Australia", AW: "Aruba", AZ: "Azerbaijan",
  BA: "Bosnia & Herzegovina", BB: "Barbados", BD: "Bangladesh", BE: "Belgium",
  BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin",
  BL: "St. Barthélemy", BM: "Bermuda", BN: "Brunei", BO: "Bolivia",
  BQ: "Caribbean Netherlands", BR: "Brazil", BS: "Bahamas", BT: "Bhutan", BW: "Botswana",
  BY: "Belarus", BZ: "Belize",
  CA: "Canada", CD: "DR Congo", CF: "Central African Republic", CG: "Congo",
  CH: "Switzerland", CI: "Côte d'Ivoire", CK: "Cook Islands", CL: "Chile",
  CM: "Cameroon", CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba",
  CV: "Cape Verde", CW: "Curaçao", CY: "Cyprus", CZ: "Czechia",
  DE: "Germany", DJ: "Djibouti", DK: "Denmark", DM: "Dominica",
  DO: "Dominican Republic", DZ: "Algeria",
  EC: "Ecuador", EE: "Estonia", EG: "Egypt", ER: "Eritrea", ES: "Spain", ET: "Ethiopia",
  FI: "Finland", FJ: "Fiji", FK: "Falkland Islands", FM: "Micronesia",
  FO: "Faroe Islands", FR: "France",
  GA: "Gabon", GB: "United Kingdom", GD: "Grenada", GE: "Georgia", GF: "French Guiana",
  GH: "Ghana", GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea",
  GP: "Guadeloupe", GQ: "Equatorial Guinea", GR: "Greece", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana",
  HK: "Hong Kong", HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary",
  ID: "Indonesia", IE: "Ireland", IL: "Israel", IM: "Isle of Man", IN: "India",
  IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy",
  JM: "Jamaica", JO: "Jordan", JP: "Japan",
  KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia", KI: "Kiribati", KM: "Comoros",
  KN: "St. Kitts & Nevis", KP: "North Korea", KR: "South Korea", KW: "Kuwait",
  KY: "Cayman Islands", KZ: "Kazakhstan",
  LA: "Laos", LB: "Lebanon", LC: "St. Lucia", LI: "Liechtenstein", LK: "Sri Lanka",
  LR: "Liberia", LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia",
  LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "St. Martin",
  MG: "Madagascar", MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali",
  MM: "Myanmar", MN: "Mongolia", MO: "Macao", MQ: "Martinique", MR: "Mauritania",
  MT: "Malta", MU: "Mauritius", MV: "Maldives", MW: "Malawi", MX: "Mexico",
  MY: "Malaysia", MZ: "Mozambique",
  NA: "Namibia", NC: "New Caledonia", NE: "Niger", NG: "Nigeria", NI: "Nicaragua",
  NL: "Netherlands", NO: "Norway", NP: "Nepal", NR: "Nauru", NU: "Niue", NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama", PE: "Peru", PF: "French Polynesia", PG: "Papua New Guinea",
  PH: "Philippines", PK: "Pakistan", PL: "Poland", PM: "St. Pierre & Miquelon",
  PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau", PY: "Paraguay",
  QA: "Qatar",
  RE: "Réunion", RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda",
  SA: "Saudi Arabia", SB: "Solomon Islands", SC: "Seychelles", SD: "Sudan",
  SE: "Sweden", SG: "Singapore", SH: "St. Helena", SI: "Slovenia", SK: "Slovakia",
  SL: "Sierra Leone", SM: "San Marino", SN: "Senegal", SO: "Somalia", SR: "Suriname",
  SS: "South Sudan", ST: "São Tomé & Príncipe", SV: "El Salvador", SX: "Sint Maarten",
  SY: "Syria", SZ: "Eswatini",
  TC: "Turks & Caicos Islands", TD: "Chad", TG: "Togo", TH: "Thailand",
  TJ: "Tajikistan", TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan",
  TN: "Tunisia", TO: "Tonga", TR: "Türkiye", TT: "Trinidad & Tobago", TV: "Tuvalu",
  TW: "Taiwan", TZ: "Tanzania",
  UA: "Ukraine", UG: "Uganda", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VA: "Vatican City", VC: "St. Vincent & Grenadines", VE: "Venezuela",
  VG: "British Virgin Islands", VI: "U.S. Virgin Islands", VN: "Vietnam", VU: "Vanuatu",
  WF: "Wallis & Futuna", WS: "Samoa",
  YE: "Yemen", YT: "Mayotte",
  ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
};

export type CountryOption = {
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  code: string;
  /** English display name, e.g. "India". */
  name: string;
  /** ISO 4217 currency code, e.g. "INR". */
  currency: string;
};

/**
 * Every country the pricing selector can offer, sorted by display name.
 * Derived from COUNTRY_CURRENCY so the picker and the currency defaults can
 * never drift apart.
 */
export const COUNTRY_OPTIONS: CountryOption[] = Object.keys(COUNTRY_CURRENCY)
  .map((code) => ({
    code,
    name: COUNTRY_NAMES[code] || code,
    currency: COUNTRY_CURRENCY[code],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Returns the English display name for a country code, or the code itself if unknown. */
export function countryNameForCode(countryCode: string): string {
  const code = countryCode.toUpperCase();
  return COUNTRY_NAMES[code] || code;
}
