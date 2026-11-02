import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

export const SUPPORT_EMAIL = 'zoinksupport@gmail.com'

export const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

/** A plain-text email from SES_FROM_EMAIL. Throws whatever SES throws. */
export async function sendEmail(to: string, subject: string, text: string) {
  await sesClient.send(
    new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL!,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: subject }, Body: { Text: { Data: text } } },
    }),
  )
}
