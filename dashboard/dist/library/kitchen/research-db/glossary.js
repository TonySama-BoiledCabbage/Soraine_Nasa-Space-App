// Term definitions copied from the team dashboard dashboard/dist/glossary.mjs (7bf592e). Text unchanged; the dashboard's
// tooltip UI is not ported (the lab shows these in the Terms tab and as title hints).
const definition = (title, description) => Object.freeze({ title, description });

export const definitions = Object.freeze({
  ULOI: definition('Upward Limiting Oxygen Index', 'In Earth tests, the oxygen concentration where about half the samples met the burn-length limit.'),
  MOC: definition('Maximum Oxygen Concentration', 'The highest tested oxygen concentration where the material consistently self-extinguished under the stated test conditions.'),
  'ULOI*': definition('Upward Limiting Oxygen Index (reduced gravity)', 'The lowest tested oxygen concentration where the flame lasted for the whole reduced-gravity drop test. These short-duration criteria differ from Earth tests.'),
  'MOC*': definition('Maximum Oxygen Concentration (reduced gravity)', 'The highest tested oxygen concentration where the flame went out during the drop test. These short-duration criteria differ from Earth tests.'),
  asterisk: definition('Reduced-gravity test limits', 'The asterisk marks a limit from a short-duration reduced-gravity test. Its survival or extinction criteria differ from those used in Earth tests.'),
  oxygen: definition('Oxygen molar percent', 'Oxygen as a percentage of the gas molecules in the test atmosphere. This describes the gas mixture, not the total pressure or oxygen partial pressure.'),
  pp: definition('Percentage points', 'The difference between two percentages. A change from 20% oxygen to 21% oxygen is an increase of 1 percentage point.'),
  oxygenDelta: definition('Change in mean limiting oxygen concentration', 'The paper compares the midpoint of ULOI and MOC at each gravity with the Earth midpoint. This is not the change in ULOI alone or a probability of fire.'),
  airflow: definition('Airflow', 'The speed of gas flowing past the test sample. Flow can carry fresh oxygen toward a flame and move heat and combustion products away.'),
  cmps: definition('Centimetres per second', 'A unit of speed. An airflow of 30 cm/s means gas moves 30 centimetres in one second.'),
  kPa: definition('Kilopascals, absolute pressure', 'A unit of gas pressure. These values are measured relative to a vacuum, rather than relative to the surrounding atmosphere.'),
  psia: definition('Pounds per square inch absolute', 'Gas pressure measured relative to a vacuum. The “a” distinguishes absolute pressure from pressure measured above the surrounding atmosphere.'),
  g: definition('Nominal gravity relative to Earth', 'Gravity expressed as a multiple of Earth’s surface gravity. The dataset’s gravity labels are nominal categories, not a measured acceleration trace for each test.'),
  microgravity: definition('Microgravity', 'A condition of very small apparent weight during free fall, as in orbit or a drop tower. Gravity is still present. This differs from the surface gravity of the Moon or Mars.'),
  PSI: definition('NASA Physical Sciences Informatics', 'NASA’s research data repository. PSI here names the database; lowercase psi is a unit of pressure: pounds per square inch.'),
  NTRS: definition('NASA Technical Reports Server', 'NASA’s public research repository. Source links open the original report, paper or presentation so you can read the test methods and results.'),
  PMMA: definition('Poly(methyl methacrylate)', 'An acrylic plastic. The lunar combustion study in this dataset tested a 4 mm diameter PMMA rod; its results describe that specimen and test setup.'),
  PEI: definition('Polyetherimide', 'The polymer family used for Ultem 1000. The oxygen-limit comparison tested a 10 mil PEI film, so the results describe that material and specimen geometry.'),
  PET: definition('Polyethylene terephthalate', 'The polymer in Mylar G and the related Melinex 515 film used for the Earth comparison. These are similar but distinct film products.'),
  fitted: definition('Fitted result', 'A value obtained by fitting a mathematical relationship to experimental observations. It summarizes measurements and is not an independent trial.'),
  model: definition('Model-derived result', 'A value calculated using a model and stated assumptions. It is not a direct measurement under the condition the model describes.'),
  published: definition('Published experimental limit', 'A flammability limit reported by the source for its stated test conditions. It is not a general fire-risk score or a material safety certification.'),
  derived: definition('Derived summary', 'A number calculated from already reported results, such as a difference between oxygen limits. It does not represent a new experiment.'),
  summary: definition('Reported experimental summary', 'An experimental value summarized by the source, rather than a complete record of an individual raw trial.')
});

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

/** Use passive text inside an existing button; the default creates a button. */
