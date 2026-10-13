// Pure (no database): shared by the requirements service and the request
// workflow policy.
// Smart Case Operations — Release A (Conditional Requirements). Given one
// requirement from a checklist snapshot and the answers submitted alongside
// it (a plain { [requirementId]: value } map — see contact-requests.service.js),
// decides whether this requirement currently applies. A requirement with no
// condition set always applies (matches every requirement created before
// this release). Deliberately the smallest possible rule set — see
// schema.prisma's RequirementConditionOperator comment — not a general
// expression engine.
//
// GREATER_THAN/LESS_THAN compare numerically; if either side isn't a valid
// number the condition is treated as not satisfied (fails closed: an
// unanswered/malformed prerequisite means the dependent requirement is not
// yet shown as required, matching "ask only what is still necessary").
export function requirementApplies(requirement, answers = {}) {
  if (!requirement.conditionRequirementId || !requirement.conditionOperator) {
    return true;
  }

  const actual = answers[requirement.conditionRequirementId];
  const expected = requirement.conditionValue;

  if (requirement.conditionOperator === "EQUALS") {
    return String(actual ?? "") === String(expected ?? "");
  }
  if (requirement.conditionOperator === "NOT_EQUALS") {
    return String(actual ?? "") !== String(expected ?? "");
  }

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isNaN(actualNumber) || Number.isNaN(expectedNumber)) {
    return false;
  }
  if (requirement.conditionOperator === "GREATER_THAN") {
    return actualNumber > expectedNumber;
  }
  if (requirement.conditionOperator === "LESS_THAN") {
    return actualNumber < expectedNumber;
  }
  return true;
}
