# Launch checklist

What is built and tested is listed in the app's About page and changelog. This page lists the things that are **not** code, so they cannot be finished by a developer alone. Work through it top to bottom.

## A. Before the first paying shop

1. **Licence keys.** Open `tools/issuer.html` on the computer you will always issue keys from and create the signing key pair. Put the **public** key into the app (`LIC_PUBLIC_KEY` in `index.html`), set the date licences start being enforced (`LIC_ENFORCE_FROM`), and release. Keep the **private** key only in your password manager, with a second copy somewhere safe. Never commit it. If it is lost you cannot issue keys to existing shops without shipping a new public key to everyone.
2. **Prices and plans.** Decide the plans, prices and trial length. They live in `LIC_PLANS` and on the site pages. Change them, release, and check the licence page shows the right amounts.
3. **Lawyer review.** Give `docs/legal.json` (terms, privacy, refunds) to a Namibian lawyer, and the privacy section for the Protection of Personal Information position. Rebuild the pages with `tools/build_legal.py` after changes. Until reviewed, say in sales material that the terms are a draft.
4. **Accountant review.** Ask a registered accountant to look at one sample monthly pack and the VAT working figures against the shop's real books. Pesa's documents support the shop's records and are not approved by NamRA. Keep that wording.
5. **Your own address.** Buy a domain, put Cloudflare in front, and set the headers in `docs/cloud-security-checklist.md`, section 4. GitHub Pages alone cannot set security headers.
6. **Protect the code.** Two factor sign in on GitHub, protect `main` (see the same checklist, section 5).
7. **Support.** Decide the support email or WhatsApp number, hours, and who answers. Put it on the support page and in the app.

## B. Pilot (one to three shops, about a week)

1. Pick shops that sell every day and have a smartphone or tablet.
2. Set each one up with `docs/provisioning/README.md`. Turn on encrypted sync.
3. Run `docs/DEVICE_TEST_PLAN.md` on the phones they will use, with them watching.
4. Ask each cashier to fill the Pilot feedback form inside Pesa after their first and last shifts.
5. Collect the forms. Fix anything marked bad or confusing. Release. Repeat for a second week if needed.
6. Check one month end together: the monthly pack, the VAT figures and the cash up against the real till.

## C. Each shop you sign up

* Own Supabase project on the owner's account, setup script run, encrypted sync on, sync code stored in the owner's password manager.
* Company details, TIN and VAT number entered. VAT category (A or B) chosen if VAT registered.
* Staff invited with codes. Owners and managers use passwords, cashiers may use PINs.
* First backup file made and saved off the phone.
* Opening balances entered on the Accountant page if the books start mid year.
* Shown how to read the Accountant page and how to reach support.

## D. Limits to say out loud to buyers

* Pesa does not process cards, connect to a bank, send SMS or email by itself, or place phone calls. It opens the shop's own apps.
* Pesa is not approved or certified by NamRA, and its tax documents are working figures for the owner and the accountant.
* Cloud sync goes to the shop's own project. With encrypted sync the shop's data cannot be read by the cloud provider, but a lost sync code cannot be recovered by anyone.
* Photos and voice notes in messages are kept small and removed after the keep time chosen in the inbox (60 days by default).

## E. Known gaps a developer can take on later

* Real Safari and real phone testing (the hand plan above is the stop gap).
* Per person cloud accounts (today anyone with the sync code is trusted as the business).
* Moving chat photos to file storage instead of the record table if shops send many.
* Splitting `index.html` into modules. It works as one file, but it is large. `docs/ARCHITECTURE.md` maps it.

**Client documents.** After you create a licence key in `tools/issuer.html`, the same page prepares two separate PDFs for the client: a proof of payment and a licence certificate that carries the key. Fill in the client name, email, amount and payment date, download both, and attach them to the email. Run `python3 tools/embed_issuer_assets.py` if the logo or stamp artwork changes.

## Automatic licences (licence server)

Keys are made by the licence server, not by hand. A shop taps **I have paid** in Pay for Pesa, you check your bank, open `tools/approve.html`, tap **Payment received, approve**, and the server makes the key, emails the client the proof of payment and licence certificate, and the shop's app switches the licence on by itself. `tools/issuer.html` stays as the manual fallback.

To switch it on, do these once (details in `docs/provisioning/README.md`, section Licence server):
- [ ] Create your own Supabase project for the licence server and run `03_licence_requests.sql`
- [ ] Make the signing key pair in `tools/issuer.html`; keep the private key secret
- [ ] Set the function secrets and deploy the `licence` function
- [ ] Create a Resend account, verify your sending address, set `RESEND_API_KEY` and `MAIL_FROM`
- [ ] Paste the public key into `LIC_PUBLIC_KEY` and the function address into `LIC_SERVER` in `index.html`; set `LIC_ENFORCE_FROM`
- [ ] Fill `PAY_DETAILS` with your business bank account
- [ ] Test with one real payment of your own before telling clients
