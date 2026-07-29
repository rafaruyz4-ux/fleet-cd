-- Comprovante da consulta de débitos: o "site receipt" da Infosimples (a
-- página oficial do órgão no momento da consulta) é baixado e guardado em
-- disco; a multa aponta para a consulta mais recente que a encontrou/confirmou.
ALTER TABLE consultas_infosimples ADD COLUMN comprovante_path TEXT;

ALTER TABLE multas
  ADD COLUMN consulta_id UUID REFERENCES consultas_infosimples(id) ON DELETE SET NULL;

CREATE INDEX idx_multas_consulta_id ON multas(consulta_id);
