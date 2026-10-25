import { Alert } from 'react-native'

// Declining a request and cancelling a booking can't be undone, so both ask
// first, with the same words wherever they're offered.

export function confirmDecline(renterName: string, onConfirm: () => void) {
  Alert.alert('Decline this request?', `${renterName} will be told, and those dates open up again.`, [
    { text: 'Keep request', style: 'cancel' },
    { text: 'Decline', style: 'destructive', onPress: onConfirm },
  ])
}

export function confirmCancel(otherName: string, onConfirm: () => void) {
  Alert.alert('Cancel this booking?', `This can't be undone, and ${otherName} will be told.`, [
    { text: 'Keep booking', style: 'cancel' },
    { text: 'Cancel booking', style: 'destructive', onPress: onConfirm },
  ])
}
