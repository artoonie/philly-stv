// Input types: each one is a way of slicing the electorate into groups, with
// real per-district counts. Add a new input type by appending to INPUT_TYPES.
import { ACS, ACS_RELEASE } from './acs.js';
import { RACE_VAP_2020 } from './race.js';
import { PARTY_2023_ATLARGE, PARTY_2024_PRESIDENT, FACTION_2023_PRIMARY } from './party.js';

const acsSource = (table, what) => ({
  label: `American Community Survey ${ACS_RELEASE.replace('ACS ', '')}, table ${table} (${what})`,
  url: `https://censusreporter.org/tables/${table}/`,
  method: 'Block-group estimates split between council districts by area of overlap (scripts/build_data.py).',
});

export const INPUT_TYPES = [
  {
    id: 'party', name: 'Party', unit: 'votes', question: 'Which party do voters back?',
    palette: 'party', counts: PARTY_2023_ATLARGE,
    source: { label: 'Votes in the November 2023 Council at-large general election (the last time Democrats, Working Families and Republicans all ran citywide), by council district', url: 'https://opendataphilly.org/datasets/election-results/', method: 'Division-level results from the City Commissioners joined to their official division-to-council-district table. Because voters could mark 5 names and the parties fielded 5, 2 and 2 candidates, each party’s votes are divided by the number of candidates it ran (its “votes per candidate”). Using each party’s top candidate instead changes the shares by under 1 point.' },
    note: 'Presidential results hide Philadelphia’s real divides, so this uses the 2023 at-large council race, the only citywide contest where the Working Families Party competed. Party registration by district is not published.',
  },
  {
    id: 'faction', name: 'Faction', unit: 'primary votes', question: 'Which mayoral candidate did primary voters pick in 2023?',
    counts: FACTION_2023_PRIMARY,
    source: { label: 'Votes in the May 2023 Democratic and Republican primaries for Mayor, by council district', url: 'https://opendataphilly.org/datasets/election-results/', method: 'Voters are grouped by the candidate they chose, with no labels attached; the Republican primary (David Oh, unopposed) is one group. Independents cannot vote in Pennsylvania primaries and are absent.' },
    note: 'Council is really decided in the Democratic primary, so this shows the electorate as its own factions: the voters behind each 2023 mayoral candidate.',
  },
  {
    id: 'race', name: 'Race / ethnicity', unit: 'adults', question: 'What race or ethnicity are voters?',
    counts: RACE_VAP_2020,
    source: { label: '2020 Census (PL 94-171), voting-age population by Hispanic origin and race', url: 'https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html', method: 'Every census block assigned to the 2024 council district containing it (reconciles to the redistricting ordinance within 2 people per district).' },
    note: 'White, Black and Asian are non-Hispanic; Hispanic is of any race; Other includes multiracial, Native American and Pacific Islander adults.',
  },
  { id: 'gender', name: 'Gender', unit: 'adults', question: 'Men or women?', counts: ACS.gender, source: acsSource('B01001', 'sex by age, 18+') },
  { id: 'cars', name: 'Car access', unit: 'households', question: 'Does the household have a car?', counts: ACS.cars, source: acsSource('B25044', 'vehicles available by tenure'), note: 'A stand-in for “driver vs. non-driver”: households with at least one vehicle vs. none.' },
  { id: 'tenure', name: 'Renters / owners', unit: 'households', question: 'Rent or own?', counts: ACS.tenure, source: acsSource('B25003', 'tenure') },
  { id: 'age', name: 'Age', unit: 'adults', question: 'How old are voters?', counts: ACS.age, source: acsSource('B01001', 'sex by age, 18+') },
  { id: 'education', name: 'Education', unit: 'adults 25+', question: 'Highest level of school?', counts: ACS.education, source: acsSource('B15003', 'educational attainment, 25+') },
  { id: 'nativity', name: 'Birthplace', unit: 'people', question: 'Born in the US or abroad?', counts: ACS.nativity, source: acsSource('B05002', 'place of birth'), method: 'Tract-level estimates (this table is not published for block groups).' },
  { id: 'income', name: 'Income', unit: 'households', question: 'Household income?', counts: ACS.income, source: acsSource('B19001', 'household income') },
  { id: 'commute', name: 'Commute', unit: 'workers', question: 'How do people get to work?', counts: ACS.commute, source: acsSource('B08301', 'means of transportation to work') },
  {
    id: 'party-president', name: 'Party (2024 presidential)', unit: 'votes', question: 'Which presidential candidate did voters back in 2024?',
    palette: 'party', counts: PARTY_2024_PRESIDENT,
    source: { label: 'Votes for President, November 2024 general election (Harris / Trump / other), by council district', url: 'https://opendataphilly.org/datasets/election-results/', method: 'Division-level results joined to the official division-to-district table; three non-geographic provisional-ballot buckets (0.3% of votes) excluded.' },
    note: 'Kept for comparison: this is the lopsided two-party picture that a general election shows. It is the one view where today’s fixed “5 + 2” rule happens to fit.',
  },
];

/** Turn raw counts into { groups, shares, weights }. */
export function electorateFromCounts(counts) {
  const districts = Object.keys(counts).sort((a, b) => +a - +b);
  const groups = Object.keys(counts[districts[0]]);
  const shares = {}, weights = {};
  for (const d of districts) {
    const tot = groups.reduce((s, g) => s + (counts[d][g] || 0), 0);
    weights[d] = tot;
    shares[d] = Object.fromEntries(groups.map(g => [g, (counts[d][g] || 0) / (tot || 1)]));
  }
  return { groups, shares, weights };
}
