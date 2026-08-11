import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MinhaViagem } from '../api';
import {
  enviarFila,
  iniciarRastreio,
  pedirPermissoes,
  rastreioLigado,
  verificarPermissoes,
} from '../rastreio';
import {
  getStats,
  guiaBateriaVista,
  marcarGuiaBateriaVista,
  setStats,
  type StatsRastreio,
} from '../storage';
import { cores } from '../theme';
import { Botao, Cartao, MensagemErro } from '../ui';
import { GuiaBateria } from './GuiaBateria';

/**
 * Painel da viagem em andamento. O acompanhamento por GPS liga sozinho ao
 * entrar aqui (a viagem já foi iniciada) — o motorista não gerencia isso;
 * ele só vê a viagem e as linhas discretas de GPS/envio.
 */

function horaCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ViagemScreen({
  viagem,
  aoVoltar,
  aoSessaoExpirada,
}: {
  viagem: MinhaViagem;
  aoVoltar: () => void;
  aoSessaoExpirada: () => void;
}) {
  const [ligado, setLigado] = useState(false);
  const [erroPermissao, setErroPermissao] = useState('');
  const [modoDegradado, setModoDegradado] = useState(false);
  const [stats, setStatsTela] = useState<StatsRastreio | null>(null);
  const [mostrarGuia, setMostrarGuia] = useState(false);

  const ligarColeta = useCallback(async () => {
    setErroPermissao('');
    try {
      // Primeiro só CONSULTA (sem diálogo); se faltar algo — ex.: permissão
      // revogada enquanto o celular esteve desligado — aí sim pede de novo.
      let permissao = await verificarPermissoes();
      if (permissao !== 'ok') permissao = await pedirPermissoes();
      if (permissao === 'sem_permissao') {
        setErroPermissao(
          'O app precisa da localização para acompanhar a viagem. Vá em Configurações > Apps > Nexus Frota e permita a localização.',
        );
        return;
      }
      if (permissao === 'sem_segundo_plano') {
        // Modo reduzido: coleta só com o app aberto — a tela avisa.
        setModoDegradado(true);
        await iniciarRastreio('primeiro_plano');
      } else {
        setModoDegradado(false);
        await iniciarRastreio('completo');
      }
      setLigado(true);
    } catch {
      setErroPermissao('Confira se a localização do celular está ativada e tente de novo.');
    }
  }, []);

  // Liga sozinho ao abrir o painel e atualiza as linhas de situação.
  useEffect(() => {
    (async () => {
      // Guia de bateria: aparece uma vez, na primeira viagem.
      if (!(await guiaBateriaVista())) setMostrarGuia(true);
      // Entrar numa viagem zera o aviso de "encerrada" da viagem anterior.
      const s = await getStats();
      if (s.viagemEncerrada) await setStats({ ...s, viagemEncerrada: false });
      await ligarColeta();
    })();
    const timer = setInterval(async () => {
      setLigado(await rastreioLigado());
      setStatsTela(await getStats());
      // O enviarFila tem as próprias travas (lote/backoff): chamar a cada 3s
      // NÃO martela o servidor — quando não é hora, ele retorna na entrada.
      void enviarFila();
    }, 3000);
    return () => clearInterval(timer);
  }, [ligarColeta]);

  // --- Estados terminais (substituem o painel) ---

  if (stats?.viagemEncerrada) {
    return (
      <ScrollView contentContainerStyle={estilos.rolagem}>
        <Cartao style={{ gap: 10, alignItems: 'center', paddingVertical: 30 }}>
          <Text style={estilos.placa}>{viagem.veiculo_placa}</Text>
          <Text style={estilos.avisoTitulo}>Viagem encerrada pela central</Text>
          <Text style={estilos.avisoTexto}>
            O acompanhamento desta viagem foi finalizado. Pode voltar para a lista.
          </Text>
        </Cartao>
        <Botao titulo="Voltar às minhas viagens" onPress={aoVoltar} />
      </ScrollView>
    );
  }

  if (stats?.sessaoExpirada) {
    return (
      <ScrollView contentContainerStyle={estilos.rolagem}>
        <Cartao style={{ gap: 10, alignItems: 'center', paddingVertical: 30 }}>
          <Text style={estilos.placa}>{viagem.veiculo_placa}</Text>
          <Text style={estilos.avisoTitulo}>Sua sessão venceu — entre de novo</Text>
          <Text style={estilos.avisoTexto}>
            Os pontos da viagem estão guardados no aparelho e sobem sozinhos depois que você
            entrar de novo.
          </Text>
        </Cartao>
        <Botao titulo="Entrar de novo" onPress={aoSessaoExpirada} />
      </ScrollView>
    );
  }

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

      {modoDegradado && erroPermissao === '' && (
        <View style={{ gap: 10 }}>
          <MensagemErro texto={'Sem a permissão "o tempo todo", o acompanhamento só funciona com o app aberto e a tela ligada.'} />
          <Botao titulo={'Permitir "o tempo todo"'} onPress={ligarColeta} />
          <Pressable onPress={() => void Linking.openSettings()}>
            <Text style={estilos.link}>Abrir configurações do celular</Text>
          </Pressable>
        </View>
      )}

      {/* GPS × internet são problemas diferentes: a tela mostra a hora do
          último PONTO coletado separada da hora do último ENVIO à central. */}
      <Text style={estilos.sincronizado}>
        {stats?.ultimoPonto
          ? `GPS: último ponto às ${horaCurta(stats.ultimoPonto)}`
          : 'GPS: procurando sinal…'}
        {'\n'}
        {stats?.ultimoEnvio
          ? `Central: enviado às ${horaCurta(stats.ultimoEnvio)}`
          : 'Central: aguardando o primeiro envio'}
      </Text>

      {Boolean(stats?.ultimoErro) && (
        <Text style={estilos.sincronizado}>
          Sem internet agora — tudo guardado, envia sozinho quando o sinal voltar.
        </Text>
      )}

      {(stats?.descartados ?? 0) > 0 && (
        <Text style={estilos.avisoDiscreto}>
          A memória encheu e {stats?.descartados} pontos antigos foram descartados.
        </Text>
      )}

      <Text style={estilos.dica}>
        Pode bloquear a tela e guardar o celular — o app cuida do resto até o fim da viagem.
      </Text>

      <Pressable onPress={() => setMostrarGuia(true)}>
        <Text style={estilos.link}>Dicas para o GPS não parar (bateria)</Text>
      </Pressable>

      <GuiaBateria
        visivel={mostrarGuia}
        aoFechar={() => {
          setMostrarGuia(false);
          void marcarGuiaBateriaVista();
        }}
      />
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
  sincronizado: { color: cores.mudo, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  avisoDiscreto: { color: cores.laranja, fontSize: 12.5, textAlign: 'center' },
  avisoTitulo: { color: cores.texto, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  avisoTexto: { color: cores.mudo, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  dica: { color: cores.mudo, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  link: {
    color: cores.mudo,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
