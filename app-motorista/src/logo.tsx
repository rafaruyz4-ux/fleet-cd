import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { cores } from './theme';

/**
 * Marca VETRA portada do dashboard (frontend/src/components/Logo.tsx):
 * "V" geométrico cujo braço direito é um "7".
 */
export function VetraMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M6 12H27L59 90H38Z" fill={cores.claro} />
      <Path d="M44 12H94L62 90L53 68L70 27H44Z" fill={cores.azul} />
    </Svg>
  );
}

/** Assinatura completa: símbolo + wordmark + tagline. */
export function VetraLogo({ size = 34 }: { size?: number }) {
  return (
    <View style={estilos.linha}>
      <VetraMark size={size} />
      <View>
        <Text style={estilos.nome}>VETRA</Text>
        <Text style={estilos.tagline}>Inteligência em Movimento</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nome: {
    color: cores.texto,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 4,
  },
  tagline: {
    color: cores.mudo,
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
