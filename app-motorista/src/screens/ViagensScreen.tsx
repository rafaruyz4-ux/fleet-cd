import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiError, getMinhasViagens, type MinhaViagem } from '../api';
import { VetraLogo } from '../logo';
import { getMotoristaNome } from '../storage';
import { cores } from '../theme';
import { Botao, Cartao, MensagemErro } from '../ui';

const STATUS_ROTULO: Record<MinhaViagem['status'], string> = {
  planejada: 'Programada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const STATUS_COR: Record<MinhaViagem['status'], string> = {
  planejada: cores.laranja,
  em_andamento: cores.verde,
  concluida: cores.mudo,
  cancelada: cores.vermelho,
};

function dataCurta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function ViagensScreen({
  aoAbrirViagem,
  aoSair,
}: {
  aoAbrirViagem: (viagem: MinhaViagem) => void;
  aoSair: () => void;
}) {
  const [viagens, setViagens] = useState<MinhaViagem[]>([]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setViagens(await getMinhasViagens());
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao buscar suas viagens.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    getMotoristaNome().then(setNome);
    carregar();
  }, [carregar]);

  const renderItem = useCallback(
    ({ item }: { item: MinhaViagem }) => {
      const ativa = item.status === 'em_andamento';
      return (
        <Pressable onPress={ativa ? () => aoAbrirViagem(item) : undefined}>
          <Cartao style={{ gap: 10, ...(ativa ? { borderColor: cores.azul } : {}) }}>
            <View style={estilos.linhaEntre}>
              <Text style={estilos.placa}>{item.veiculo_placa}</Text>
              <View style={[estilos.badge, { borderColor: STATUS_COR[item.status] }]}>
                <Text style={[estilos.badgeTexto, { color: STATUS_COR[item.status] }]}>
                  {STATUS_ROTULO[item.status]}
                </Text>
              </View>
            </View>
            <Text style={estilos.detalhe}>
              {item.paradas_count} {item.paradas_count === 1 ? 'parada' : 'paradas'} · início{' '}
              {dataCurta(item.iniciada_em ?? item.criado_em)}
            </Text>
            {ativa && <Botao titulo="Abrir viagem e rastrear" onPress={() => aoAbrirViagem(item)} />}
          </Cartao>
        </Pressable>
      );
    },
    [aoAbrirViagem],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.cabecalho}>
        <VetraLogo size={30} />
        <Pressable onPress={aoSair} hitSlop={10}>
          <Text style={estilos.sair}>Sair</Text>
        </Pressable>
      </View>
      <Text style={estilos.ola}>Olá, {nome.split(' ')[0] || 'motorista'} 👋</Text>

      <FlatList
        data={viagens}
        keyExtractor={(v) => v.id}
        renderItem={renderItem}
        contentContainerStyle={estilos.lista}
        ItemSeparatorComponent={Separador}
        refreshControl={
          <RefreshControl
            refreshing={carregando}
            onRefresh={carregar}
            tintColor={cores.azul}
            colors={[cores.azul]}
          />
        }
        ListHeaderComponent={erro ? <MensagemErro texto={erro} /> : null}
        ListEmptyComponent={
          carregando ? null : (
            <Cartao>
              <Text style={estilos.vazio}>
                Nenhuma viagem para você por enquanto. Puxe para atualizar.
              </Text>
            </Cartao>
          )
        }
      />
    </View>
  );
}

function Separador() {
  return <View style={{ height: 12 }} />;
}

const estilos = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sair: { color: cores.mudo, fontSize: 14, fontWeight: '600' },
  ola: { color: cores.texto, fontSize: 20, fontWeight: '700', padding: 20, paddingBottom: 12 },
  lista: { paddingHorizontal: 20, paddingBottom: 32, gap: 0 },
  linhaEntre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placa: { color: cores.texto, fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeTexto: { fontSize: 12, fontWeight: '700' },
  detalhe: { color: cores.mudo, fontSize: 13.5 },
  vazio: { color: cores.mudo, fontSize: 14.5, textAlign: 'center' },
});
