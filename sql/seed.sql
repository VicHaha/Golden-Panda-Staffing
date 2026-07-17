-- =====================================================
-- Default Stores
-- =====================================================

insert into stores (name) values
('de Market'),
('Isetan'),
('W Mart')
on conflict (name) do nothing;

-- =====================================================
-- Default Settings
-- =====================================================

insert into settings
(company_name, workspace_code)
values
(
    'Golden Panda',
    'DEFAULT'
)
on conflict do nothing;