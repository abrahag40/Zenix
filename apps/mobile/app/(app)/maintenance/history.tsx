/**
 * /maintenance/history — tickets archivados (VERIFIED + CLOSED) últimos 30d.
 *
 * Responde a la pregunta del testing T-archive: "¿a dónde van los tickets
 * finalizados?". El usuario llega aquí desde el Hub con un tap.
 *
 * UX Apple HIG:
 *   · Header con back explícito hacia Mi día
 *   · Lista densa con TicketCard (mismo componente que el Hub)
 *   · Empty state amigable cuando aún no hay archivados
 *   · Pull-to-refresh para auditar cambios recientes
 *
 * Decisión: usamos los mismos componentes que el Hub para mantener
 * consistencia visual (CLAUDE.md §13). No introducimos un layout nuevo.
 */
import { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useArchivedMaintenanceTickets } from '../../../src/features/maintenance/api/useTickets'
import { TicketCard } from '../../../src/features/maintenance/components/TicketCard'
import { colors } from '../../../src/design/colors'
import { typography } from '../../../src/design/typography'

export default function HistoryScreen() {
  const router = useRouter()
  const { data, isLoading, isRefreshing, refetch } = useArchivedMaintenanceTickets()

  const onPressTicket = useCallback(
    (id: string) => router.push(`/maintenance/ticket/${id}` as never),
    [router],
  )

  return (
    <SafeAreaView style={styles.canvas} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(app)/trabajo')} hitSlop={10}>
          <Text style={styles.headerBack}>← Mi día</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Histórico</Text>
        <View style={{ width: 80 }} />
      </View>

      {isLoading && data.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.brand[500]} size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refetch}
              tintColor={colors.brand[500]}
            />
          }
          ListHeaderComponent={
            <Text style={styles.hint}>
              Tickets verificados o archivados en los últimos 30 días.
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Sin tickets archivados</Text>
              <Text style={styles.emptyBody}>
                Cuando verifiques un ticket aparecerá aquí. Quedan disponibles
                para consulta y auditoría durante 30 días.
              </Text>
            </View>
          }
          renderItem={({ item }) => <TicketCard ticket={item} onPress={onPressTicket} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBack: { color: colors.brand[400], fontSize: typography.size.bodyLg, fontWeight: '500' },
  headerTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '600' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  hint: {
    color: colors.text.tertiary,
    fontSize: typography.size.small,
    marginBottom: 16,
    lineHeight: 18,
  },
  empty: { padding: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: {
    color: colors.text.primary,
    fontSize: typography.size.bodyLg,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyBody: {
    color: colors.text.secondary,
    fontSize: typography.size.body,
    textAlign: 'center',
    lineHeight: 22,
  },
})
