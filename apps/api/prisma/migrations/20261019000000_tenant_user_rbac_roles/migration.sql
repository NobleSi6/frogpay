INSERT INTO role (name)
VALUES ('tenant_operator'), ('tenant_viewer')
ON CONFLICT (name) DO NOTHING;
