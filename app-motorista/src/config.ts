/**
 * Configuração fixa do app. Tudo que muda entre ambientes fica AQUI,
 * num lugar só — trocar o servidor é editar uma linha e gerar novo APK.
 */

/**
 * Endereço padrão do servidor (Tailscale do PC da Nexus). O motorista comum
 * nunca digita isso: o login já usa este valor; só a "Configuração avançada"
 * da tela de login permite trocar.
 */
export const SERVIDOR_PADRAO = 'http://100.127.233.28:8080';
