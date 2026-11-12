# Single-ticket purchase access review

Checked on 2026-11-12 against production source commit `6a4a67f`.

## Confirmed behavior

| Boundary | Current implementation |
| --- | --- |
| Product selection | `vip-ticket-day` (15 EUR) and `safe-pick-day` (10 EUR) exist in `src/lib/paymentProducts.ts`. |
| Payment instructions | `/checkout` renders bank-transfer details and an IPS QR code. The page explicitly says payment is checked manually. |
| Payment confirmation | No order record, bank callback or individual-ticket confirmation handler is implemented in the current source. Sending payment evidence is a manual support process. |
| Admin activation | `authService.activatePlan` grants a time-limited VIP membership. It has no ticket/product-specific grant. |
| Client access | `getUserAccess` checks verified email, account status and general VIP membership. There is no single-ticket entitlement. |
| Private data access | `firestore.rules` permits active VIP ticket reads through `hasVipAccess`, or verified FREE reads for FREE tickets. There is no rule for an individual paid ticket. |

The current source therefore does not implement the promised isolation of an individual Elite Ticket or Safe Pick purchase. Manually activating VIP membership grants broader access. No real payment was initiated, no user membership was changed and no production access rules were changed during this review.

## Implementation needed for individual purchases

Keep manual verification of the bank transfer. Bind the request to a verified user and a specific published ticket ID, product and price before displaying payment instructions. After the administrator verifies the payment, record a grant for that exact user/ticket pair. The grant must be written only by an administrator or an authenticated server, and revocation must be supported. A customer marking a transfer as sent must not grant access.

Both the private Firestore read rule and the client ticket loader must check that grant, alongside blocked-account and email-verification checks. General VIP membership should continue through the existing subscription path. Purchases must not depend on the mutable display code, an untrusted checkout query parameter or the customer's ability to edit their own profile.

Validate with isolated test accounts or a Firestore emulator: guest, verified FREE user, buyer of this ticket, buyer of another ticket, revoked grant, blocked buyer, VIP subscriber and administrator. Verify that a buyer can read only the purchased published ticket, cannot write their own grant and cannot read another customer's grant.

## PitchAPI verification still pending

`PITCHAPI_API_KEY` is absent from the Vercel project. The integration is tested against synthetic responses, not a live account. Real-account verification must check `/v1/leagues` for actual English coverage, a historical match's xG, a future date's fixtures, and the existing-provider fallback before release.
