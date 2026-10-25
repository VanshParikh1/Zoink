import { useMainTab } from '../context/MainTabContext'
import { CrashLevel, useQaCrash } from '../services/qaCrash'
import { QA_TOOLS } from '../services/network'

type Props = { level: CrashLevel; tab?: string; isFocused?: () => boolean }

/**
 * QA builds only: renders nothing, but throws when zoink://qa/crash/<level>
 * armed a crash and this is the place showing (the focused screen, the
 * active tab), so the error boundary around it can be checked. Release
 * builds without EXPO_PUBLIC_QA_TOOLS get a component that does nothing.
 */
function Probe({ level, tab, isFocused }: Props) {
  const activeTab = useMainTab()
  const showing = level === 'tab' ? activeTab === tab : level === 'screen' ? (isFocused?.() ?? true) : true
  useQaCrash(level, showing)
  return null
}

export default QA_TOOLS ? Probe : function QaCrashProbe(_props: Props) {
  return null
}
