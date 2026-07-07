-- Membership-application flow: assign a membership number at application time,
-- store the club bank account (for the applicant's payment email), and seed the
-- two application email templates.

-- Membership number is now assigned when the application form is received, and
-- reused when the applicant is later converted to a member on payment.
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS membership_number text;

-- Club bank account shown to applicants for subscription payment (editable in Settings → Subscriptions).
INSERT INTO settings (key, section, label, value, default_value, description) VALUES
  ('SUBS-BankAccount', 'SUBS', 'Club bank account number', '12-3290-0055467-00', '12-3290-0055467-00',
   'Shown to new applicants for paying their membership subscription')
ON CONFLICT (key) DO NOTHING;

-- Application email templates
INSERT INTO email_templates (key, name, description, subject_template, body_html) VALUES

('application_received',
 'Application received (applicant)',
 'Sent to the applicant as soon as their membership application form is received.',
 'Wairarapa Camera Club: Membership Application',
 $body$<p>Hi [first_name],</p>
<p>Thank you for submitting a request to become a member of the Wairarapa Camera Club. We look forward to learning about photography with you!</p>
<p>Your <strong>Membership Number is [membership_number]</strong>. Please take a note of this as you will need it to enter Club competitions.</p>
<p>You indicated you would pay your [subs_year] membership subscription of <strong>[subs_amount]</strong> by <strong>[pay_by_date]</strong>. Note that your membership will only become active after we have received your payment. If paying online, the Club's bank account number is <strong>[bank_account]</strong>.</p>
<p>If any of your details are incorrect, just reply to this email to let us know.</p>
<p>Thanks again for applying to become a member.</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('new_application',
 'New application (committee)',
 'Sent to the President, Secretary and Treasurer when a new membership application is received.',
 'New Membership Application Received for [applicant_name]',
 $body$<p>A new membership application was received at [received_at] from [first_name].</p>
<p><strong>[first_name] has indicated they will pay their membership subscription by [pay_by_date].</strong></p>
<p>[review_link]</p>
<p>When their payment has been received, record it through the Shutterbug Subscription Payments page to update their membership Status, Type and Paid Year.</p>
<p>—<br>Wairarapa Camera Club</p>$body$)

ON CONFLICT (key) DO NOTHING;
