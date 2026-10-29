# Saha Desk — Client Portal and Website Quoting (plan)

Version 1.0 · 2026-10-29 · Status: **waiting for the owner's decisions** (see `OWNER_QUESTIONS.md`)

## 1. What EZLynx offers clients

Research from EZLynx's own product and help pages plus Saha Agency's EZLynx screenshots. These
are vendor descriptions, not independently verified. Feature sets and pricing may have changed.

### EZLynx Client Center (client self-service portal)

| Feature | What EZLynx describes |
|---|---|
| Sign-in | Client uses the email on their applicant file, gets a verification link, answers a few security questions |
| Overview | Agency details and the client's active policies (filled automatically for agencies using carrier policy downloads) |
| Policies & coverages | Shown if the agency's Client Center admin allows it (including manually entered policies) |
| ID cards | View on phone or print; system-generated ID cards appear in the document center |
| Document center | Documents the agency shared with the client; client can download and upload documents |
| Change requests | Guided prompts for common changes; requests (not live policy changes) are logged and the agency is notified by email |
| Agency visibility | Agents can see client login activity |
| Mobile | "Mobile-ready" in the browser |

- In Saha Agency's EZLynx account, Client Center appears only as an advertisement ("Deliver the
  digital experience"), so it is probably not part of the agency's current plan.
- Public pricing isn't listed. A forum post notes some newer features require an upgrade, and a
  third-party site estimates packages that include client portals at about $125–$175 per user
  per month (unverified).

### EZLynx Consumer Quoting (quote form for the agency website)

- Website visitors fill in an application and either get live quotes from enabled carriers or a
  "we'll contact you" message. Each submission creates a new applicant (lead) in EZLynx.
- Works on any website or as a shareable link. Agency logo, mobile-friendly, lead email alerts,
  editable questions, follow-up emails for people who leave the form part-way.
- Saha Agency's EZLynx records already have a "Consumer Quoting Portal Information" section on the
  Lead Info tab, so this may be in use.

### Client mobile app

- The EZLynx marketplace lists a third-party "Insurance Agent App", an agency-branded client app.
  This is a partner product, not EZLynx itself.

## 2. What Saha Desk will build

Same capabilities as EZLynx Client Center and Consumer Quoting, built in Saha Desk's own design
(EZLynx's screens and branding are theirs and are not copied). Runs on the existing Hostinger plan
at no extra cost.

### 2A. Client Portal (Segment 7B)

| Area | Saha Desk feature |
|---|---|
| Address | Separate sub-address, e.g. `portal.sahaagency.com` (owner decides) |
| Accounts | By invitation from staff (or automatic, owner decides). Completely separate from staff accounts |
| Sign-in | Emailed one-time link, plus a code for stronger security if the owner wants it. Locked after repeated failures |
| Who sees what | A client sees only their own household's records. Never SSNs, license numbers, internal notes, quotes from other insurers, or staff-only fields |
| Home | Agency contact card (assigned producer/CSR, phone, email, office hours), active policies, upcoming renewals |
| Policies | Insurer, policy number, dates, status; coverages/premium only if the owner allows |
| ID cards & documents | Only documents staff mark "Visible to client"; download and print. Clients can upload documents (e.g. a photo of a new car's registration) |
| Change requests | Guided forms: add/remove vehicle, add/remove driver, change address, change mortgagee/lienholder, cancel request, other. Each creates a task for the assigned staff member, appears on the client's timeline, and both sides get an email |
| Contact info | Client can update phone/email/address; changes wait for staff approval |
| New quote request | Starts a lead/quote request in Saha Desk |
| Payments | Links to each insurer's payment page (agencies usually don't take payments directly) |
| Activity | Every client sign-in and action is logged and visible to staff on the client's timeline |
| Branding | Agency name, logo and colors; works on phones |

Depends on Segment 5 (policies) and Segment 6 (documents).

### 2B. Website quote form (Segment 7C)

- A form for the agency website (or a link to share in emails/social media), mobile-friendly with
  the agency logo.
- Creates a new client and lead in Saha Desk, assigned to a producer, with an email alert.
- First version: "we'll contact you with quotes" (non-live). Live online quotes need real insurer
  connections and come later.
- Spam protection and a rate limit; consent wording for contact by phone/email/text.

## 3. Security and compliance

- Client accounts are separate from staff accounts and have no access to staff screens or other
  clients. Every portal page and action checks the client's household.
- Same encryption, activity logging and browser protections as the staff app.
- Portal terms of use and a privacy notice must be approved by the owner (and ideally the agency's
  attorney or E&O insurer). GLBA privacy rules apply to client information.
- Documents are only visible when staff mark them; uploaded client files are scanned and size/type
  limited.

## 4. Decisions needed

See `docs/OWNER_QUESTIONS.md`. Building starts after the answers, and after Segments 5–6.

## Sources

- EZLynx — Customer Self-Service Portal for Insurance Agencies: https://www.ezlynx.com/products/customer-self-service/
- EZLynx — Client Center: Powerful Tools for your Website: https://www.ezlynx.com/blog/posts/ezlynx-client-center-powerful-customer-service-tools-for-your-website/
- EZLynx support — Client Center Access and Login: https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000090289-client-center-accessing-client-center
- EZLynx support — Customer Usage of Client Center: https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000090293-client-center-customer-s-view
- EZLynx support — Secure Document Sharing in Client Center: https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000090292-client-center-sharing-documents-securely
- EZLynx support — Client Center Best Practices: https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000085199-client-center-best-practices-
- EZLynx — Consumer Quoting: https://ezlynx.com/consumer-quoting.html
- EZLynx support — Consumer Quoting FAQ: https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000034095-frequently-asked-questions-consumer-quoting
- Insurance Forums — "EZLynx Client Center worth it?": https://www.insurance-forums.com/community/threads/ezlynx-client-center-worth-it.105930/
- Spendbase — EZLynx pricing estimates (third-party, unverified): https://www.spendbase.co/?p=37426
