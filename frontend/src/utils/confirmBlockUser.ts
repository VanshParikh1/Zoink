import { Alert } from 'react-native'
import { blockUser } from '../services/usersApi'
import { queryClient } from '../services/queryClient'
import { queryKeys } from '../services/queryKeys'
import { userMessage } from './userMessage'

// Confirm → block → onBlocked. Shared by PublicProfileScreen and
// ConversationThreadScreen so the warning copy stays identical in both.
export function confirmBlockUser(user: { id: string; name: string }, onBlocked: () => void) {
  Alert.alert(
    `Block ${user.name}?`,
    "They won't be able to message you or book your listings, and you won't see each other's listings or profile. " +
      'They won’t be notified. You can unblock them any time in Settings.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(user.id)
            // Their listings, profile and conversations disappear everywhere.
            queryClient.invalidateQueries({ queryKey: ['listings'] })
            queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
            queryClient.invalidateQueries({ queryKey: queryKeys.blocks })
            Alert.alert('User blocked', `You won't see ${user.name} on Zoink anymore.`)
            onBlocked()
          } catch (err: any) {
            Alert.alert('Could not block', userMessage(err, { action: 'Please try again.' }))
          }
        },
      },
    ],
  )
}
