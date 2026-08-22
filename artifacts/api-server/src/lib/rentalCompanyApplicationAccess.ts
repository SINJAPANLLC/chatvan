/**
 * rentalCompanyApplicationAccess.ts
 *
 * Authorization helper for the GET /van/applications/:id route when the
 * caller has the rental_company role.
 *
 * SECURITY RATIONALE
 * ──────────────────
 * A rental_company user must NOT gain read access to a van_application merely
 * because one of their vehicles appeared in a *proposal*.  Proposals are admin-
 * generated suggestions sent to the applicant — neither party has yet committed.
 * Only a fully-activated contract represents an explicit, bilateral selection.
 *
 * ALLOWED CONTRACT STATUSES (conservative set)
 * ─────────────────────────────────────────────
 * The following statuses indicate the contract has been executed (signed, paid,
 * and the vehicle physically handed over):
 *
 *   active        – vehicle currently in use by the lessee
 *   payment_issue – active but with a payment problem; company needs visibility
 *   return_pending – return scheduled; company needs to prepare for pickup
 *   completed     – contract concluded; read access for historical reference
 *
 * Excluded statuses and why:
 *   draft                – admin is still drafting, nothing confirmed
 *   pending_documents    – awaiting documents from applicant
 *   pending_signature    – awaiting e-signature; not yet binding
 *   pending_payment      – awaiting first payment; not yet active
 *   payment_processing   – payment in flight; not yet confirmed active
 *   cancelled            – contract was voided; access must not persist
 *
 * TESTS
 * ─────
 * This module exports a pure predicate (isRcContractStatus) that can be unit-
 * tested without a database connection.  Integration-level verification of the
 * full route can be done with an HTTP test against the running API server using
 * the following scenario matrix:
 *
 *   Scenario                                           Expected HTTP status
 *   ────────────────────────────────────────────────── ────────────────────
 *   RC user, no rental_company_id on their account     403
 *   RC user, wrong rental company (different company)  403
 *   RC user, correct company, contract status=draft    403
 *   RC user, correct company, contract status=pending* 403
 *   RC user, correct company, contract status=active   200 (minimal DTO)
 *   RC user, correct company, contract status=completed 200 (minimal DTO)
 *   RC user, correct company, proposal only (no contract) 403
 *   admin                                              200 (full DTO)
 *   user, own application                              200 (full DTO)
 *   user, another user's application                   403
 *   unauthenticated                                    401
 *
 * Minimal DTO fields guaranteed absent for rental_company callers:
 *   identityVerification, applicantName, phone, email, dob, address,
 *   licenseInfo, aiSummary, adminNotes, signatureData, specialTerms,
 *   terminationTerms, returnTerms, squareCustomerId, squareCardId,
 *   cardLast4, cardBrand, cardExpiry, proposedVehicles (other companies).
 */

/**
 * The set of van_contract statuses that grant a rental_company user read
 * access to the associated van_application.
 *
 * This constant is the single source of truth — both the authorization check
 * and the subsequent data query use this same value.
 */
export const RC_ALLOWED_CONTRACT_STATUSES = [
  "active",
  "payment_issue",
  "return_pending",
  "completed",
] as const;

export type RcAllowedContractStatus = typeof RC_ALLOWED_CONTRACT_STATUSES[number];

/**
 * Pure predicate: returns true iff `status` is in the allow-list.
 * Useful for unit tests without a DB fixture.
 *
 * @example
 *   isRcAllowedContractStatus("active")       // true
 *   isRcAllowedContractStatus("draft")         // false
 *   isRcAllowedContractStatus("pending_payment") // false
 */
export function isRcAllowedContractStatus(status: string): status is RcAllowedContractStatus {
  return (RC_ALLOWED_CONTRACT_STATUSES as readonly string[]).includes(status);
}
