/**
 * Aprende/Catalog — browse cursos disponibles con fuzzy search.
 *
 * Pattern Spotify/Apple Music browse + filter chips horizontal scroll.
 * Cards verticales (no grid en mobile — anti-pattern para mobile content).
 */
import { useState } from 'react'
import { useRouter } from 'expo-router'
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../../src/design/colors'
import { typography } from '../../../src/design/typography'
import { IconChevronRight } from '../../../src/design/icons'
import { useLearningCourses } from '../../../src/features/learning/hooks/useLearning'
import type {
  LearningCourseCard,
  LearningCourseCategory,
} from '../../../src/features/learning/api/learning.api'

const CATEGORY_CHIPS: Array<{ label: string; value?: LearningCourseCategory }> = [
  { label: 'Todos' },
  { label: 'Compliance', value: 'COMPLIANCE_LEGAL' },
  { label: 'Sanitación', value: 'COMPLIANCE_SANITATION' },
  { label: 'Front Office', value: 'FRONT_OFFICE' },
  { label: 'Housekeeping', value: 'HOUSEKEEPING' },
]

export default function AprendeCatalog() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<LearningCourseCategory | undefined>(undefined)
  const { data, isLoading, refetch, isRefetching } = useLearningCourses({
    search: search.length >= 2 ? search : undefined,
    category,
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Catálogo</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Buscar cursos…"
          placeholderTextColor={colors.text.tertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {CATEGORY_CHIPS.map((c) => {
          const active = category === c.value
          return (
            <TouchableOpacity
              key={c.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <CatalogCard
            course={item}
            onPress={() => router.push(`/(app)/aprende/course/${item.slug}`)}
          />
        )}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.brand[500]}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {search ? 'No hay cursos que coincidan.' : 'No hay cursos disponibles.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

// ─── Catalog card ─────────────────────────────────────────────────────────

function CatalogCard({
  course,
  onPress,
}: {
  course: LearningCourseCard
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View style={styles.tier}>
          <Text style={styles.tierText}>{course.tier}</Text>
        </View>
        <Text style={styles.category}>{course.category.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.cardTitle}>{course.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {course.shortDescription}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>~{course.estimatedHours} hrs</Text>
        <IconChevronRight size={18} color={colors.text.tertiary} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  back: { color: colors.text.primary, fontSize: 24, width: 24 },
  title: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  search: {
    backgroundColor: colors.canvas.secondary,
    color: colors.text.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: typography.size.body,
  },
  chips: { paddingHorizontal: 20, gap: 8, paddingBottom: 16 },
  chip: {
    backgroundColor: colors.canvas.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.brand[500] },
  chipText: { color: colors.text.secondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.text.inverse },
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tier: {
    backgroundColor: colors.brand[600] + '33',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tierText: {
    color: colors.brand[300],
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  category: { color: colors.text.tertiary, fontSize: 11 },
  cardTitle: {
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  cardDesc: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cardFooterText: { color: colors.text.tertiary, fontSize: typography.size.micro },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.text.tertiary, fontSize: typography.size.body },
})
