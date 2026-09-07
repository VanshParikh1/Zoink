import React, { useMemo, useRef, useState } from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { TERMS_TEXT, TERMS_VERSION, PRIVACY_TEXT, PRIVACY_VERSION } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import BackButton from '../components/BackButton'

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

export default function TermsAcceptanceScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { mode, pendingRegistration } = route.params
  const { register, acceptTerms } = useAuth()

  const isInteractive = mode === 'register' || mode === 'update'
  const isView = mode === 'view'

  const [tab, setTab] = useState<Tab>('terms')
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

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          {mode === 'register' ? (
            <BackButton onPress={handleBack} style={styles.backLink} />
          ) : mode === 'view' ? (
            <BackButton style={styles.backLink} />
          ) : (
            <View style={styles.backSpacer} />
          )}
          <Text style={styles.title}>
            {mode === 'update' ? "We've updated our terms" : mode === 'view' ? 'Terms & Privacy' : 'Terms & Privacy'}
          </Text>
          {mode === 'update' ? (
            <Text style={styles.subtitle}>
              Please review the changes below and accept to keep using Zoink.
            </Text>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'terms' && styles.tabButtonActive]}
            onPress={() => switchTab('terms')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'terms' && styles.tabTextActive]}>
              Terms of Service {scrolledTerms ? '✓' : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'privacy' && styles.tabButtonActive]}
            onPress={() => switchTab('privacy')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'privacy' && styles.tabTextActive]}>
              Privacy Policy {scrolledPrivacy ? '✓' : ''}
            </Text>
          </TouchableOpacity>
        </View>

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

        {!isView ? (
          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAgreedToTerms((v) => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms ? <Feather name="check" size={14} color={theme.textOnPrimary} /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                I have read and agree to the Terms of Service and Privacy Policy
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setConfirmedAge((v) => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, confirmedAge && styles.checkboxChecked]}>
                {confirmedAge ? <Feather name="check" size={14} color={theme.textOnPrimary} /> : null}
              </View>
              <Text style={styles.checkboxLabel}>I confirm I am 18 years of age or older</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, !canAccept && styles.buttonDisabled]}
              onPress={handleAccept}
              disabled={!canAccept}
              activeOpacity={0.75}
            >
              <Text style={styles.buttonText}>
                {submitting ? 'Please wait…' : !bothScrolled ? 'Scroll to continue' : 'Accept and continue'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.versionFootnote}>
              Terms v{TERMS_VERSION} · Privacy v{PRIVACY_VERSION} · effective {TERMS_EFFECTIVE_DATE}
            </Text>
          </View>
        ) : (
          <View style={styles.footer}>
            <Text style={styles.versionFootnote}>
              Terms v{TERMS_VERSION} · Privacy v{PRIVACY_VERSION} · effective {TERMS_EFFECTIVE_DATE}
            </Text>
          </View>
        )}
      </View>
    </ScreenBackground>
  )
}

const mdStyles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '900', color: theme.text, marginBottom: 6, marginTop: 4 },
  h2: { fontSize: 18, fontWeight: '900', color: theme.text, marginBottom: 4, marginTop: 14 },
  h3: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 4, marginTop: 10 },
  paragraph: { fontSize: 14, lineHeight: 21, color: theme.textSecondary },
  paragraphBold: { fontSize: 14, lineHeight: 21, color: theme.text, fontWeight: '800' },
  listRow: { flexDirection: 'row', gap: 8, paddingLeft: 4, marginBottom: 2 },
  bullet: { fontSize: 14, color: theme.primaryDeep, lineHeight: 21 },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
    backgroundColor: theme.primarySurface,
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  quoteText: { fontSize: 13, lineHeight: 19, color: theme.textSecondary, fontStyle: 'italic' },
  quoteTextBold: { fontSize: 13, lineHeight: 19, color: theme.text, fontStyle: 'italic', fontWeight: '800' },
  spacer: { height: 6 },
})

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: theme.header.stackTop },
  header: { paddingHorizontal: 20, marginBottom: 10 },
  backLink: { marginBottom: 10 },
  backSpacer: { height: 10 },
  title: { ...theme.type.screenTitle, fontSize: 24 },
  subtitle: { color: theme.textMuted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: theme.surfaceSubdued,
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 10,
  },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabButtonActive: { backgroundColor: theme.surface },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: theme.text },
  scroll: {
    flex: 1,
    marginHorizontal: 20,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  scrollContent: { padding: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  error: { color: theme.danger, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  checkboxChecked: { backgroundColor: theme.primary, borderColor: theme.primaryDeep },
  checkboxLabel: { flex: 1, fontSize: 14, color: theme.text, fontWeight: '600', lineHeight: 19 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    borderBottomWidth: 4,
    borderBottomColor: theme.primaryDeep,
    borderRightWidth: 2,
    borderRightColor: theme.primaryDeep,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
  versionFootnote: { textAlign: 'center', color: theme.textDisabled, fontSize: 12, fontWeight: '600', marginTop: 12 },
})
