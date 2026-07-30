import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { getMinhasViagens, type MinhaViagem } from './src/api';
import { pararRastreio, rastreioLigado } from './src/rastreio';
import { LoginScreen } from './src/screens/LoginScreen';
import { ViagemScreen } from './src/screens/ViagemScreen';
import { ViagensScreen } from './src/screens/ViagensScreen';
import { limparSessao, temSessao } from './src/storage';
import { cores } from './src/theme';

type Tela = 'carregando' | 'login' | 'viagens' | 'rastreio';

export default function App() {
  const [tela, setTela] = useState<Tela>('carregando');
  const [viagemAtiva, setViagemAtiva] = useState<MinhaViagem | null>(null);

  // Boot: se já está logado, vai direto para as viagens; se o rastreio ficou
  // ligado (app foi fechado no meio da viagem), reabre direto o painel dele.
  useEffect(() => {
    (async () => {
      if (!(await temSessao())) {
        setTela('login');
        return;
      }
      if (await rastreioLigado()) {
        try {
          const viagens = await getMinhasViagens();
          const ativa = viagens.find((v) => v.status === 'em_andamento' && v.iniciada_em);
          if (ativa) {
            setViagemAtiva(ativa);
            setTela('rastreio');
            return;
          }
        } catch {
          // Sem internet agora: cai na lista, o rastreio segue rodando.
        }
      }
      setTela('viagens');
    })();
  }, []);

  async function sair() {
    await pararRastreio().catch(() => {});
    await limparSessao();
    setViagemAtiva(null);
    setTela('login');
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
        <ViagensScreen
          aoAbrirViagem={(v) => {
            setViagemAtiva(v);
            setTela('rastreio');
          }}
          aoSair={sair}
        />
      )}
      {tela === 'rastreio' && viagemAtiva && (
        <ViagemScreen viagem={viagemAtiva} aoVoltar={() => setTela('viagens')} />
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
