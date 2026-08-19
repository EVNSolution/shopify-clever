const riskRules = [
  {
    name: "table-rewrite",
    matches(sql) {
      return /--\s*RedefineTables\b/i.test(sql);
    },
  },
  {
    name: "rename",
    matches(sql) {
      return /\b(?:ALTER\s+TABLE\b[^;]*\bRENAME\b|RENAME\s+COLUMN\b)/i.test(
        sql,
      );
    },
  },
  {
    name: "required-column-without-default",
    matches(sql) {
      return sql.split(";").some(
        (statement) =>
          /\bADD\s+(?:COLUMN\s+)?/i.test(statement) &&
          /\bNOT\s+NULL\b/i.test(statement) &&
          !/\bDEFAULT\b/i.test(statement),
      );
    },
  },
  {
    name: "unique-constraint",
    matches(sql) {
      return /\b(?:CREATE\s+UNIQUE\s+INDEX|ADD\s+CONSTRAINT\b[^;]*\bUNIQUE\b)/i.test(
        sql,
      );
    },
  },
  {
    name: "drop",
    matches(sql) {
      return /\bDROP\s+(?:TABLE|COLUMN|INDEX|CONSTRAINT)\b/i.test(sql);
    },
  },
  {
    name: "data-mutation",
    matches(sql) {
      const conflictClause = String.raw`(?:\s+OR\s+(?:ROLLBACK|ABORT|REPLACE|FAIL|IGNORE))?`;
      return new RegExp(
        String.raw`\b(?:UPDATE${conflictClause}\b[^;]*\bSET\b|DELETE\s+FROM\b|INSERT${conflictClause}\s+INTO\b|REPLACE\s+INTO\b)`,
        "i",
      ).test(sql);
    },
  },
];

const incompleteValue = /^(?:pending|none|n\/a|todo|-)?$/i;

export function findMigrationRisks(sql) {
  return riskRules.filter((rule) => rule.matches(sql)).map((rule) => rule.name);
}

function parseReviewFields(reviewText) {
  const fields = new Map();
  for (const line of reviewText.split(/\r?\n/)) {
    const match = /^\s*([a-z-]+):\s*(.*?)\s*$/i.exec(line);
    if (match) fields.set(match[1].toLowerCase(), match[2]);
  }
  return fields;
}

function requireConcreteField(fields, field, migrationName) {
  const value = fields.get(field) ?? "";
  if (incompleteValue.test(value)) {
    throw new Error(
      `${migrationName}/risk-review.md requires a concrete ${field} value.`,
    );
  }
  return value;
}

export function validateMigrationRiskReview({
  migrationName,
  sql,
  reviewText,
}) {
  const risks = findMigrationRisks(sql);
  if (risks.length === 0) return risks;

  if (!reviewText) {
    throw new Error(
      `${migrationName} contains ${risks.join(", ")} and requires risk-review.md.`,
    );
  }

  const fields = parseReviewFields(reviewText);
  const issue = requireConcreteField(fields, "issue", migrationName);
  if (
    !/^https:\/\/github\.com\/EVNSolution\/shopify-clever\/issues\/\d+$/.test(
      issue,
    )
  ) {
    throw new Error(
      `${migrationName}/risk-review.md issue must link to a shopify-clever GitHub issue.`,
    );
  }

  requireConcreteField(fields, "backup", migrationName);
  requireConcreteField(fields, "rehearsal", migrationName);
  requireConcreteField(fields, "recovery", migrationName);

  if ((fields.get("backward-compatible") ?? "").toLowerCase() !== "yes") {
    throw new Error(
      `${migrationName}/risk-review.md must declare backward-compatible: yes.`,
    );
  }

  return risks;
}
