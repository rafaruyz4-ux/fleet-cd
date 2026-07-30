import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MinhaViagem } from '../api';
import { enviarFila, iniciarRastreio, pedirPermissoes, rastreioLigado } from '../rastreio';
import { getStats } from '../storage';
import { cores } from '../theme';
import { Botao, Cartao, MensagemErro } from '../ui';

/**
 * Painel da viagem em andamento. O acompanhamento por GPS liga sozinho ao
 * entrar aqui (a viagem já foi iniciada) — o motorista não gerencia isso;
 * ele só vê a viagem e uma linha discreta de sincronização.
 */

function horaCurta(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ViagemScreen({
  viagem,
  aoVoltar,
}: {
  viagem: MinhaViagem;
  aoVoltar: () => void;
}) {
  const [ligado, setLigado] = useState(false);
  const [erroPermissao, setErroPermissao] = useState('');
  const [sincronizadoAs, setSincronizadoAs] = useState<string | null>(null);
  const [aguardandoConexao, setAguardandoConexao] = useState(false);

  const ligarColeta = useCallback(async () => {
    setErroPermissao('');
    try {
      const permissao = await pedirPermissoes();
      if (permissao === 'sem_permissao') {
        setErroPermissao(
          'O app precisa da localização para acompanhar a viagem. Vá em Configurações > Apps > Nexus Frota e permita a localização.',
        );
        return;
      }
      if (permissao === 'sem_segundo_plano') {
        setErroPermissao(
          'Escolha "Permitir o tempo todo" na permissão de localização, para a viagem seguir acompanhada com a tela bloqueada.',
        );
        return;
      }
      await iniciarRastreio();
      setLigado(true);
    } catch {
      setErroPermissao('Confira se a localização do celular está ativada e tente de novo.');
    }
  }, []);

  // Liga sozinho ao abrir o painel e atualiza a linha de sincronização.
  useEffect(() => {
    ligarColeta();
    const timer = setInterval(async () => {
      setLigado(await rastreioLigado());
      const stats = await getStats();
      setSincronizadoAs(stats.ultimoEnvio);
      setAguardandoConexao(Boolean(stats.ultimoErro));
      void enviarFila();
    }, 3000);
    return () => clearInterval(timer);
  }, [ligarColeta]);

  return (
    <ScrollView contentContainerStyle={estilos.rolagem}>
      <Pressable onPress={aoVoltar} hitSlop={10}>
        <Text style={estilos.voltar}>‹ Minhas viagens</Text>
      </Pressable>

      <Cartao style={{ gap: 6, alignItems: 'center', paddingVertical: 26 }}>
        <Text style={estilos.placa}>{viagem.veiculo_placa}</Text>
        <Text style={estilos.detalhe}>
          {viagem.paradas_count} {viagem.paradas_count === 1 ? 'parada' : 'paradas'} · saída{' '}
          {horaCurta(viagem.iniciada_em)}
        </Text>
        <View
          style={[
            estilos.farol,
            { backgroundColor: ligado ? 'rgba(47,191,113,0.12)' : 'rgba(245,165,36,0.12)' },
          ]}
        >
          <View style={[estilos.farolBola, { backgroundColor: ligado ? cores.verde : cores.laranja }]} />
          <Text style={[estilos.farolTexto, { color: ligado ? cores.verde : cores.laranja }]}>
            {ligado ? 'Viagem em andamento' : 'Preparando viagem…'}
          </Text>
        </View>
      </Cartao>

      {erroPermissao !== '' && (
        <View style={{ gap: 10 }}>
          <MensagemErro texto={erroPermissao} />
          <Botao titulo="Permitir localização" onPress={ligarColeta} />
        </View>
      )}

      <Text style={estilos.sincronizado}>
        {aguardandoConexao
          ? 'Sem sinal agora — tudo guardado, envia sozinho quando voltar.'
          : sincronizadoAs
            ? `Sincronizado às ${horaCurta(sincronizadoAs)}`
            : 'Conectando…'}
      </Text>

      <Text style={estilos.dica}>
        Pode bloquear a tela e guardar o celular — o app cuida do resto até o fim da viagem.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  rolagem: { padding: 20, gap: 16 },
  voltar: { color: cores.mudo, fontSize: 15, fontWeight: '600' },
  placa: { color: cores.texto, fontSize: 30, fontWeight: '800', letterSpacing: 3 },
  detalhe: { color: cores.mudo, fontSize: 13.5 },
  farol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 10,
  },
  farolBola: { width: 9, height: 9, borderRadius: 999 },
  farolTexto: { fontSize: 14, fontWeight: '700' },
  sincronizado: { color: cores.mudo, fontSize: 13, textAlign: 'center' },
  dica: { color: cores.mudo, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
