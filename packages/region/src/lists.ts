import type { IndustryOption, DistrictOption } from "./config";

// value MUST match packages/scoring benchmarks keys — identical across regions.
export const INDUSTRIES_HK: IndustryOption[] = [
  { value: "餐飲", label: "餐飲 F&B", labelEn: "F&B / Restaurant" },
  { value: "美容", label: "美容 Beauty", labelEn: "Beauty & Wellness" },
  { value: "診所", label: "診所 Clinic", labelEn: "Clinic / Medical" },
  { value: "本地服務", label: "本地服務 Local Services", labelEn: "Local Services" },
  { value: "零售", label: "零售 Retail", labelEn: "Retail" },
  { value: "其他", label: "其他 Other", labelEn: "Other" },
];

export const INDUSTRIES_TW: IndustryOption[] = [
  { value: "餐飲", label: "餐飲", labelEn: "F&B / Restaurant" },
  { value: "美容", label: "美容美髮", labelEn: "Beauty & Wellness" },
  { value: "診所", label: "診所 / 醫療", labelEn: "Clinic / Medical" },
  { value: "本地服務", label: "生活服務", labelEn: "Local Services" },
  { value: "零售", label: "零售", labelEn: "Retail" },
  { value: "其他", label: "其他", labelEn: "Other" },
];

// serpLocation is the exact canonical_name and mapsLl the "@lat,lng,zoom" form of the
// gps ([lng, lat]) of the matching entry in https://serpapi.com/locations.json?q=<name>,
// verified live on 2026-07-05. Zoom: 14z for HK districts, 11z for TW cities/counties.
// Districts with no SerpAPI entry omit both fields and fall back to the market-level
// serpLocation/mapsLl in config.ts.
export const DISTRICTS_HK: DistrictOption[] = [
  { zh: "中西區", en: "Central & Western", serpLocation: "Central And Western District,Hong Kong Island,Hong Kong", mapsLl: "@22.2730219,114.1498806,14z" },
  { zh: "灣仔區", en: "Wan Chai", serpLocation: "Wan Chai District,Hong Kong Island,Hong Kong", mapsLl: "@22.2762468,114.1825781,14z" },
  { zh: "東區", en: "Eastern", serpLocation: "Eastern District,Hong Kong Island,Hong Kong", mapsLl: "@22.2733889,114.2360778,14z" },
  { zh: "南區", en: "Southern", serpLocation: "Southern District,Hong Kong Island,Hong Kong", mapsLl: "@22.2432164,114.1974398,14z" },
  // SerpAPI has no "Kowloon City District" entry; the Kowloon Region entry's GPS point
  // sits inside this district (Ho Man Tin), so it is the closest verified anchor.
  { zh: "九龍城區", en: "Kowloon City", serpLocation: "Kowloon,Hong Kong", mapsLl: "@22.3185673,114.1796057,14z" },
  { zh: "觀塘區", en: "Kwun Tong", serpLocation: "Kwun Tong District,Kowloon,Hong Kong", mapsLl: "@22.315698,114.2331057,14z" },
  { zh: "深水埗區", en: "Sham Shui Po", serpLocation: "Sham Shui Po District,Kowloon,Hong Kong", mapsLl: "@22.3320934,114.146908,14z" },
  { zh: "黃大仙區", en: "Wong Tai Sin", serpLocation: "Wong Tai Sin District,Kowloon,Hong Kong", mapsLl: "@22.3548115,114.1974398,14z" },
  { zh: "油尖旺區", en: "Yau Tsim Mong", serpLocation: "Yau Tsim Mong District,Kowloon,Hong Kong", mapsLl: "@22.3116028,114.1706884,14z" },
  { zh: "荃灣區", en: "Tsuen Wan", serpLocation: "Tsuen Wan District,New Territories,Hong Kong", mapsLl: "@22.3713227,114.1141601,14z" },
  { zh: "屯門區", en: "Tuen Mun", serpLocation: "Tuen Mun District,New Territories,Hong Kong", mapsLl: "@22.3907654,113.9725161,14z" },
  { zh: "元朗區", en: "Yuen Long", serpLocation: "Yuen Long District,New Territories,Hong Kong", mapsLl: "@22.4445484,114.0222095,14z" },
  { zh: "北區", en: "North", serpLocation: "North District,New Territories,Hong Kong", mapsLl: "@22.5009081,114.1558258,14z" },
  { zh: "大埔區", en: "Tai Po", serpLocation: "Tai Po District,New Territories,Hong Kong", mapsLl: "@22.4423282,114.165521,14z" },
  { zh: "沙田區", en: "Sha Tin", serpLocation: "Sha Tin District,New Territories,Hong Kong", mapsLl: "@22.386408,114.2093287,14z" },
  { zh: "西貢區", en: "Sai Kung", serpLocation: "Sai Kung District,New Territories,Hong Kong", mapsLl: "@22.3833893,114.270976,14z" },
  { zh: "葵青區", en: "Kwai Tsing", serpLocation: "Kwai Tsing District,New Territories,Hong Kong", mapsLl: "@22.3549077,114.1260991,14z" },
  // SerpAPI has no "Islands District" entry; Tung Chung is the district's main town
  // and the largest verified anchor inside it.
  { zh: "離島區", en: "Islands", serpLocation: "Tung Chung,New Territories,Hong Kong", mapsLl: "@22.2873743,113.9425086,14z" },
];

export const DISTRICTS_TW: DistrictOption[] = [
  { zh: "臺北市", en: "Taipei City", serpLocation: "Taipei City,Taiwan", mapsLl: "@25.0329694,121.5654177,11z" },
  { zh: "新北市", en: "New Taipei City", serpLocation: "New Taipei City,Taiwan", mapsLl: "@25.0169826,121.4627868,11z" },
  { zh: "桃園市", en: "Taoyuan City", serpLocation: "Taoyuan City,Taiwan", mapsLl: "@24.9936281,121.3009798,11z" },
  { zh: "臺中市", en: "Taichung City", serpLocation: "Taichung City,Taiwan", mapsLl: "@24.1477358,120.6736482,11z" },
  { zh: "臺南市", en: "Tainan City", serpLocation: "Tainan City,Taiwan", mapsLl: "@22.9998999,120.2268758,11z" },
  { zh: "高雄市", en: "Kaohsiung City", serpLocation: "Kaohsiung City,Taiwan", mapsLl: "@22.6272784,120.3014353,11z" },
  { zh: "基隆市", en: "Keelung City", serpLocation: "Keelung City,Taiwan", mapsLl: "@25.1276033,121.7391833,11z" },
  { zh: "新竹市", en: "Hsinchu City", serpLocation: "Hsinchu City,Taiwan", mapsLl: "@24.8138297,120.9674752,11z" },
  { zh: "嘉義市", en: "Chiayi City", serpLocation: "Chiayi City,Taiwan", mapsLl: "@23.4800751,120.4491113,11z" },
  { zh: "新竹縣", en: "Hsinchu County", serpLocation: "Hsinchu County,Taiwan", mapsLl: "@24.8387226,121.0177246,11z" },
  { zh: "苗栗縣", en: "Miaoli County", serpLocation: "Miaoli County,Taiwan", mapsLl: "@24.560159,120.8214265,11z" },
  { zh: "彰化縣", en: "Changhua County", serpLocation: "Changhua County,Taiwan", mapsLl: "@24.0517963,120.5161352,11z" },
  { zh: "南投縣", en: "Nantou County", serpLocation: "Nantou County,Taiwan", mapsLl: "@23.9609981,120.9718638,11z" },
  { zh: "雲林縣", en: "Yunlin County", serpLocation: "Yunlin County,Taiwan", mapsLl: "@23.7092033,120.4313373,11z" },
  { zh: "嘉義縣", en: "Chiayi County", serpLocation: "Chiayi County,Taiwan", mapsLl: "@23.4518428,120.2554615,11z" },
  { zh: "屏東縣", en: "Pingtung County", serpLocation: "Pingtung County,Taiwan", mapsLl: "@22.5519759,120.5487597,11z" },
  { zh: "宜蘭縣", en: "Yilan County", serpLocation: "Yilan County,Taiwan", mapsLl: "@24.7021073,121.7377502,11z" },
  { zh: "花蓮縣", en: "Hualien County", serpLocation: "Hualien County,Taiwan", mapsLl: "@23.9871589,121.6015714,11z" },
  { zh: "臺東縣", en: "Taitung County", serpLocation: "Taitung County,Taiwan", mapsLl: "@22.7972447,121.0713702,11z" },
  { zh: "澎湖縣", en: "Penghu County", serpLocation: "Penghu County,Taiwan", mapsLl: "@23.5711899,119.5793157,11z" },
  { zh: "金門縣", en: "Kinmen County", serpLocation: "Kinmen County,Fujian Province,Taiwan", mapsLl: "@24.4493726,118.3766352,11z" },
  // SerpAPI's locations DB has no entry for Lienchiang/Matsu (checked Lienchiang,
  // Matsu, Nangan, Beigan) — falls back to the market-level Taiwan anchor.
  { zh: "連江縣", en: "Lienchiang County" },
];
