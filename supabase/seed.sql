-- LOCAL DEVELOPMENT SEED ONLY (applied by `supabase db reset`, never by `db push`).
-- Sample tickets are illustrative placeholders based on known ticket titles; their QA
-- content is synthetic and should be replaced by real extracted reports.

-- GoTrue expects these token columns to be '' rather than NULL for users inserted via SQL.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change,
  phone_change_token, reauthentication_token
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'abdullah.butt@gosaas.ai', now(),
  '{"full_name": "Abdullah Butt"}', '{"provider": "email", "providers": ["email"]}', now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'email',
  '{"sub": "00000000-0000-4000-8000-000000000001", "email": "abdullah.butt@gosaas.ai", "email_verified": true}',
  now(), now(), now()
);

insert into public.qa_records (owner_id, ticket_number, title, functional_area, qa_status, assigned_on, qa_completed_on, data)
values
(
  '00000000-0000-4000-8000-000000000001', 'CHG0045893', 'Updates to Equipment Procurement', 'Procurement',
  'qa_completed', current_date - 12, current_date - 4,
  jsonb_build_object(
    'schema_version', 1,
    'summary', 'Sample: validation of equipment procurement changes.',
    'requirements', jsonb_build_array(
      jsonb_build_object('ref', 'REQ-1', 'text', 'Procurement request captures equipment category'),
      jsonb_build_object('ref', 'REQ-2', 'text', 'Approval routing follows updated thresholds')
    ),
    'test_cases', jsonb_build_array(
      jsonb_build_object('ref', 'TC-1', 'title', 'Create request with category', 'requirement_refs', jsonb_build_array('REQ-1'),
        'steps', jsonb_build_array('Open procurement form', 'Select category', 'Submit'),
        'expected_result', 'Request saved with category', 'actual_result', 'As expected', 'status', 'pass'),
      jsonb_build_object('ref', 'TC-2', 'title', 'Approval above threshold', 'requirement_refs', jsonb_build_array('REQ-2'),
        'expected_result', 'Routed to director', 'actual_result', 'Routed to manager', 'status', 'fail'),
      jsonb_build_object('ref', 'TC-3', 'title', 'Approval below threshold', 'requirement_refs', jsonb_build_array('REQ-2'),
        'expected_result', 'Routed to manager', 'actual_result', 'As expected', 'status', 'pass')
    ),
    'bugs', jsonb_build_array(
      jsonb_build_object('ref', 'BUG-1', 'title', 'Wrong approver above threshold', 'severity', 'high', 'status', 'fixed',
        'test_case_refs', jsonb_build_array('TC-2'))
    ),
    'retests', jsonb_build_array(
      jsonb_build_object('bug_ref', 'BUG-1', 'test_case_ref', 'TC-2', 'date', (current_date - 2)::text, 'result', 'pass')
    ),
    'custom_sections', jsonb_build_array(
      jsonb_build_object('heading', 'Business Impact', 'content', 'Sample content.')
    )
  )
),
(
  '00000000-0000-4000-8000-000000000001', 'CHG0047193', 'Germany not able to process return for order 4692182', 'Order Management',
  'qa_completed', current_date - 20, current_date - 16,
  jsonb_build_object(
    'schema_version', 1,
    'test_cases', jsonb_build_array(
      jsonb_build_object('ref', 'TC-1', 'title', 'Process return for DE order', 'status', 'pass'),
      jsonb_build_object('ref', 'TC-2', 'title', 'Return credit memo created', 'status', 'pass')
    )
  )
),
(
  '00000000-0000-4000-8000-000000000001', 'CHG0047188', 'Error message: Violation Lot Uniqueness rule work order completion', 'Manufacturing',
  'in_progress', current_date - 3, null,
  jsonb_build_object(
    'schema_version', 1,
    'test_cases', jsonb_build_array(
      jsonb_build_object('ref', 'TC-1', 'title', 'Complete work order with unique lot', 'status', 'pass', 'executed_on', (current_date - 1)::text),
      jsonb_build_object('ref', 'TC-2', 'title', 'Complete work order with duplicate lot', 'status', 'blocked', 'executed_on', (current_date - 1)::text)
    ),
    'bugs', jsonb_build_array(
      jsonb_build_object('ref', 'BUG-1', 'title', 'Unclear lot uniqueness error', 'severity', 'medium', 'status', 'open', 'found_on', (current_date - 1)::text)
    )
  )
);
