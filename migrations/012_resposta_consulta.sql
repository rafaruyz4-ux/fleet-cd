-- Resposta bruta (JSON) devolvida pelo órgão na consulta de débitos:
-- auditoria e permite regerar o comprovante em PDF sem nova consulta paga.
ALTER TABLE consultas_infosimples ADD COLUMN resposta JSONB;
