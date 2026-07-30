import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { cores } from './theme';

/** Componentes básicos no visual NEXUS FROTA (bordas suaves, sem neon). */

export function Cartao({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[estilos.cartao, style]}>{children}</View>;
}

export function Botao({
  titulo,
  onPress,
  tom = 'azul',
  carregando = false,
  desabilitado = false,
}: {
  titulo: string;
  onPress: () => void;
  tom?: 'azul' | 'vermelho' | 'fantasma';
  carregando?: boolean;
  desabilitado?: boolean;
}) {
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      style={({ pressed }) => [
        estilos.botao,
        tom === 'azul' && { backgroundColor: cores.azul },
        tom === 'vermelho' && { backgroundColor: cores.vermelho },
        tom === 'fantasma' && estilos.botaoFantasma,
        pressed && { opacity: 0.85 },
        inativo && { opacity: 0.5 },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={cores.claro} />
      ) : (
        <Text style={[estilos.botaoTexto, tom === 'fantasma' && { color: cores.mudo }]}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

export function Campo({
  rotulo,
  ...props
}: TextInputProps & {
  rotulo: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={cores.mudo}
        style={estilos.campo}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

export function MensagemErro({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <View style={estilos.erroCaixa}>
      <Text style={estilos.erroTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: cores.card,
    borderColor: cores.cardBorda,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  botao: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  botaoFantasma: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: cores.cardBorda,
  },
  botaoTexto: { color: cores.claro, fontSize: 16, fontWeight: '700' },
  rotulo: { color: cores.mudo, fontSize: 13, fontWeight: '600' },
  campo: {
    backgroundColor: cores.fundo,
    borderColor: cores.cardBorda,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: cores.texto,
    fontSize: 16,
  },
  erroCaixa: {
    backgroundColor: 'rgba(229,72,77,0.12)',
    borderColor: 'rgba(229,72,77,0.4)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  erroTexto: { color: '#FF8A8E', fontSize: 14 },
});
