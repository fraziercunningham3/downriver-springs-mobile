export const validFinding = {
  title: "Surface residue near the engine mount",
  severity: "attention",
  confidence: 0.75,
  detail: "A visible residue line appears near the selected engine mount.",
  evidence: ["Thin residue line is visible along the lower mount edge."],
  recommendation: "Have a technician inspect the mount and surrounding area.",
};

export const validModelOutput = {
  findings: [validFinding],
  summary: "The media shows a visible clue that should be checked by a technician.",
};

export const invalidFindingCases = [
  {
    name: "severity",
    update: (finding) => ({ ...finding, severity: "critical" }),
  },
  {
    name: "confidence",
    update: (finding) => ({ ...finding, confidence: 1.01 }),
  },
  {
    name: "evidence",
    update: (finding) => ({ ...finding, evidence: [] }),
  },
  {
    name: "recommendation",
    update: (finding) => ({ ...finding, recommendation: "" }),
  },
];

export const invalidSummaryCases = [
  {
    name: "summary",
    update: (output) => ({ ...output, summary: "" }),
  },
];