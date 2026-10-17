import React, { useMemo, useRef, useState } from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { TERMS_TEXT, TERMS_VERSION, PRIVACY_TEXT, PRIVACY_VERSION } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme/colors'
import { border, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'

type Nav = NativeStackNavigationProp<RootStackParamList, 'TermsAcceptance'>
type ScreenRoute = RouteProp<RootStackParamList, 'TermsAcceptance'>

// Tolerance so "reached the bottom" fires reliably across devices/rounding,
// rather than requiring the scroll offset to land exactly on the max.
const SCROLL_BOTTOM_TOLERANCE = 20

type Tab = 'terms' | 'privacy'

function effectiveDateFrom(markdown: string): string {
  const match = markdown.match(/\*\*Effective date:\*\*\s*(.+)/)
  return match ? match[1].trim() : 'date to be announced'
}

const TERMS_EFFECTIVE_DATE = effectiveDateFrom(TERMS_TEXT)

// ── Minimal markdown → styled <Text> blocks ─────────────────────────────────
// A dependency-free renderer covering just what these two documents use:
// headings, a blockquote callout, bullet lists, bold spans, links (rendered
// as plain text — there's nowhere useful to navigate to inside this screen),
// and paragraphs. Good enough to avoid dumping raw "##"/"**" syntax at the
// user without pulling in a full markdown library for two static documents.
type MdBlock =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'quote' | 'paragraph' | 'listItem'; text: string }
  | { type: 'spacer' }

function parseMarkdown(markdown: string): MdBlock[] {
  const lines = markdown.split('\n')
  const blocks: MdBlock[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      blocks.push({ type: 'spacer' })
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', text: line.slice(2) })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ type: 'listItem', text: line.slice(2) })
    } else if (line === '---') {
      blocks.push({ type: 'spacer' })
    } else if (line.startsWith('| ')) {
      // Table rows aren't worth a real table layout here — surface the
      // content as plain text rather than raw pipe syntax.
      blocks.push({ type: 'paragraph', text: line.replace(/\|/g, '  ').trim() })
    } else {
      blocks.push({ type: 'paragraph', text: line })
    }
  }

  return blocks
}

// Splits a line on **bold** spans and [link](url) markers, stripping the
// markdown syntax so the plain text plus a bold flag is all that's left.
function inlineSegments(text: string): { text: string; bold: boolean }[] {
  const withoutLinks = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const parts = withoutLinks.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return { text: part.slice(2, -2), bold: true }
    }
    return { text: part, bold: false }
  })
}

function renderInline(text: string, baseStyle: any, boldStyle: any) {
  return inlineSegments(text).map((seg, i) => (
    <Text key={i} style={seg.bold ? boldStyle : baseStyle}>
      {seg.text}
    </Text>
  ))
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown])

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <Text key={i} style={mdStyles.h1}>
                {renderInline(block.text, mdStyles.h1, mdStyles.h1)}
              </Text>
            )
          case 'h2':
            return (
              <Text key={i} style={mdStyles.h2}>
                {renderInline(block.text, mdStyles.h2, mdStyles.h2)}
              </Text>
            )
          case 'h3':
            return (
              <Text key={i} style={mdStyles.h3}>
                {renderInline(block.text, mdStyles.h3, mdStyles.h3)}
              </Text>
            )
          case 'quote':
            return (
              <View key={i} style={mdStyles.quoteBlock}>
                <Text style={mdStyles.quoteText}>
                  {renderInline(block.text, mdStyles.quoteText, mdStyles.quoteTextBold)}
                </Text>
              </View>
            )
          case 'listItem':
            return (
              <View key={i} style={mdStyles.listRow}>
                <Text style={mdStyles.bullet}>{'•'}</Text>
                <Text style={mdStyles.paragraph}>
                  {renderInline(block.text, mdStyles.paragraph, mdStyles.paragraphBold)}
                </Text>
              </View>
            )
          case 'spacer':
            return <View key={i} style={mdStyles.spacer} />
          case 'paragraph':
          default:
            if (!block.text.trim()) return null
            return (
              <Text key={i} style={mdStyles.paragraph}>
                {renderInline(block.text, mdStyles.paragraph, mdStyles.paragraphBold)}
              </Text>
            )
        }
      })}
    </>
  )
}

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      style={styles.checkboxRow}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Feather name="check" size={14} color={colors.ink} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  )
}

export default function TermsAcceptanceScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { mode, pendingRegistration, initialTab } = route.params
  const { register, acceptTerms } = useAuth()

  const isInteractive = mode === 'register' || mode === 'update'
  const isView = mode === 'view'

  const [tab, setTab] = useState<Tab>(initialTab ?? 'terms')
  const [scrolledTerms, setScrolledTerms] = useState(isView)
  const [scrolledPrivacy, setScrolledPrivacy] = useState(isView)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [confirmedAge, setConfirmedAge] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const scrollViewRef = useRef<ScrollView>(null)

  const bothScrolled = scrolledTerms && scrolledPrivacy
  const canAccept = isView ? false : bothScrolled && agreedToTerms && confirmedAge && !submitting

  function handleScroll(which: Tab) {
    return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
      const reachedBottom =
        layoutMeasurement.height + contentOffset.y >= contentSize.height - SCROLL_BOTTOM_TOLERANCE

      if (!reachedBottom) return
      if (which === 'terms') setScrolledTerms(true)
      else setScrolledPrivacy(true)
    }
  }

  function switchTab(next: Tab) {
    setTab(next)
    scrollViewRef.current?.scrollTo({ y: 0, animated: false })
  }

  async function handleAccept() {
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'register') {
        if (!pendingRegistration) throw new Error('Missing registration details.')
        await register(
          pendingRegistration.email,
          pendingRegistration.password,
          pendingRegistration.firstName,
          pendingRegistration.lastName,
          pendingRegistration.phone,
          pendingRegistration.university,
          TERMS_VERSION,
          PRIVACY_VERSION,
          true
        )
      } else if (mode === 'update') {
        await acceptTerms()
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong.')
      setSubmitting(false)
      if (mode === 'register') {
        navigation.navigate('Register', { errorMessage: e.response?.data?.error || 'Something went wrong.', pendingRegistration })
      }
      return
    }
    setSubmitting(false)
  }

  function handleBack() {
    navigation.navigate('Register', { pendingRegistration })
  }

  const footnote = (
    <Text style={styles.versionFootnote}>
      Terms v{TERMS_VERSION} · Privacy v{PRIVACY_VERSION} · effective {TERMS_EFFECTIVE_DATE}
    </Text>
  )

  return (
    <Screen
      glow="topLeft"
      scroll={false}
      header={
        <View style={styles.header}>
          <ScreenHeader
            title={mode === 'update' ? "We've updated our terms" : 'Terms & Privacy'}
            back={mode !== 'update'}
            onBack={mode === 'register' ? handleBack : undefined}
          />
          {mode === 'update' ? (
            <Text style={styles.subtitle}>
              Please review the changes below and accept to keep using Zoink.
            </Text>
          ) : null}
        </View>
      }
      footer={
        !isView ? (
          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Checkbox
              checked={agreedToTerms}
              onPress={() => setAgreedToTerms((v) => !v)}
              label="I have read and agree to the Terms of Service and Privacy Policy"
            />
            <Checkbox
              checked={confirmedAge}
              onPress={() => setConfirmedAge((v) => !v)}
              label="I confirm I am 18 years of age or older"
            />

            <Button
              label={submitting ? 'Please wait…' : !bothScrolled ? 'Scroll to continue' : 'Accept and continue'}
              onPress={handleAccept}
              disabled={!canAccept}
            />

            {footnote}
          </View>
        ) : (
          footnote
        )
      }
    >
      <View style={styles.tabRow}>
        <Chip
          label={`Terms of Service ${scrolledTerms ? '✓' : ''}`.trim()}
          active={tab === 'terms'}
          onPress={() => switchTab('terms')}
        />
        <Chip
          label={`Privacy Policy ${scrolledPrivacy ? '✓' : ''}`.trim()}
          active={tab === 'privacy'}
          onPress={() => switchTab('privacy')}
        />
      </View>

      <Card shadow={false} padding={0} style={styles.cardWrap} contentStyle={styles.card}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll(tab)}
          scrollEventThrottle={64}
          showsVerticalScrollIndicator
        >
          <MarkdownDocument markdown={tab === 'terms' ? TERMS_TEXT : PRIVACY_TEXT} />
        </ScrollView>
      </Card>
    </Screen>
  )
}

const mdStyles = StyleSheet.create({
  h1: { ...type.section, color: colors.ink, marginBottom: space.xs, marginTop: 4 },
  h2: { ...type.body, fontFamily: fonts.black, color: colors.ink, marginBottom: 4, marginTop: space.xl },
  h3: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink, marginBottom: 4, marginTop: space.md },
  paragraph: { ...type.bodySm, color: colors.muted },
  paragraphBold: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink },
  listRow: { flexDirection: 'row', gap: space.sm, paddingLeft: 4, marginBottom: 2 },
  bullet: { ...type.bodySm, color: colors.greenText },
  quoteBlock: {
    borderLeftWidth: border.thick,
    borderLeftColor: colors.green,
    backgroundColor: colors.bg,
    borderRadius: space.sm,
    padding: space.md,
    marginVertical: space.xs,
  },
  quoteText: { ...type.caption, color: colors.muted },
  quoteTextBold: { ...type.caption, fontFamily: fonts.bold, color: colors.ink },
  spacer: { height: space.xs },
})

const styles = StyleSheet.create({
  header: { gap: space.xs },
  subtitle: { ...type.bodySm, color: colors.mutedAlt },
  tabRow: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  cardWrap: { flex: 1 },
  card: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: { padding: space.xxl, paddingBottom: space.xxl + space.sm },
  footer: { gap: space.lg },
  error: { ...type.labelSm, color: colors.danger },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: 44 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: space.xs,
    borderWidth: border.thin,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.green },
  checkboxLabel: { ...type.labelSm, flex: 1, color: colors.ink },
  versionFootnote: { ...type.caption, textAlign: 'center', color: colors.mutedAlt },
})
