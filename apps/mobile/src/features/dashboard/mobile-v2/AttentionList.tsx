/**
 * AttentionList — "Atender ahora" para SUPERVISOR.
 * Empty state con illustration honesta (no "—").
 */
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface AttentionItem {
  kind: 'overstayed' | 'maintenance_critical' | 'unpaid_arrival'
  title: string
  count: number
  deeplink: string
}

const KIND_ICON: Record<AttentionItem['kind'], string> = {
  overstayed: '⏱️',
  maintenance_critical: '🔧',
  unpaid_arrival: '💳',
}

const KIND_COLOR: Record<AttentionItem['kind'], string> = {
  overstayed: colors.urgent[500],
  maintenance_critical: colors.urgent[500],
  unpaid_arrival: colors.warning[500],
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <View style={styles.root}>
        <Text style={styles.eyebrow}>Atender ahora</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyTitle}>Día limpio</Text>
          <Text style={styles.emptyBody}>Sin pendientes urgentes en este momento.</Text>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>Atender ahora · {items.length}</Text>
      <View style={{ gap: 10, marginTop: 12 }}>
        {items.map((it) => (
          <Pressable
            key={it.kind}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push(it.deeplink as never)}
          >
            <Text style={styles.itemEmoji}>{KIND_ICON[it.kind]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{it.title}</Text>
              <Text style={[styles.itemCount, { color: KIND_COLOR[it.kind] }]}>
                {it.count} {it.count === 1 ? 'pendiente' : 'pendientes'}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
  },
  eyebrow: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: typography.size.bodyLg,
    color: colors.text.primary,
    fontWeight: '600',
  },
  emptyBody: {
    marginTop: 4,
    fontSize: typography.size.small,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 240,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 14,
  },
  itemEmoji: {
    fontSize: 24,
  },
  itemTitle: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  itemCount: {
    marginTop: 2,
    fontSize: typography.size.small,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chev: {
    fontSize: 24,
    color: colors.text.secondary,
  },
})
