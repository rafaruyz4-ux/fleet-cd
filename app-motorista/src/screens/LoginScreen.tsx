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
import { VetraMark } from '../logo';
import { getApiUrl, setApiUrl } from '../storage';
import { cores } from '../theme';
import { Botao, Campo, Cartao, MensagemErro } from '../ui';

export function LoginScreen({ aoEntrar }: { aoEntrar: () => void }) {
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [servidor, setServidor] = useState('');
  const [mostrarServidor, setMostrarServidor] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    getApiUrl().then((url) => {
      setServidor(url);
      // Sem servidor salvo (primeiro uso), já abre o campo.
      if (!url) setMostrarServidor(true);
    });
  }, []);

  async function entrar() {
    setErro('');
    if (!servidor.trim()) {
      setErro('Preencha o endereço do servidor (peça ao gestor).');
      setMostrarServidor(true);
      return;
    }
    if (!cpf.trim() || !senha) {
      setErro('Preencha CPF e senha.');
      return;
    }
    setCarregando(true);
    try {
      await setApiUrl(servidor);
      await loginMotorista(cpf.replace(/\D/g, ''), senha);
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
          <VetraMark size={72} />
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
          <Pressable onPress={() => setMostrarServidor((v) => !v)}>
            <Text style={estilos.linkServidor}>
              {mostrarServidor ? 'Esconder endereço do servidor' : 'Endereço do servidor'}
            </Text>
          </Pressable>
          {mostrarServidor && (
            <Campo
              rotulo="Servidor (peça ao gestor)"
              value={servidor}
              onChangeText={setServidor}
              placeholder="https://exemplo.com.br"
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
  linkServidor: {
    color: cores.mudo,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingTop: 2,
  },
});
