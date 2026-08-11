import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiError, loginMotorista } from '../api';
import { SERVIDOR_PADRAO } from '../config';
import { enviarFila } from '../rastreio';
import { VetraMark } from '../logo';
import { getApiUrl, setApiUrl } from '../storage';
import { cores } from '../theme';
import { Botao, Campo, Cartao, MensagemErro } from '../ui';

/**
 * Login do motorista: só CPF e senha. O endereço do servidor já vem embutido
 * (SERVIDOR_PADRAO) — trocar é coisa de suporte, escondida na "Configuração
 * avançada" para não assustar quem só quer entrar.
 */
export function LoginScreen({ aoEntrar }: { aoEntrar: () => void }) {
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [servidor, setServidor] = useState(SERVIDOR_PADRAO);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // getApiUrl já devolve o padrão quando nada foi salvo.
    getApiUrl().then(setServidor);
  }, []);

  async function entrar() {
    setErro('');
    if (!cpf.trim() || !senha) {
      setErro('Preencha CPF e senha.');
      return;
    }
    setCarregando(true);
    try {
      // Campo avançado vazio = volta para o padrão embutido.
      await setApiUrl(servidor.trim() || SERVIDOR_PADRAO);
      await loginMotorista(cpf.replace(/\D/g, ''), senha);
      // Se ficou fila de uma sessão que venceu, o envio retoma já no login.
      void enviarFila(true);
      aoEntrar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível entrar. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.rolagem}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.topo}>
          {/* Toque longo no logo também abre a configuração avançada. */}
          <Pressable onLongPress={() => setMostrarAvancado(true)} delayLongPress={600}>
            <VetraMark size={72} />
          </Pressable>
          <Text style={estilos.titulo}>NEXUS FROTA</Text>
          <Text style={estilos.subtitulo}>App do Motorista</Text>
        </View>

        <Cartao style={{ gap: 14 }}>
          <Campo
            rotulo="CPF"
            value={cpf}
            onChangeText={setCpf}
            placeholder="Somente números"
            keyboardType="number-pad"
            maxLength={14}
          />
          <Campo
            rotulo="Senha"
            value={senha}
            onChangeText={setSenha}
            placeholder="Sua senha"
            secureTextEntry
          />
          <MensagemErro texto={erro} />
          <Botao titulo="Entrar" onPress={entrar} carregando={carregando} />
          <Pressable onPress={() => setMostrarAvancado((v) => !v)}>
            <Text style={estilos.linkAvancado}>
              {mostrarAvancado ? 'Esconder configuração avançada' : 'Configuração avançada'}
            </Text>
          </Pressable>
          {mostrarAvancado && (
            <Campo
              rotulo="Endereço do servidor (só mude se o suporte pedir)"
              value={servidor}
              onChangeText={setServidor}
              placeholder={SERVIDOR_PADRAO}
              keyboardType="url"
              autoCorrect={false}
            />
          )}
        </Cartao>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  rolagem: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 28 },
  topo: { alignItems: 'center', gap: 8 },
  titulo: { color: cores.texto, fontSize: 26, fontWeight: '800', letterSpacing: 8 },
  subtitulo: { color: cores.mudo, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  linkAvancado: {
    color: cores.mudo,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingTop: 2,
  },
});
