import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { getMinhasViagens, type MinhaViagem } from './src/api';
import { pararRastreio, rastreioLigado } from './src/rastreio';
import { LoginScreen } from './src/screens/LoginScreen';
import { ViagemScreen } from './src/screens/ViagemScreen';
import { ViagensScreen } from './src/screens/ViagensScreen';
import {
  getFila,
  getViagemCache,
  limparSessao,
  limparViagemCache,
  setViagemCache,
  temSessao,
} from './src/storage';
import { cores } from './src/theme';

type Tela = 'carregando' | 'login' | 'viagens' | 'rastreio';

export default function App() {
  const [tela, setTela] = useState<Tela>('carregando');
  const [viagemAtiva, setViagemAtiva] = useState<MinhaViagem | null>(null);

  function abrirViagem(v: MinhaViagem) {
    // Guarda a viagem no aparelho: se o celular reiniciar, dá para retomar
    // o painel (e religar o GPS) mesmo sem internet na hora do boot.
    void setViagemCache(v);
    setViagemAtiva(v);
    setTela('rastreio');
  }

  // Boot: se há sessão e uma viagem em andamento já iniciada, volta DIRETO
  // pro painel — que religa o GPS sozinho. Não dá para confiar só no
  // rastreioLigado(): um reboot do celular mata a tarefa e ele fica false,
  // e é justamente aí que a retomada mais importa.
  useEffect(() => {
    (async () => {
      if (!(await temSessao())) {
        setTela('login');
        return;
      }
      try {
        const viagens = await getMinhasViagens();
        const ativa = viagens.find((v) => v.status === 'em_andamento' && v.iniciada_em);
        if (ativa) {
          abrirViagem(ativa);
          return;
        }
        // Servidor confirmou que não há viagem rodando: cache não vale mais.
        await limparViagemCache();
      } catch {
        // Sem internet agora: usa a última viagem conhecida para retomar a
        // coleta offline — o servidor confirma (ou encerra) quando o sinal
        // voltar. Se a sessão venceu, o painel mostra o aviso de login.
        const cache = await getViagemCache();
        if (cache?.iniciada_em) {
          abrirViagem(cache as MinhaViagem);
          return;
        }
      }
      setTela('viagens');
    })();
    // abrirViagem é estável (só usa setState); efeito roda uma vez no boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function concluirSaida() {
    // pararRastreio tenta um último envio; se falhar, a fila fica guardada
    // (limparSessao NÃO apaga a fila de propósito — sobe no próximo login).
    await pararRastreio().catch(() => {});
    await limparSessao();
    setViagemAtiva(null);
    setTela('login');
  }

  async function sair() {
    const [ligado, fila] = await Promise.all([rastreioLigado(), getFila()]);
    // No preview web o Alert não existe; e sem nada pendente não há o que confirmar.
    if (Platform.OS === 'web' || (!ligado && fila.length === 0)) {
      await concluirSaida();
      return;
    }
    Alert.alert(
      'Sair do app?',
      ligado
        ? 'Há uma viagem em andamento. Ao sair, o acompanhamento para; os pontos ainda não enviados ficam guardados e sobem no próximo acesso.'
        : 'Ainda há pontos de localização não enviados. Eles ficam guardados e sobem no próximo acesso.',
      [
        { text: 'Ficar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => void concluirSaida() },
      ],
    );
  }

  return (
    <View style={estilos.raiz}>
      <StatusBar style="light" />
      {tela === 'carregando' && (
        <View style={estilos.centro}>
          <ActivityIndicator color={cores.azul} size="large" />
        </View>
      )}
      {tela === 'login' && <LoginScreen aoEntrar={() => setTela('viagens')} />}
      {tela === 'viagens' && (
        <ViagensScreen aoAbrirViagem={abrirViagem} aoSair={sair} />
      )}
      {tela === 'rastreio' && viagemAtiva && (
        <ViagemScreen
          viagem={viagemAtiva}
          aoVoltar={() => setTela('viagens')}
          aoSessaoExpirada={() => {
            // Sessão venceu no meio da viagem: volta pro login SEM limpar a
            // fila nem o cache — depois de entrar, tudo retoma de onde parou.
            setViagemAtiva(null);
            setTela('login');
          }}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: cores.fundo,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
