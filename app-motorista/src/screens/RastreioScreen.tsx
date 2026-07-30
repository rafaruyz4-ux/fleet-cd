import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MinhaViagem } from '../api';
import {
  enviarFila,
  iniciarRastreio,
  pararRastreio,
  pedirPermissoes,
  rastreioLigado,
} from '../rastreio';
import { getFila, getStats, type StatsRastreio } from '../storage';
import { cores } from '../theme';
import { Botao, Cartao, MensagemErro } from '../ui';

function horaCurta(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function RastreioScreen({
  viagem,
  aoVoltar,
}: {
  viagem: MinhaViagem;
  aoVoltar: () => void;
}) {
  const [ligado, setLigado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [stats, setStats] = useState<StatsRastreio>({
    enviadas: 0,
    ultimoEnvio: null,
    ultimoErro: null,
  });
  const [naFila, setNaFila] = useState(0);

  const atualizarPainel = useCallback(async () => {
    setStats(await getStats());
    setNaFila((await getFila()).length);
    setLigado(await rastreioLigado());
  }, []);

  useEffect(() => {
    atualizarPainel();
    const timer = setInterval(atualizarPainel, 2000);
    return () => clearInterval(timer);
  }, [atualizarPainel]);

  async function ligar() {
    setErro('');
    setOcupado(true);
    try {
      const permissao = await pedirPermissoes();
      if (permissao === 'sem_permissao') {
        setErro('Sem permissão de localização. Vá em Configurações > Apps > Nexus Frota e permita a localização.');
        return;
      }
      if (permissao === 'sem_segundo_plano') {
        setErro('Para funcionar com a tela bloqueada, escolha "Permitir o tempo todo" na permissão de localização (Configurações > Apps > Nexus Frota > Permissões > Localização).');
        return;
      }
      await iniciarRastreio();
      setLigado(true);
    } catch {
      setErro('Não consegui ligar o GPS. Confira se a localização do celular está ativada.');
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      await pararRastreio();
      setLigado(false);
      await atualizarPainel();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.rolagem}>
      <Pressable onPress={aoVoltar} hitSlop={10}>
        <Text style={estilos.voltar}>‹ Minhas viagens</Text>
      </Pressable>

      <Cartao style={{ gap: 6, alignItems: 'center', paddingVertical: 24 }}>
        <Text style={estilos.placa}>{viagem.veiculo_placa}</Text>
        <Text style={estilos.paradas}>
          {viagem.paradas_count} {viagem.paradas_count === 1 ? 'parada' : 'paradas'} nesta viagem
        </Text>
        <View style={[estilos.farol, { backgroundColor: ligado ? 'rgba(47,191,113,0.12)' : 'rgba(138,147,166,0.12)' }]}>
          <View style={[estilos.farolBola, { backgroundColor: ligado ? cores.verde : cores.mudo }]} />
          <Text style={[estilos.farolTexto, { color: ligado ? cores.verde : cores.mudo }]}>
            {ligado ? 'Rastreio ligado' : 'Rastreio desligado'}
          </Text>
        </View>
      </Cartao>

      {ligado ? (
        <Botao titulo="Encerrar rastreio" tom="vermelho" onPress={desligar} carregando={ocupado} />
      ) : (
        <Botao titulo="Iniciar rastreio" onPress={ligar} carregando={ocupado} />
      )}
      <MensagemErro texto={erro} />

      <Cartao style={{ gap: 12 }}>
        <Linha rotulo="Pontos enviados" valor={String(stats.enviadas)} />
        <Linha rotulo="Aguardando envio" valor={String(naFila)} />
        <Linha rotulo="Último envio" valor={horaCurta(stats.ultimoEnvio)} />
        {stats.ultimoErro && (
          <Text style={estilos.avisoFila}>⚠ {stats.ultimoErro}</Text>
        )}
        {naFila > 0 && (
          <Botao titulo="Enviar agora" tom="fantasma" onPress={() => enviarFila(true).then(atualizarPainel)} />
        )}
      </Cartao>

      <Text style={estilos.dica}>
        Com o rastreio ligado pode bloquear a tela e guardar o celular: o envio continua sozinho.
        A notificação fixa "Nexus Frota" mostra que está funcionando.
      </Text>
    </ScrollView>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linhaEntre}>
      <Text style={estilos.linhaRotulo}>{rotulo}</Text>
      <Text style={estilos.linhaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  rolagem: { padding: 20, gap: 16 },
  voltar: { color: cores.mudo, fontSize: 15, fontWeight: '600' },
  placa: { color: cores.texto, fontSize: 30, fontWeight: '800', letterSpacing: 3 },
  paradas: { color: cores.mudo, fontSize: 13.5 },
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
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between' },
  linhaRotulo: { color: cores.mudo, fontSize: 14.5 },
  linhaValor: { color: cores.texto, fontSize: 14.5, fontWeight: '700' },
  avisoFila: { color: cores.laranja, fontSize: 13.5 },
  dica: { color: cores.mudo, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
