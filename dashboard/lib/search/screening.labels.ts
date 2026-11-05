/** Kept apart from screening.ts so browser code can use these without importing the database. */
export type ScreeningAnswers = {
  noticePeriod: string;
  visaStatus: string;
  currentLocation: string;
  yearsS4Hana: string;
  yearsCpi: string;
  salaryExpectation: string;
};

export const SCREENING_LABELS: Record<keyof ScreeningAnswers, string> = {
  noticePeriod: "Notice period",
  visaStatus: "Visa status",
  currentLocation: "Current location",
  yearsS4Hana: "Years with S/4HANA",
  yearsCpi: "Years with CPI",
  salaryExpectation: "Salary expectation",
};
