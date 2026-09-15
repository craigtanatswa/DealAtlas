export const CSV_FORMULA_INJECTION_FIXTURES = [
  { raw: "=1+1", label: "equals formula" },
  { raw: "+2+2", label: "plus formula" },
  { raw: "-SUM(A1:A2)", label: "minus formula" },
  { raw: "@SUM(A1)", label: "at formula" },
  { raw: "=HYPERLINK(\"http://evil.example\",\"Click\")", label: "hyperlink formula" },
  { raw: "=cmd|'/C calc'!A0", label: "DDE-style formula" },
  { raw: "\t=1+1", label: "tab-prefixed formula" },
] as const;
