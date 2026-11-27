// Curated World Bank indicators. Add more here; codes can be looked up at https://data.worldbank.org/indicator
// years: range a random year is drawn from (pick years with good coverage).

export interface Indicator {
  code: string;
  title: string;
  format: 'number' | 'percent' | 'usd' | 'compact';
  unit?: string;
  digits?: number;
  years: [number, number];
  directions?: readonly ('desc' | 'asc')[]; // default: both
  highLabel?: string; // wording in the title, e.g. "highest"
  lowLabel?: string;
}

export const INDICATORS: Indicator[] = [
  { code: 'SP.DYN.TFRT.IN', title: 'Fertility rate (births per woman)', format: 'number', digits: 2, unit: 'births/woman', years: [1970, 2022] },
  { code: 'SP.DYN.LE00.IN', title: 'Life expectancy at birth', format: 'number', digits: 1, unit: 'years', years: [1970, 2022] },
  { code: 'NY.GDP.PCAP.CD', title: 'GDP per capita (current US$)', format: 'usd', years: [1990, 2023] },
  { code: 'EN.GHG.CO2.PC.CE.AR5', title: 'CO₂ emissions per capita', format: 'number', digits: 1, unit: 't', years: [1990, 2022] },
  { code: 'IT.NET.USER.ZS', title: 'Internet users (% of population)', format: 'percent', years: [2000, 2022], directions: ['desc'] },
  { code: 'EN.POP.DNST', title: 'Population density (people per km²)', format: 'number', digits: 0, unit: '/km²', years: [1970, 2021] },
  { code: 'AG.LND.FRST.ZS', title: 'Forest area (% of land area)', format: 'percent', years: [1995, 2021], directions: ['desc'] },
  { code: 'ST.INT.ARVL', title: 'International tourist arrivals', format: 'compact', years: [2005, 2019], directions: ['desc'], highLabel: 'most', lowLabel: 'fewest' },
  { code: 'MS.MIL.XPND.GD.ZS', title: 'Military expenditure (% of GDP)', format: 'percent', years: [1990, 2022], directions: ['desc'] },
  { code: 'IT.CEL.SETS.P2', title: 'Mobile phone subscriptions per 100 people', format: 'number', digits: 0, years: [2000, 2022] },
  { code: 'SP.POP.TOTL', title: 'Population', format: 'compact', years: [1960, 2023], highLabel: 'largest', lowLabel: 'smallest' },
  { code: 'SP.URB.TOTL.IN.ZS', title: 'Urban population (% of total)', format: 'percent', years: [1960, 2023] },
  { code: 'SP.POP.65UP.TO.ZS', title: 'Population aged 65 and above (% of total)', format: 'percent', years: [1960, 2023] },
  { code: 'EG.ELC.RNEW.ZS', title: 'Renewable electricity output (% of total)', format: 'percent', years: [1995, 2015] },
];
