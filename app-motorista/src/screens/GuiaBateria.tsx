import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cores } from '../theme';
import { Botao, Cartao } from '../ui';

/**
 * Guia de economia de bateria por fabricante. Cada Android esconde num lugar
 * diferente o botão que "mata" apps em 2º plano — e é isso que derruba o GPS
 * no meio da viagem. Aparece uma vez na primeira viagem e fica acessível
 * depois por um link discreto no painel.
 */

/** Fabricante vem do próprio sistema (Platform.constants) — sem lib extra. */
function fabricante(): string {
  if (Platform.OS !== 'android') return '';
  const c = Platform.constants as unknown as { Manufacturer?: string; Brand?: string };
  return (c.Manufacturer || c.Brand || '').toLowerCase();
}

function passosDoAparelho(): { titulo: string; passos: string[] } {
  const f = fabricante();
  if (f.includes('xiaomi') || f.includes('redmi') || f.includes('poco')) {
    return {
      titulo: 'Xiaomi / Redmi / POCO',
      passos: [
        'Abra Configurações > Apps > Gerenciar apps > Nexus Frota.',
        'Toque em "Economia de bateria" e escolha "Sem restrições".',
        'Na mesma tela, ative o "Início automático".',
        'Na permissão de localização, deixe "Permitir o tempo todo".',
      ],
    };
  }
  if (f.includes('samsung')) {
    return {
      titulo: 'Samsung',
      passos: [
        'Abra Configurações > Aplicativos > Nexus Frota > Bateria.',
        'Escolha "Sem restrições" (ou desligue "Colocar app em suspensão").',
        'Em Configurações > Bateria, confira que o Nexus Frota não está na lista de apps suspensos.',
        'Na permissão de localização, deixe "Permitir o tempo todo".',
      ],
    };
  }
  if (f.includes('motorola') || f.includes('moto')) {
    return {
      titulo: 'Motorola',
      passos: [
        'Abra Configurações > Apps > Nexus Frota > Bateria.',
        'Escolha "Sem restrições" para o uso em segundo plano.',
        'Na permissão de localização, deixe "Permitir o tempo todo".',
      ],
    };
  }
  return {
    titulo: 'seu celular',
    passos: [
      'Abra Configurações > Apps > Nexus Frota > Bateria.',
      'Escolha "Sem restrições" (em alguns aparelhos aparece como "Não otimizar").',
      'Na permissão de localização, deixe "Permitir o tempo todo".',
    ],
  };
}

export function GuiaBateria({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const { titulo, passos } = passosDoAparelho();
  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={estilos.fundo}>
        <Cartao style={estilos.caixa}>
          <Text style={estilos.titulo}>Para o GPS não parar no meio da viagem</Text>
          <Text style={estilos.intro}>
            Alguns celulares desligam apps para economizar bateria. Faça isso uma vez só
            ({titulo}):
          </Text>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 12 }}>
            {passos.map((p, i) => (
              <View key={i} style={estilos.passo}>
                <View style={estilos.bolinha}>
                  <Text style={estilos.bolinhaTexto}>{i + 1}</Text>
                </View>
                <Text style={estilos.passoTexto}>{p}</Text>
              </View>
            ))}
          </ScrollView>
          <Botao titulo="Abrir configurações do celular" onPress={() => void Linking.openSettings()} />
          <Botao titulo="Já fiz / deixar para depois" tom="fantasma" onPress={aoFechar} />
        </Cartao>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  caixa: { gap: 14 },
  titulo: { color: cores.texto, fontSize: 18, fontWeight: '800' },
  intro: { color: cores.mudo, fontSize: 14, lineHeight: 20 },
  passo: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bolinha: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: cores.azul,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bolinhaTexto: { color: cores.claro, fontSize: 12, fontWeight: '800' },
  passoTexto: { color: cores.texto, fontSize: 14.5, lineHeight: 20, flex: 1 },
});
