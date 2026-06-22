-- LGPD: a limpeza periódica apaga posições de GPS mais antigas que a janela de
-- retenção. Este índice deixa a varredura por data (registrado_em) eficiente,
-- sem escanear a tabela inteira (que cresce sem parar).
CREATE INDEX IF NOT EXISTS idx_gps_registrado_em ON posicoes_gps (registrado_em);
