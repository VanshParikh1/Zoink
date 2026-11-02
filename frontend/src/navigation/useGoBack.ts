import { useCallback } from 'react'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '.'

/**
 * Back that always goes somewhere: the previous screen, or the main tabs when
 * this screen is the first one (opened by a link or a notification, or after a
 * reset). Never a dead end.
 */
export function useGoBack() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  return useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack()
    else if (navigation.getState()?.routeNames.includes('MainApp')) navigation.navigate('MainApp')
  }, [navigation])
}
