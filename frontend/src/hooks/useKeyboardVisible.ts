import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/** True while the software keyboard is on screen. iOS gets the "will" events so layout moves with the keyboard; Android only fires "did". */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return visible
}
